document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DEL DOM ---
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('status');
    const dashboard = document.getElementById('dashboard');
    const resultsBody = document.getElementById('resultsBody');
    const chartCanvas = document.getElementById('sensorChart');

    // --- CONTROLES DE CALIBRACIÓN ---
    const peakColumnSelect = document.getElementById('peakColumn');
    const peakThresholdSlider = document.getElementById('peakThreshold');
    const minTimeSlider = document.getElementById('minTime');
    const idleThresholdSlider = document.getElementById('idleThreshold');
    
    // --- LABELS PARA MOSTRAR VALORES ---
    const peakThresholdValue = document.getElementById('peakThresholdValue');
    const minTimeValue = document.getElementById('minTimeValue');
    const idleThresholdValue = document.getElementById('idleThresholdValue');
    
    let chartInstance = null;
    let fullData = []; // Almacenará los datos del CSV para no tener que releerlos

    // --- MANEJADORES DE EVENTOS ---
    fileInput.addEventListener('change', handleFileSelect);
    peakColumnSelect.addEventListener('change', runAnalysis);
    peakThresholdSlider.addEventListener('input', () => {
        peakThresholdValue.textContent = peakThresholdSlider.value;
    });
    peakThresholdSlider.addEventListener('change', runAnalysis);
    minTimeSlider.addEventListener('input', () => {
        minTimeValue.textContent = minTimeSlider.value;
    });
    minTimeSlider.addEventListener('change', runAnalysis);
    idleThresholdSlider.addEventListener('input', () => {
        idleThresholdValue.textContent = idleThresholdSlider.value;
    });
    idleThresholdSlider.addEventListener('change', runAnalysis);


    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        statusDiv.textContent = `Cargando ${file.name}...`;
        const reader = new FileReader();
        reader.onload = (e) => {
            fullData = parseCSV(e.target.result);
            if(fullData.length > 0) {
                dashboard.style.display = 'grid';
                statusDiv.textContent = 'Archivo cargado. Ajusta los parámetros.';
                runAnalysis();
            } else {
                statusDiv.textContent = 'No se pudieron leer datos del archivo.';
            }
        };
        reader.readAsText(file);
    }

    function parseCSV(csvData) {
        try {
            const lines = csvData.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            return lines.slice(1).map(line => {
                const values = line.split(',');
                const rowData = {};
                headers.forEach((header, index) => {
                    rowData[header] = parseFloat(values[index]);
                });
                return rowData;
            });
        } catch (error) {
            console.error("Error parsing CSV:", error);
            return [];
        }
    }

    function runAnalysis() {
        if (fullData.length === 0) return;

        const params = {
            peakColumn: peakColumnSelect.value,
            peakThreshold: parseFloat(peakThresholdSlider.value),
            minTimeBetweenReps: parseFloat(minTimeSlider.value),
            idleSpeedThreshold: parseFloat(idleThresholdSlider.value)
        };
        
        const repetitions = detectRepetitions(fullData, params);
        displayResults(repetitions);
        updateChart(fullData, params, repetitions);
    }
    
    function detectRepetitions(data, params) {
        // --- ALGORITMO DE DETECCIÓN DE PICOS Y SEGMENTACIÓN ---

        // 1. Encontrar índices de picos que superen el umbral
        let peakIndices = [];
        for (let i = 1; i < data.length - 1; i++) {
            const current = data[i][params.peakColumn];
            const prev = data[i - 1][params.peakColumn];
            const next = data[i + 1][params.peakColumn];
            // Para picos negativos
            if (current < prev && current < next && current < params.peakThreshold) {
                peakIndices.push(i);
            }
        }

        // 2. Filtrar picos para mantener solo el más fuerte en un intervalo de tiempo
        let distinctPeakIndices = [];
        let i = 0;
        while (i < peakIndices.length) {
            let currentPeakIndex = peakIndices[i];
            let nextIndex = i + 1;
            
            // Agrupar picos cercanos
            while (nextIndex < peakIndices.length && 
                   (data[peakIndices[nextIndex]][`seconds_elapsed`] - data[currentPeakIndex][`seconds_elapsed`] < params.minTimeBetweenReps)) {
                // Mantener solo el pico más fuerte (el valor más bajo)
                if (data[peakIndices[nextIndex]][params.peakColumn] < data[currentPeakIndex][params.peakColumn]) {
                    currentPeakIndex = peakIndices[nextIndex];
                }
                nextIndex++;
            }
            distinctPeakIndices.push(currentPeakIndex);
            i = nextIndex;
        }

        // 3. Segmentar cada repetición y calcular métricas
        const repetitions = [];
        for (const peakIndex of distinctPeakIndices) {
            let startIndex = peakIndex;
            while (startIndex > 0 && Math.abs(data[startIndex-1][params.peakColumn]) > params.idleSpeedThreshold) {
                startIndex--;
            }

            let endIndex = peakIndex;
            while (endIndex < data.length - 1 && Math.abs(data[endIndex+1][params.peakColumn]) > params.idleSpeedThreshold) {
                endIndex++;
            }

            const repData = data.slice(startIndex, endIndex + 1);
            if (repData.length > 1) {
                const metrics = processSegment(repData, params.peakColumn);
                if (metrics) repetitions.push(metrics);
            }
        }
        return repetitions;
    }

    function processSegment(segmentData, peakColumn) {
        let concentricVels = [], eccentricVels = [];
        segmentData.forEach(p => {
            if (p[peakColumn] < 0) concentricVels.push(Math.abs(p[peakColumn]));
            if (p[peakColumn] > 0) eccentricVels.push(Math.abs(p[peakColumn]));
        });

        return {
            start: segmentData[0].seconds_elapsed,
            end: segmentData[segmentData.length - 1].seconds_elapsed,
            concentricMax: concentricVels.length > 0 ? Math.max(...concentricVels) : 0,
            eccentricMax: eccentricVels.length > 0 ? Math.max(...eccentricVels) : 0,
        };
    }

    function displayResults(repetitions) {
        resultsBody.innerHTML = '';
        repetitions.forEach((rep, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${rep.start.toFixed(2)}</td>
                <td>${rep.end.toFixed(2)}</td>
                <td>${(rep.end - rep.start).toFixed(2)}</td>
                <td>${rep.concentricMax.toFixed(2)}</td>
                <td>${rep.eccentricMax.toFixed(2)}</td>
            `;
            resultsBody.appendChild(row);
        });
    }

    function updateChart(data, params, repetitions) {
        if (chartInstance) {
            chartInstance.destroy();
        }

        const labels = data.map(p => p.seconds_elapsed);
        const peakData = data.map(p => p[params.peakColumn]);
        
        // Crear bandas de fondo para cada repetición detectada
        const backgroundColors = [];
        if(repetitions.length > 0) {
            const colors = ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)'];
            repetitions.forEach((rep, i) => {
                backgroundColors.push({
                    type: 'box',
                    xMin: rep.start,
                    xMax: rep.end,
                    yMin: -Infinity,
                    yMax: Infinity,
                    backgroundColor: colors[i % 2],
                    borderColor: 'transparent'
                });
            });
        }

        chartInstance = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: params.peakColumn,
                    data: peakData,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Segundos Transcurridos'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Valor del Sensor (rad/s)'
                        }
                    }
                },
                plugins: {
                    annotation: {
                        annotations: backgroundColors
                    },
                    legend: {
                        display: true
                    },
                    title: {
                        display: true,
                        text: 'Visualización de Datos del Sensor'
                    }
                }
            }
        });
    }
});