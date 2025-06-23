document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS DE DETECCIÓN (AJUSTABLES) ---
    const ROTATION_RATE_COLUMN = 'rotationRateX';
    const TIME_COLUMN = 'seconds_elapsed';
    const GRAVITY_Z_COLUMN = 'gravityZ';
    
    const PEAK_THRESHOLD = -2.0; // Velocidad mínima para ser un pico
    const MIN_SECONDS_BETWEEN_REPS = 1.0; // Distancia mínima entre picos
    const IDLE_SPEED_THRESHOLD = 0.5; // Velocidad para considerar "reposo"

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
        // 1. Parsear datos
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

        // 2. Encontrar picos de velocidad de subida
        let peakIndices = [];
        for (let i = 1; i < data.length - 1; i++) {
            const current = data[i][ROTATION_RATE_COLUMN];
            const prev = data[i - 1][ROTATION_RATE_COLUMN];
            const next = data[i + 1][ROTATION_RATE_COLUMN];
            if (current < prev && current < next && current < PEAK_THRESHOLD) {
                peakIndices.push(i);
            }
        }
        
        // 3. Filtrar picos para obtener uno por repetición
        let distinctPeakIndices = [];
        if (peakIndices.length > 0) {
            let lastPeakIndex = peakIndices[0];
            for (let i = 1; i < peakIndices.length; i++) {
                let currentPeakIndex = peakIndices[i];
                if (data[currentPeakIndex][TIME_COLUMN] - data[lastPeakIndex][TIME_COLUMN] < MIN_SECONDS_BETWEEN_REPS) {
                    // Si dos picos están muy juntos, nos quedamos con el más fuerte (el más negativo)
                    if (data[currentPeakIndex][ROTATION_RATE_COLUMN] < data[lastPeakIndex][ROTATION_RATE_COLUMN]) {
                        lastPeakIndex = currentPeakIndex;
                    }
                } else {
                    distinctPeakIndices.push(lastPeakIndex);
                    lastPeakIndex = currentPeakIndex;
                }
            }
            distinctPeakIndices.push(lastPeakIndex);
        }

        // 4. Segmentar y analizar cada repetición
        const repetitions = [];
        for (let i = 0; i < distinctPeakIndices.length; i++) {
            const peakIndex = distinctPeakIndices[i];
            
            // Buscar hacia atrás para encontrar el inicio
            let startIndex = peakIndex;
            while (startIndex > 0 && Math.abs(data[startIndex - 1][ROTATION_RATE_COLUMN]) > IDLE_SPEED_THRESHOLD) {
                startIndex--;
            }

            // Buscar hacia adelante para encontrar el fin
            let endIndex = peakIndex;
            // Primero, encontrar el punto más bajo del brazo (gravityZ más negativo) después del pico
            let lowestPointIndex = peakIndex;
            for (let j = peakIndex + 1; j < (distinctPeakIndices[i+1] || data.length); j++) {
                if (data[j][GRAVITY_Z_COLUMN] < data[lowestPointIndex][GRAVITY_Z_COLUMN]) {
                    lowestPointIndex = j;
                }
            }
            // Ahora, encontrar el punto de reposo después de que el brazo haya bajado
            endIndex = lowestPointIndex;
            while (endIndex < data.length - 1 && Math.abs(data[endIndex + 1][ROTATION_RATE_COLUMN]) > IDLE_SPEED_THRESHOLD) {
                endIndex++;
            }
            
            const rep = processSegment(data.slice(startIndex, endIndex + 1));
            if (rep) repetitions.push(rep);
        }

        return repetitions;
    }

    function processSegment(segmentData) {
        if (!segmentData || segmentData.length < 2) return null;

        const rep = {
            start: segmentData[0][TIME_COLUMN],
            end: segmentData[segmentData.length - 1][TIME_COLUMN]
        };

        let concentricVels = [];
        let eccentricVels = [];
        
        segmentData.forEach(point => {
            const rotX = point[ROTATION_RATE_COLUMN];
            if (rotX < 0) concentricVels.push(Math.abs(rotX));
            else if (rotX > 0) eccentricVels.push(Math.abs(rotX));
        });

        if (concentricVels.length > 0) {
            rep.concentricMax = Math.max(...concentricVels);
            rep.concentricAvg = concentricVels.reduce((a, b) => a + b, 0) / concentricVels.length;
        }

        if (eccentricVels.length > 0) {
            rep.eccentricMax = Math.max(...eccentricVels);
            rep.eccentricAvg = eccentricVels.reduce((a, b) => a + b, 0) / eccentricVels.length;
        }

        return (rep.concentricMax && rep.eccentricMax) ? rep : null; // Solo valida repeticiones completas
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