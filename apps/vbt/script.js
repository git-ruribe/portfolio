document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS CLAVE PARA LA DETECCIÓN ---
    const ROTATION_RATE_COLUMN = 'rotationRateX';
    
    // Umbral (negativo) para que un punto sea considerado un pico potencial.
    const PEAK_THRESHOLD = -2.0; 
    
    // Tiempo mínimo (en segundos) que debe pasar entre dos repeticiones.
    const MIN_TIME_BETWEEN_REPS = 1.0; 

    // Umbral de velocidad para definir cuándo el movimiento está "detenido" (inicio/fin de rep).
    const IDLE_SPEED_THRESHOLD = 0.5;

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
        // 1. Parsear el CSV
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

        // 2. Encontrar los índices de todos los picos negativos que superen el umbral
        let peakIndices = [];
        for (let i = 1; i < data.length - 1; i++) {
            const prev = data[i - 1][ROTATION_RATE_COLUMN];
            const current = data[i][ROTATION_RATE_COLUMN];
            const next = data[i + 1][ROTATION_RATE_COLUMN];
            
            if (current < prev && current < next && current < PEAK_THRESHOLD) {
                peakIndices.push(i);
            }
        }
        
        // 3. Filtrar picos que estén demasiado juntos en el tiempo
        let distinctPeakIndices = [];
        if (peakIndices.length > 0) {
            distinctPeakIndices.push(peakIndices[0]);
            let lastPeakTime = data[peakIndices[0]].seconds_elapsed;
            
            for (let i = 1; i < peakIndices.length; i++) {
                const currentIndex = peakIndices[i];
                const currentTime = data[currentIndex].seconds_elapsed;
                if (currentTime - lastPeakTime > MIN_TIME_BETWEEN_REPS) {
                    distinctPeakIndices.push(currentIndex);
                    lastPeakTime = currentTime;
                }
            }
        }

        // 4. Para cada pico, encontrar el inicio y el fin de la repetición
        const repetitions = [];
        for (const peakIndex of distinctPeakIndices) {
            let rep = {};

            // Buscar hacia atrás para encontrar el inicio de la repetición
            let startIndex = peakIndex;
            while (startIndex > 0 && Math.abs(data[startIndex][ROTATION_RATE_COLUMN]) > IDLE_SPEED_THRESHOLD) {
                startIndex--;
            }
            rep.start = data[startIndex].seconds_elapsed;

            // Buscar hacia adelante para encontrar el fin de la repetición
            let endIndex = peakIndex;
            while (endIndex < data.length - 1 && Math.abs(data[endIndex][ROTATION_RATE_COLUMN]) > IDLE_SPEED_THRESHOLD) {
                endIndex++;
            }
            // Asegurarnos de que el fin sea después del inicio
            if (endIndex <= startIndex) {
                endIndex = data.length -1;
            }
            rep.end = data[endIndex].seconds_elapsed;
            
            // 5. Calcular las métricas para el segmento de esta repetición
            const repData = data.slice(startIndex, endIndex + 1);
            let concentricData = [];
            let eccentricData = [];
            
            repData.forEach(point => {
                if (point[ROTATION_RATE_COLUMN] < 0) {
                    concentricData.push(Math.abs(point[ROTATION_RATE_COLUMN]));
                } else if (point[ROTATION_RATE_COLUMN] > 0) {
                    eccentricData.push(Math.abs(point[ROTATION_RATE_COLUMN]));
                }
            });

            if (concentricData.length > 0) {
                rep.concentricMax = Math.max(...concentricData);
                rep.concentricAvg = concentricData.reduce((a, b) => a + b, 0) / concentricData.length;
            }

            if (eccentricData.length > 0) {
                rep.eccentricMax = Math.max(...eccentricData);
                rep.eccentricAvg = eccentricData.reduce((a, b) => a + b, 0) / eccentricData.length;
            }

            // Solo añadir si la repetición tiene datos válidos
            if (rep.concentricMax) {
                repetitions.push(rep);
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
                <td>${(rep.concentricMax || 0).toFixed(2)}</td>
                <td>${(rep.concentricAvg || 0).toFixed(2)}</td>
                <td>${(rep.eccentricMax || 0).toFixed(2)}</td>
                <td>${(rep.eccentricAvg || 0).toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }
});