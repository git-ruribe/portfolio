document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // --- PARÁMETROS DE DETECCIÓN (AJUSTABLES) ---
    const ROTATION_RATE_COLUMN = 'rotationRateX';
    
    // Umbral de velocidad (rad/s) para que un punto sea considerado un "pico" de actividad.
    const PEAK_THRESHOLD = -2.5; 
    
    // Tiempo mínimo (en segundos) que debe haber entre dos repeticiones para contarlas por separado.
    const MIN_SECONDS_BETWEEN_REPS = 1.5; 
    
    // Umbral de velocidad (rad/s) para considerar que el movimiento se ha detenido (inicio/fin de la repetición).
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

        // 2. Encontrar todos los picos negativos que superen el umbral
        let peakIndices = [];
        for (let i = 1; i < data.length - 1; i++) {
            const current = data[i][ROTATION_RATE_COLUMN];
            const prev = data[i - 1][ROTATION_RATE_COLUMN];
            const next = data[i + 1][ROTATION_RATE_COLUMN];

            if (current < prev && current < next && current < PEAK_THRESHOLD) {
                peakIndices.push(i);
            }
        }
        
        // 3. Filtrar picos para asegurar que son de repeticiones distintas
        let distinctPeaks = [];
        if (peakIndices.length > 0) {
            let lastPeak = peakIndices[0];
            for (let i = 1; i < peakIndices.length; i++) {
                const currentPeak = peakIndices[i];
                // Si el pico actual es más fuerte (más negativo) que el último guardado, lo reemplaza
                if (data[currentPeak][ROTATION_RATE_COLUMN] < data[lastPeak][ROTATION_RATE_COLUMN]) {
                    lastPeak = currentPeak;
                }
                
                // Si el siguiente pico está lo suficientemente lejos en el tiempo, guardamos el último pico y empezamos de nuevo
                if (data[currentPeak].seconds_elapsed - data[lastPeak].seconds_elapsed > MIN_SECONDS_BETWEEN_REPS) {
                    distinctPeaks.push(lastPeak);
                    lastPeak = currentPeak;
                }
            }
            distinctPeaks.push(lastPeak); // Añadir el último pico detectado
        }

        // 4. Segmentar y analizar cada repetición alrededor de su pico
        const repetitions = [];
        for (const peakIndex of distinctPeaks) {
            let rep = {};

            // Buscar hacia atrás desde el pico para encontrar el inicio de la repetición
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
            rep.end = data[endIndex].seconds_elapsed;

            // 5. Extraer datos del segmento y calcular métricas
            const repData = data.slice(startIndex, endIndex + 1);
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