// --- 1. Event Listeners ---
document.getElementById('generateBtn').addEventListener('click', processData);

function processData() {
    const fileInput = document.getElementById('csvFileInput');
    
    if (!fileInput.files.length) {
        alert("Please upload a CSV file first.");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const csvText = e.target.result;
        const parsedResult = parseCSV(csvText);
        
        if (parsedResult.error) {
            alert(parsedResult.error);
            return;
        }

        if (!parsedResult.headers.includes('Opening Date')) {
            alert("Fatal Error: 'Opening Date' column missing. Found these headers instead: " + parsedResult.headers.join(', '));
            return;
        }

        runAnalysis(parsedResult.data);
    };

    reader.readAsText(file);
}

// --- 2. Semicolon CSV Parser ---
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return { error: "CSV doesn't contain enough data." };

    const headers = lines[0].split(';').map(h => h.trim().replace(/^["\uFEFF]+|["]+$/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(';');
        let ticket = {};
        headers.forEach((header, index) => {
            ticket[header] = row[index] ? row[index].trim().replace(/^["]+|["]+$/g, '') : '';
        });
        data.push(ticket);
    }

    return { data, headers, error: null };
}

// --- 3. Analysis Routing ---
function runAnalysis(tickets) {
    const analysisType = document.getElementById('analysisType').value;
    const interval = document.getElementById('interval').value;
    
    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;
    
    let startDate = startInput ? new Date(startInput + 'T00:00:00') : null;
    let endDate = endInput ? new Date(endInput + 'T23:59:59') : null;

    let aggregatedData = [];

    if (analysisType === 'ticketsOpened') {
        aggregatedData = analyzeTicketsOpened(tickets, interval, startDate, endDate);
    } else if (analysisType === 'activeTickets') {
        aggregatedData = analyzeActiveTickets(tickets, interval, startDate, endDate);
    } else if (analysisType === 'activeTicketsAge') {
        aggregatedData = analyzeActiveTicketsByAge(tickets, interval, startDate, endDate);
    } else if (analysisType === 'activeTicketsAgeV2') {
        aggregatedData = analyzeActiveTicketsByAgeV2(tickets, interval, startDate, endDate);
    } else if (analysisType === 'activeTicketsAgeV3') {
        aggregatedData = analyzeActiveTicketsByAgeV3(tickets, interval, startDate, endDate);
    } else if (analysisType === 'categoryPie') {
        aggregatedData = analyzeTicketsByCategory(tickets, startDate, endDate);
    } else if (analysisType === 'entityPie') {
        aggregatedData = analyzeTicketsByEntity(tickets, startDate, endDate);
    }
    
    drawGraph(aggregatedData);
}

// --- Helper for Interval Grouping ---
function getIntervalKey(date, interval) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    if (interval === 'daily') return `${yyyy}-${mm}-${dd}`;
    if (interval === 'monthly') return `${yyyy}-${mm}`;
    if (interval === 'yearly') return `${yyyy}`;
    
    if (interval === 'weekly') {
        const day = d.getDay();
        const diff = d.getDate() - day;
        const weekStart = new Date(d.setDate(diff));
        
        const wYyyy = weekStart.getFullYear();
        const wMm = String(weekStart.getMonth() + 1).padStart(2, '0');
        const wDd = String(weekStart.getDate()).padStart(2, '0');
        return `${wYyyy}-${wMm}-${wDd} (Wk)`;
    }
}

// --- Helper for Ticket Pre-processing ---
function preprocessTickets(tickets) {
    const processed = tickets.map(ticket => {
        const startStr = ticket['Opening Date'];
        const status = (ticket['Status'] || '').toLowerCase().trim();
        const isClosed = status.includes('solved') || status.includes('closed');
        const endStr = isClosed ? ticket['Last Update'] : null; 
        
        const openDate = startStr ? new Date(startStr.replace(' ', 'T')) : null;
        const closeDate = endStr ? new Date(endStr.replace(' ', 'T')) : new Date(); 

        return { openDate, closeDate, original: ticket };
    }).filter(t => t.openDate && !isNaN(t.openDate.getTime()));

    return processed;
}

// --- 3A. Tickets Opened Function ---
function analyzeTicketsOpened(tickets, interval, startDate, endDate) {
    const counts = {};

    tickets.forEach(ticket => {
        const dateString = ticket['Opening Date'];
        if (!dateString) return;

        const date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return; 
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        let key = getIntervalKey(date, interval);
        counts[key] = (counts[key] || 0) + 1;
    });

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3B. Active/Open Tickets Function ---
function analyzeActiveTickets(tickets, interval, userStartDate, userEndDate) {
    const counts = {};
    const processedTickets = preprocessTickets(tickets);
    
    let minDate = userStartDate;
    let maxDate = userEndDate || new Date(); 

    if (!minDate) {
        let earliest = new Date();
        processedTickets.forEach(t => { if (t.openDate < earliest) earliest = t.openDate; });
        minDate = earliest;
    }

    let currentDate = new Date(minDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= maxDate) {
        const key = getIntervalKey(currentDate, interval);

        if (counts[key] === undefined) {
            counts[key] = 0;
            let intervalEvalDate = new Date(currentDate);

            if (interval === 'monthly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            } else if (interval === 'yearly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
            } else if (interval === 'weekly') {
                const day = intervalEvalDate.getDay();
                const diff = intervalEvalDate.getDate() + (6 - day);
                intervalEvalDate.setDate(diff);
                intervalEvalDate.setHours(23, 59, 59, 999);
            } else {
                intervalEvalDate.setHours(23, 59, 59, 999);
            }

            processedTickets.forEach(ticket => {
                if (ticket.openDate <= intervalEvalDate && ticket.closeDate >= intervalEvalDate) {
                    counts[key]++;
                }
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3C. Active Tickets by Age (V1 Stacked) ---
function analyzeActiveTicketsByAge(tickets, interval, userStartDate, userEndDate) {
    const counts = {};
    const processedTickets = preprocessTickets(tickets);
    
    let minDate = userStartDate;
    let maxDate = userEndDate || new Date();

    if (!minDate) {
        let earliest = new Date();
        processedTickets.forEach(t => { if (t.openDate < earliest) earliest = t.openDate; });
        minDate = earliest;
    }

    let currentDate = new Date(minDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= maxDate) {
        const key = getIntervalKey(currentDate, interval);

        if (counts[key] === undefined) {
            counts[key] = { w1: 0, w2: 0, w3: 0, w4: 0, w5plus: 0, total: 0, isStacked: true, stackType: 'v1' };
            let intervalEvalDate = new Date(currentDate);

            if (interval === 'monthly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            } else if (interval === 'yearly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
            } else if (interval === 'weekly') {
                const day = intervalEvalDate.getDay();
                const diff = intervalEvalDate.getDate() + (6 - day);
                intervalEvalDate.setDate(diff);
                intervalEvalDate.setHours(23, 59, 59, 999);
            } else {
                intervalEvalDate.setHours(23, 59, 59, 999);
            }

            processedTickets.forEach(ticket => {
                if (ticket.openDate <= intervalEvalDate && ticket.closeDate >= intervalEvalDate) {
                    counts[key].total++;
                    const ageDays = (intervalEvalDate - ticket.openDate) / (1000 * 60 * 60 * 24);
                    
                    if (ageDays <= 7) counts[key].w1++;
                    else if (ageDays <= 14) counts[key].w2++;
                    else if (ageDays <= 21) counts[key].w3++;
                    else if (ageDays <= 28) counts[key].w4++;
                    else counts[key].w5plus++;
                }
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3D. Active Tickets by Age (V2 10+ Weeks Stacked) ---
function analyzeActiveTicketsByAgeV2(tickets, interval, userStartDate, userEndDate) {
    const counts = {};
    const processedTickets = preprocessTickets(tickets);
    
    let minDate = userStartDate;
    let maxDate = userEndDate || new Date();

    if (!minDate) {
        let earliest = new Date();
        processedTickets.forEach(t => { if (t.openDate < earliest) earliest = t.openDate; });
        minDate = earliest;
    }

    let currentDate = new Date(minDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= maxDate) {
        const key = getIntervalKey(currentDate, interval);

        if (counts[key] === undefined) {
            counts[key] = { 
                w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, 
                w6: 0, w7: 0, w8: 0, w9: 0, w10: 0, 
                w11plus: 0, total: 0, isStacked: true, stackType: 'v2' 
            };
            
            let intervalEvalDate = new Date(currentDate);

            if (interval === 'monthly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            } else if (interval === 'yearly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
            } else if (interval === 'weekly') {
                const day = intervalEvalDate.getDay();
                const diff = intervalEvalDate.getDate() + (6 - day);
                intervalEvalDate.setDate(diff);
                intervalEvalDate.setHours(23, 59, 59, 999);
            } else {
                intervalEvalDate.setHours(23, 59, 59, 999);
            }

            processedTickets.forEach(ticket => {
                if (ticket.openDate <= intervalEvalDate && ticket.closeDate >= intervalEvalDate) {
                    counts[key].total++;
                    const ageDays = (intervalEvalDate - ticket.openDate) / (1000 * 60 * 60 * 24);
                    
                    if (ageDays <= 7) counts[key].w1++;
                    else if (ageDays <= 14) counts[key].w2++;
                    else if (ageDays <= 21) counts[key].w3++;
                    else if (ageDays <= 28) counts[key].w4++;
                    else if (ageDays <= 35) counts[key].w5++;
                    else if (ageDays <= 42) counts[key].w6++;
                    else if (ageDays <= 49) counts[key].w7++;
                    else if (ageDays <= 56) counts[key].w8++;
                    else if (ageDays <= 63) counts[key].w9++;
                    else if (ageDays <= 70) counts[key].w10++;
                    else counts[key].w11plus++;
                }
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3E. Active Tickets by Age (V3 10+ Weeks Stacked, Flipped) ---
function analyzeActiveTicketsByAgeV3(tickets, interval, userStartDate, userEndDate) {
    const counts = {};
    const processedTickets = preprocessTickets(tickets);
    
    let minDate = userStartDate;
    let maxDate = userEndDate || new Date();

    if (!minDate) {
        let earliest = new Date();
        processedTickets.forEach(t => { if (t.openDate < earliest) earliest = t.openDate; });
        minDate = earliest;
    }

    let currentDate = new Date(minDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= maxDate) {
        const key = getIntervalKey(currentDate, interval);

        if (counts[key] === undefined) {
            counts[key] = { 
                w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, 
                w6: 0, w7: 0, w8: 0, w9: 0, w10: 0, 
                w11plus: 0, total: 0, isStacked: true, stackType: 'v3' 
            };
            
            let intervalEvalDate = new Date(currentDate);

            if (interval === 'monthly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            } else if (interval === 'yearly') {
                intervalEvalDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
            } else if (interval === 'weekly') {
                const day = intervalEvalDate.getDay();
                const diff = intervalEvalDate.getDate() + (6 - day);
                intervalEvalDate.setDate(diff);
                intervalEvalDate.setHours(23, 59, 59, 999);
            } else {
                intervalEvalDate.setHours(23, 59, 59, 999);
            }

            processedTickets.forEach(ticket => {
                if (ticket.openDate <= intervalEvalDate && ticket.closeDate >= intervalEvalDate) {
                    counts[key].total++;
                    const ageDays = (intervalEvalDate - ticket.openDate) / (1000 * 60 * 60 * 24);
                    
                    if (ageDays <= 7) counts[key].w1++;
                    else if (ageDays <= 14) counts[key].w2++;
                    else if (ageDays <= 21) counts[key].w3++;
                    else if (ageDays <= 28) counts[key].w4++;
                    else if (ageDays <= 35) counts[key].w5++;
                    else if (ageDays <= 42) counts[key].w6++;
                    else if (ageDays <= 49) counts[key].w7++;
                    else if (ageDays <= 56) counts[key].w8++;
                    else if (ageDays <= 63) counts[key].w9++;
                    else if (ageDays <= 70) counts[key].w10++;
                    else counts[key].w11plus++;
                }
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3F. Tickets by Category (Pie Chart) ---
function analyzeTicketsByCategory(tickets, startDate, endDate) {
    const counts = {};

    tickets.forEach(ticket => {
        const dateString = ticket['Opening Date'];
        if (!dateString) return;

        const date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return; 
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        let category = ticket['Category'] || 'Uncategorized';
        counts[category] = (counts[category] || 0) + 1;
    });

    const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return sortedKeys.map(key => ({ label: key, value: counts[key], isPie: true, chartTitle: 'Tickets by Category' }));
}

// --- 3G. Tickets by Entity (Pie Chart) ---
function analyzeTicketsByEntity(tickets, startDate, endDate) {
    const counts = {};

    tickets.forEach(ticket => {
        const dateString = ticket['Opening Date'];
        if (!dateString) return;

        const date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return; 
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        let rawEntity = ticket['Entity'] || 'Unassigned';
        
        let targetString = rawEntity;
        if (rawEntity.includes('>')) {
            targetString = rawEntity.split('>').pop().trim();
        } else {
            targetString = rawEntity.trim();
        }

        let entityAbbr = targetString
            .split(/\s+/)
            .filter(word => word.length > 0)
            .map(word => word[0].toUpperCase())
            .join('');

        if (!entityAbbr) {
            entityAbbr = 'Unassigned';
        }

        counts[entityAbbr] = (counts[entityAbbr] || 0) + 1;
    });

    const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return sortedKeys.map(key => ({ label: key, value: counts[key], isPie: true, chartTitle: 'Tickets by Entity/Building' }));
}

// --- 4. Drawing Logic ---
function drawGraph(data) {
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    
    const userWidth = document.getElementById('canvasWidth').value;
    const userHeight = document.getElementById('canvasHeight').value;
    canvas.width = userWidth ? parseInt(userWidth) : 1000;
    canvas.height = userHeight ? parseInt(userHeight) : 500;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
        ctx.font = "20px Arial";
        ctx.fillStyle = '#000';
        ctx.fillText("No data found for this range.", 50, 50);
        return;
    }

    // --- PIE CHART DRAWING LOGIC ---
    if (data[0].isPie) {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        let startAngle = 0;
        
        const centerX = canvas.width * 0.35;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 40;

        const colors = [
            '#4A90E2', '#50E3C2', '#B8E986', '#F5A623', '#D0021B', 
            '#BD10E0', '#9013FE', '#8B572A', '#417505', '#F8E71C',
            '#00BCD4', '#FF9800', '#9E9E9E', '#607D8B', '#E91E63'
        ];

        data.forEach((item, index) => {
            const sliceAngle = (item.value / total) * 2 * Math.PI;
            const color = colors[index % colors.length];

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            const legendStartX = (canvas.width * 0.70);
            const legendStartY = 40 + (index * 25);
            
            if (legendStartY < canvas.height - 20) {
                ctx.fillStyle = color;
                ctx.fillRect(legendStartX, legendStartY - 12, 15, 15);
                ctx.fillStyle = '#000';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = "14px Arial";
                
                const percentage = ((item.value / total) * 100).toFixed(1);
                let labelStr = item.label.length > 30 ? item.label.substring(0, 27) + "..." : item.label;
                ctx.fillText(`${labelStr} - ${item.value} (${percentage}%)`, legendStartX + 25, legendStartY - 4);
            }

            startAngle += sliceAngle;
        });

        const chartTitle = data[0].chartTitle || 'Pie Chart';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.font = "bold 18px Arial";
        ctx.fillText(`${chartTitle} (Total: ${total})`, centerX, 30);

        return; 
    }

    // --- BAR CHART DRAWING LOGIC ---
    const isStacked = data[0].value && data[0].value.isStacked === true;
    const isV2 = isStacked && data[0].value.stackType === 'v2';
    const isV3 = isStacked && data[0].value.stackType === 'v3';
    const isV2orV3 = isV2 || isV3;

    const paddingTop = isStacked ? (isV2orV3 ? 80 : 50) : 50;
    const paddingSides = 60;
    const paddingBottom = 120; 
    
    const graphWidth = canvas.width - (paddingSides * 2);
    const graphHeight = canvas.height - (paddingTop + paddingBottom);
    
    const maxValue = isStacked 
        ? Math.max(...data.map(d => d.value.total)) 
        : Math.max(...data.map(d => d.value));
    
    if (isStacked) {
        // Keep the legend reading 1 -> 10+ normally so it's easy to read left-to-right
        const legendItems = isV2orV3 ? [
            { label: '1 Wk', color: '#2E7D32' },  
            { label: '2 Wk', color: '#4CAF50' },  
            { label: '3 Wk', color: '#8BC34A' },  
            { label: '4 Wk', color: '#CDDC39' },  
            { label: '5 Wk', color: '#FFEB3B' },  
            { label: '6 Wk', color: '#FFC107' },  
            { label: '7 Wk', color: '#FF9800' },  
            { label: '8 Wk', color: '#FF5722' },  
            { label: '9 Wk', color: '#E53935' },  
            { label: '10 Wk', color: '#B71C1C' }, 
            { label: '10+ Wk', color: '#9C27B0' } 
        ] : [
            { label: '<= 1 Week', color: '#4CAF50' },
            { label: '2 Weeks', color: '#FFC107' },  
            { label: '3 Weeks', color: '#FF9800' },   
            { label: '4 Weeks', color: '#F44336' },   
            { label: '> 4 Weeks', color: '#9C27B0' }  
        ];
        
        let legendX = paddingSides;
        let legendY = 15;
        ctx.font = "14px Arial";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        legendItems.forEach(item => {
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX, legendY, 15, 15);
            ctx.fillStyle = '#000';
            ctx.fillText(item.label, legendX + 20, legendY + 8);
            
            legendX += isV2orV3 ? 75 : 100; 
            if (legendX > canvas.width - paddingSides - 50) {
                legendX = paddingSides;
                legendY += 25;
            }
        });
    }

    ctx.beginPath();
    ctx.moveTo(paddingSides, paddingTop);
    ctx.lineTo(paddingSides, canvas.height - paddingBottom); 
    ctx.lineTo(canvas.width - paddingSides, canvas.height - paddingBottom); 
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    const barWidth = graphWidth / data.length;

    data.forEach((item, index) => {
        const x = paddingSides + (index * barWidth);
        const gap = Math.min(10, barWidth * 0.1);
        let currentY = canvas.height - paddingBottom;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = barWidth < 20 ? "10px Arial" : "14px Arial"; 

        if (isStacked) {
            let buckets = [];
            const bucketsV2 = [
                { key: 'w1', color: '#2E7D32' },
                { key: 'w2', color: '#4CAF50' },
                { key: 'w3', color: '#8BC34A' },
                { key: 'w4', color: '#CDDC39' },
                { key: 'w5', color: '#FFEB3B' },
                { key: 'w6', color: '#FFC107' },
                { key: 'w7', color: '#FF9800' },
                { key: 'w8', color: '#FF5722' },
                { key: 'w9', color: '#E53935' },
                { key: 'w10', color: '#B71C1C' },
                { key: 'w11plus', color: '#9C27B0' }
            ];

            if (isV3) {
                // Flip the array so 11plus gets drawn first (at the bottom)
                buckets = [...bucketsV2].reverse();
            } else if (isV2) {
                buckets = bucketsV2;
            } else {
                buckets = [
                    { key: 'w1', color: '#4CAF50' },
                    { key: 'w2', color: '#FFC107' },
                    { key: 'w3', color: '#FF9800' },
                    { key: 'w4', color: '#F44336' },
                    { key: 'w5plus', color: '#9C27B0' }
                ];
            }

            buckets.forEach(b => {
                const count = item.value[b.key];
                if (count > 0) {
                    const h = (count / maxValue) * graphHeight;
                    currentY -= h; 
                    ctx.fillStyle = b.color;
                    ctx.fillRect(x + (gap/2), currentY, barWidth - gap, h);
                }
            });

            ctx.fillStyle = '#000';
            ctx.fillText(item.value.total, x + (barWidth / 2), currentY - 5);

        } else {
            const barHeight = maxValue === 0 ? 0 : (item.value / maxValue) * graphHeight;
            const y = canvas.height - paddingBottom - barHeight;
            ctx.fillStyle = '#4A90E2';
            ctx.fillRect(x + (gap/2), y, barWidth - gap, barHeight);
            ctx.fillStyle = '#000';
            ctx.fillText(item.value, x + (barWidth / 2), y - 5);
        }
        
        ctx.save();
        ctx.translate(x + (barWidth / 2), canvas.height - paddingBottom + 10); 
        ctx.rotate(-Math.PI / 2); 
        ctx.textAlign = 'right'; 
        ctx.textBaseline = 'middle';
        ctx.font = "12px Arial";
        ctx.fillText(item.label, 0, 0); 
        ctx.restore(); 
    });
}