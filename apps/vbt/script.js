document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS CLAVE PARA LA DETECCIÓN ---

    // Umbral de velocidad angular (rad/s) para iniciar una repetición de subida.
    const CONCENTRIC_THRESHOLD = -1.5; 
    
    // Umbral de velocidad para considerar que el movimiento se ha detenido.
    const IDLE_VELOCITY_THRESHOLD = 0.5;

    // Umbral del vector de gravedad en el eje Z para confirmar que el brazo está en reposo (extendido hacia abajo).
    // El valor es negativo porque la parte superior del reloj apunta hacia arriba.
    const IDLE_GRAVITY_Z_THRESHOLD = -0.8;

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

        // --- ALGORITMO DE DETECCIÓN MEJORADO ---
        let state = 'IDLE'; // Estados: IDLE, CONCENTRIC, ECCENTRIC
        const repetitions = [];
        let currentRep = {};
        let concentricData = [];
        let eccentricData = [];

        for (let i = 1; i < data.length; i++) {
            const point = data[i];
            const prevPoint = data[i-1];
            const rotX = point.rotationRateX;

            if (state === 'IDLE') {
                if (rotX < CONCENTRIC_THRESHOLD) {
                    state = 'CONCENTRIC';
                    currentRep = { start: point.seconds_elapsed };
                    concentricData.push(rotX);
                }
            } else if (state === 'CONCENTRIC') {
                // La transición ocurre cuando la velocidad cruza de negativa a positiva.
                if (prevPoint.rotationRateX < 0 && rotX >= 0) {
                    state = 'ECCENTRIC';
                    eccentricData.push(rotX);
                    
                    // Calcular métricas de la fase concéntrica (subida)
                    const concentricVels = concentricData.map(v => Math.abs(v));
                    currentRep.concentricMax = Math.max(...concentricVels);
                    currentRep.concentricAvg = concentricVels.reduce((a, b) => a + b, 0) / concentricVels.length;
                    concentricData = [];
                } else {
                    concentricData.push(rotX);
                }
            } else if (state === 'ECCENTRIC') {
                // La repetición termina solo si la velocidad es baja Y el brazo ha vuelto a la posición inicial.
                if (Math.abs(rotX) < IDLE_VELOCITY_THRESHOLD && point.gravityZ < IDLE_GRAVITY_Z_THRESHOLD) {
                    state = 'IDLE';
                    currentRep.end = point.seconds_elapsed;

                    // Calcular métricas de la fase excéntrica (bajada)
                    const eccentricVels = eccentricData.map(v => Math.abs(v));
                    if (eccentricVels.length > 0) {
                        currentRep.eccentricMax = Math.max(...eccentricVels);
                        currentRep.eccentricAvg = eccentricVels.reduce((a, b) => a + b, 0) / eccentricVels.length;
                    } else {
                        currentRep.eccentricMax = 0;
                        currentRep.eccentricAvg = 0;
                    }
                    
                    repetitions.push(currentRep);
                    eccentricData = [];
                } else {
                    eccentricData.push(rotX);
                }
            }
        }
        return repetitions;
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
                <td>${rep.concentricMax.toFixed(2)}</td>
                <td>${rep.concentricAvg.toFixed(2)}</td>
                <td>${(rep.eccentricMax || 0).toFixed(2)}</td>
                <td>${(rep.eccentricAvg || 0).toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }
});