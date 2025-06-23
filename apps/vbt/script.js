document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos del DOM
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const controlsContainer = document.getElementById('controlsContainer');
    const slider = document.getElementById('sensitivitySlider');
    const sliderValueSpan = document.getElementById('sensitivityValue');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsBody = document.getElementById('resultsBody');

    // Variable global para almacenar los datos parseados
    let parsedData = [];

    // --- PARÁMETROS DE DETECCIÓN ---
    const MIN_TIME_BETWEEN_REPS = 1.0; 
    const IDLE_SPEED_THRESHOLD = 1.0; 

    // Evento para cargar el archivo
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            statusDiv.textContent = `Cargando ${file.name}...`;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    parsedData = parseCSVAndCalcMagnitudes(e.target.result);
                    controlsContainer.style.display = 'block';
                    runAnalysis(); 
                } catch (error) {
                    statusDiv.textContent = `Error al procesar el archivo: ${error.message}`;
                    console.error(error);
                }
            };
            reader.readAsText(file);
        }
    });

    // Evento para re-analizar cuando el slider cambia
    slider.addEventListener('input', () => {
        sliderValueSpan.textContent = parseFloat(slider.value).toFixed(1);
        if (parsedData.length > 0) {
            runAnalysis();
        }
    });
    
    // Función para parsear el CSV y calcular las magnitudes
    function parseCSVAndCalcMagnitudes(csvData) {
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const values = line.split(',');
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = parseFloat(values[index]);
            });

            // Calcular magnitud de rotación
            const rx = rowData.rotationRateX || 0;
            const ry = rowData.rotationRateY || 0;
            const rz = rowData.rotationRateZ || 0;
            rowData.rotationMagnitude = Math.sqrt(rx*rx + ry*ry + rz*rz);

            // *** NUEVO CÁLCULO DE MAGNITUD DE ACELERACIÓN ***
            const ax = rowData.accelerationX || 0;
            const ay = rowData.accelerationY || 0;
            const az = rowData.accelerationZ || 0;
            rowData.accelerationMagnitude = Math.sqrt(ax*ax + ay*ay + az*az);
            
            return rowData;
        });
    }

    // Función principal que ejecuta el análisis
    function runAnalysis() {
        const peakThreshold = parseFloat(slider.value);
        const repetitions = findRepetitions(parsedData, peakThreshold);
        displayResults(repetitions);
        statusDiv.textContent = `Análisis completado. Se detectaron ${repetitions.length} repeticiones.`;
    }

    // Algoritmo de detección de picos usando la magnitud de rotación
    function findRepetitions(data, peakThreshold) {
        let peakIndices = [];
        for (let i = 1; i < data.length - 1; i++) {
            if (data[i].rotationMagnitude > data[i - 1].rotationMagnitude &&
                data[i].rotationMagnitude > data[i + 1].rotationMagnitude &&
                data[i].rotationMagnitude > peakThreshold) {
                peakIndices.push(i);
            }
        }
        
        let distinctPeakIndices = [];
        if (peakIndices.length > 0) {
            let lastPeakIndex = peakIndices[0];
            for (let i = 1; i < peakIndices.length; i++) {
                if (data[peakIndices[i]].rotationMagnitude > data[lastPeakIndex].rotationMagnitude) {
                    lastPeakIndex = peakIndices[i];
                }
                if (data[peakIndices[i]].seconds_elapsed - data[peakIndices[i-1]].seconds_elapsed > MIN_TIME_BETWEEN_REPS) {
                    distinctPeakIndices.push(lastPeakIndex);
                    lastPeakIndex = peakIndices[i];
                }
            }
            distinctPeakIndices.push(lastPeakIndex);
        }

        const repetitions = [];
        for (const peakIndex of distinctPeakIndices) {
            let rep = {};

            let startIndex = peakIndex;
            while (startIndex > 0 && data[startIndex].rotationMagnitude > IDLE_SPEED_THRESHOLD) {
                startIndex--;
            }
            rep.start = data[startIndex].seconds_elapsed;

            let endIndex = peakIndex;
            while (endIndex < data.length - 1 && (data[endIndex].rotationMagnitude > IDLE_SPEED_THRESHOLD || data[endIndex].seconds_elapsed - data[startIndex].seconds_elapsed < 1.0)) {
                endIndex++;
            }
            rep.end = data[endIndex].seconds_elapsed;
            
            const repData = data.slice(startIndex, endIndex + 1);
            let rotData = [];
            let accelData = [];
            
            repData.forEach(point => {
                rotData.push(Math.abs(point.rotationMagnitude));
                accelData.push(point.accelerationMagnitude);
            });

            if (rotData.length > 0) {
                rep.rotationMax = Math.max(...rotData);
                rep.rotationAvg = rotData.reduce((a, b) => a + b, 0) / rotData.length;
            }

            if (accelData.length > 0) {
                rep.accelerationMax = Math.max(...accelData);
                rep.accelerationAvg = accelData.reduce((a, b) => a + b, 0) / accelData.length;
            }

            if (rep.rotationMax) repetitions.push(rep);
        }
        return repetitions;
    }

    function displayResults(repetitions) {
        resultsContainer.style.display = repetitions.length > 0 ? 'block' : 'none';
        resultsBody.innerHTML = '';
        repetitions.forEach((rep, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${rep.start.toFixed(2)}</td>
                <td>${rep.end.toFixed(2)}</td>
                <td>${(rep.rotationMax || 0).toFixed(2)}</td>
                <td>${(rep.rotationAvg || 0).toFixed(2)}</td>
                <td>${(rep.accelerationMax || 0).toFixed(2)}</td>
                <td>${(rep.accelerationAvg || 0).toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }
});