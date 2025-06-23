document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS CLAVE PARA LA DETECCIÓN ---
    // Umbral de velocidad angular (rad/s) para iniciar una repetición.
    // Un valor negativo indica el inicio de la fase de subida (concéntrica).
    const CONCENTRIC_THRESHOLD = -1.5; 
    
    // Umbral para considerar que el movimiento ha terminado y se ha vuelto al reposo.
    const IDLE_THRESHOLD = 0.5;

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            statusDiv.textContent = `Cargando y procesando ${file.name}...`;
            resultsContainer.style.display = 'none';
            resultsBody.innerHTML = ''; // Limpiar resultados anteriores
            
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

        // --- ALGORITMO DE DETECCIÓN DE REPETICIONES ---
        let state = 'IDLE'; // Posibles estados: IDLE, CONCENTRIC, ECCENTRIC
        const repetitions = [];
        let currentRep = {};
        let concentricData = [];
        let eccentricData = [];

        for (const point of data) {
            const rotX = point.rotationRateX;

            if (state === 'IDLE') {
                if (rotX < CONCENTRIC_THRESHOLD) {
                    state = 'CONCENTRIC';
                    currentRep = { start: point.seconds_elapsed };
                    concentricData.push(rotX);
                }
            } else if (state === 'CONCENTRIC') {
                if (rotX >= 0) { // Transición de subida a bajada
                    state = 'ECCENTRIC';
                    eccentricData.push(rotX);
                    
                    // Calcular métricas de la fase concéntrica
                    const concentricVels = concentricData.map(v => Math.abs(v));
                    currentRep.concentricMax = Math.max(...concentricVels);
                    currentRep.concentricAvg = concentricVels.reduce((a, b) => a + b, 0) / concentricVels.length;
                    concentricData = []; // Resetear para la próxima repetición
                } else {
                    concentricData.push(rotX);
                }
            } else if (state === 'ECCENTRIC') {
                if (Math.abs(rotX) < IDLE_THRESHOLD) { // La repetición termina
                    state = 'IDLE';
                    currentRep.end = point.seconds_elapsed;

                    // Calcular métricas de la fase excéntrica
                    const eccentricVels = eccentricData.map(v => Math.abs(v));
                    if (eccentricVels.length > 0) {
                        currentRep.eccentricMax = Math.max(...eccentricVels);
                        currentRep.eccentricAvg = eccentricVels.reduce((a, b) => a + b, 0) / eccentricVels.length;
                    } else { // Si no hubo datos, poner 0
                        currentRep.eccentricMax = 0;
                        currentRep.eccentricAvg = 0;
                    }
                    
                    repetitions.push(currentRep);
                    eccentricData = []; // Resetear
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
        resultsBody.innerHTML = ''; // Limpiar de nuevo por si acaso

        repetitions.forEach((rep, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${rep.start.toFixed(2)}</td>
                <td>${rep.end.toFixed(2)}</td>
                <td>${rep.concentricMax.toFixed(2)}</td>
                <td>${rep.concentricAvg.toFixed(2)}</td>
                <td>${rep.eccentricMax.toFixed(2)}</td>
                <td>${rep.eccentricAvg.toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }
});