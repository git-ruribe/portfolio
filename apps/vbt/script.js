document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS DE DETECCIÓN (AJUSTABLES) ---
    const ROTATION_RATE_COLUMN = 'rotationRateX';
    
    // Umbral de velocidad (rad/s) para iniciar una repetición.
    const START_REP_THRESHOLD = -2.0; 
    
    // Umbral de velocidad para considerar que el movimiento se ha detenido.
    const END_REP_VELOCITY_THRESHOLD = 0.8;

    // Umbral del vector de gravedad en el eje Z para confirmar que el brazo está en reposo (extendido hacia abajo).
    const END_REP_GRAVITY_Z_THRESHOLD = -0.8;

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            statusDiv.textContent = `Cargando y procesando ${file.name}...`;
            resultsContainer.style.display = 'none';
            resultsBody.innerHTML = '';
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const repetitions = analyzeData(e.target.result);
                    displayResults(repetitions);
                    statusDiv.textContent = `Análisis completado. Se detectaron ${repetitions.length} repeticiones.`;
                } catch (error) {
                    statusDiv.textContent = `Error al procesar el archivo: ${error.message}`;
                    console.error(error);
                }
            };
            reader.onerror = () => {
                statusDiv.textContent = 'Error al leer el archivo.';
            };
            reader.readAsText(file);
        }
    });

    function analyzeData(csvData) {
        // 1. Parsear el CSV a un array de objetos
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = lines.slice(1).map(line => {
            const values = line.split(',');
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = parseFloat(values[index]);
            });
            return rowData;
        });

        // --- ALGORITMO DE DETECCIÓN FINAL ---
        let state = 'IDLE'; // Estados: IDLE, IN_REP
        const repetitions = [];
        let currentRepData = [];
        
        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const rotX = point[ROTATION_RATE_COLUMN];
            const gravityZ = point.gravityZ;

            if (state === 'IDLE') {
                if (rotX < START_REP_THRESHOLD) {
                    state = 'IN_REP';
                    currentRepData.push(point);
                }
            } else if (state === 'IN_REP') {
                currentRepData.push(point);

                // Condición de finalización: velocidad baja Y brazo en posición de reposo
                if (Math.abs(rotX) < END_REP_VELOCITY_THRESHOLD && gravityZ < END_REP_GRAVITY_Z_THRESHOLD) {
                    
                    // --- Procesar la repetición completada ---
                    const repMetrics = processRepetitionSegment(currentRepData);
                    if (repMetrics) {
                        repetitions.push(repMetrics);
                    }
                    
                    // Resetear para la siguiente repetición
                    currentRepData = [];
                    state = 'IDLE';
                }
            }
        }
        
        // Si el archivo termina y todavía estamos en una repetición, la procesamos
        if (currentRepData.length > 0) {
            const repMetrics = processRepetitionSegment(currentRepData);
            if (repMetrics) {
                repetitions.push(repMetrics);
            }
        }

        return repetitions;
    }

    function processRepetitionSegment(repData) {
        if (!repData || repData.length < 2) return null;

        const rep = {
            start: repData[0].seconds_elapsed,
            end: repData[repData.length - 1].seconds_elapsed
        };

        let concentricVels = [];
        let eccentricVels = [];

        repData.forEach(point => {
            const rotX = point[ROTATION_RATE_COLUMN];
            if (rotX < 0) {
                concentricVels.push(Math.abs(rotX));
            } else if (rotX > 0) {
                eccentricVels.push(Math.abs(rotX));
            }
        });

        if (concentricVels.length > 0) {
            rep.concentricMax = Math.max(...concentricVels);
            rep.concentricAvg = concentricVels.reduce((a, b) => a + b, 0) / concentricVels.length;
        }

        if (eccentricVels.length > 0) {
            rep.eccentricMax = Math.max(...eccentricVels);
            rep.eccentricAvg = eccentricVels.reduce((a, b) => a + b, 0) / eccentricVels.length;
        }

        return rep;
    }

    function displayResults(repetitions) {
        if (repetitions.length === 0) {
            statusDiv.textContent = 'No se detectaron repeticiones. Prueba ajustar los umbrales en el código.';
            return;
        }

        resultsContainer.style.display = 'block';
        resultsBody.innerHTML = '';

        repetitions.forEach((rep, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${rep.start.toFixed(2)}</td>
                <td>${rep.end.toFixed(2)}</td>
                <td>${(rep.concentricMax || 0).toFixed(2)}</td>
                <td>${(rep.concentricAvg || 0).toFixed(2)}</td>
                <td>${(rep.eccentricMax || 0).toFixed(2)}</td>
                <td>${(rep.eccentricAvg || 0).toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }
});