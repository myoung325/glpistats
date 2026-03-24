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
    const analysisDropdown = document.getElementById('analysisType');
    const analysisType = analysisDropdown.value;
    const chartTitle = analysisDropdown.options[analysisDropdown.selectedIndex].text;
    
    const interval = document.getElementById('interval').value;
    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;
    
    let startDate = startInput ? new Date(startInput + 'T00:00:00') : null;
    let endDate = endInput ? new Date(endInput + 'T23:59:59') : null;

    let aggregatedData = [];

    if (analysisType === 'ticketsOpened') {
        aggregatedData = analyzeTicketsOpened(tickets, interval, startDate, endDate);
    } else if (analysisType === 'ticketsClosed') {
        aggregatedData = analyzeTicketsClosed(tickets, interval, startDate, endDate);
    } else if (analysisType === 'openedVsClosed') {
        aggregatedData = analyzeOpenedVsClosed(tickets, interval, startDate, endDate);
    } else if (analysisType === 'percentClosed') { // <-- ADD THIS
        aggregatedData = analyzePercentClosed(tickets, interval, startDate, endDate);
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
    
    drawGraph(aggregatedData, chartTitle);
    
    // Trigger the new statistics generation
    generateStatsReport(tickets, startDate, endDate);
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

// --- 3A-2. Tickets Closed Function ---
function analyzeTicketsClosed(tickets, interval, startDate, endDate) {
    const counts = {};

    tickets.forEach(ticket => {
        // 1. We only care about tickets that are actually closed/solved
        const status = (ticket['Status'] || '').toLowerCase().trim();
        const isClosed = status.includes('solved') || status.includes('closed');
        if (!isClosed) return; 

        // 2. Grab the date it was closed
        const endString = ticket['Last Update'];
        if (!endString) return;

        const date = new Date(endString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return; 
        
        // 3. Respect the user's date filters based on the CLOSE date
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        // 4. Group it into the correct bar on the chart
        let key = getIntervalKey(date, interval);
        counts[key] = (counts[key] || 0) + 1;
    });

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3A-3. Opened vs Closed Function ---
function analyzeOpenedVsClosed(tickets, interval, startDate, endDate) {
    const counts = {};

    const initBucket = (key) => {
        if (!counts[key]) counts[key] = { opened: 0, closed: 0, isGrouped: true };
    };

    tickets.forEach(ticket => {
        // 1. Tally Opened Tickets
        const openStr = ticket['Opening Date'];
        if (openStr) {
            const openDate = new Date(openStr.replace(' ', 'T'));
            if (!isNaN(openDate.getTime())) {
                if ((!startDate || openDate >= startDate) && (!endDate || openDate <= endDate)) {
                    let key = getIntervalKey(openDate, interval);
                    initBucket(key);
                    counts[key].opened++;
                }
            }
        }

        // 2. Tally Closed Tickets
        const status = (ticket['Status'] || '').toLowerCase().trim();
        const isClosed = status.includes('solved') || status.includes('closed');
        if (isClosed) {
            const closeStr = ticket['Last Update'];
            if (closeStr) {
                const closeDate = new Date(closeStr.replace(' ', 'T'));
                if (!isNaN(closeDate.getTime())) {
                    if ((!startDate || closeDate >= startDate) && (!endDate || closeDate <= endDate)) {
                        let key = getIntervalKey(closeDate, interval);
                        initBucket(key);
                        counts[key].closed++;
                    }
                }
            }
        }
    });

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => ({ label: key, value: counts[key] }));
}

// --- 3A-4. Percent Closed Function ---
function analyzePercentClosed(tickets, interval, startDate, endDate) {
    const counts = {};

    tickets.forEach(ticket => {
        // We group these strictly by the date they were OPENED
        const openStr = ticket['Opening Date'];
        if (!openStr) return;

        const openDate = new Date(openStr.replace(' ', 'T'));
        if (isNaN(openDate.getTime())) return;

        // Respect date filters
        if ((startDate && openDate < startDate) || (endDate && openDate > endDate)) return;

        let key = getIntervalKey(openDate, interval);
        if (!counts[key]) counts[key] = { opened: 0, closed: 0, isPercentage: true };

        counts[key].opened++;

        // If it's closed (regardless of WHEN it closed), increment the closed tally for this cohort
        const status = (ticket['Status'] || '').toLowerCase().trim();
        const isClosed = status.includes('solved') || status.includes('closed');
        if (isClosed) {
            counts[key].closed++;
        }
    });

    const sortedKeys = Object.keys(counts).sort();
    return sortedKeys.map(key => {
        const data = counts[key];
        // Calculate percentage, preventing division by zero just in case
        const percentage = data.opened === 0 ? 0 : Math.round((data.closed / data.opened) * 100);
        
        return { 
            label: key, 
            value: { 
                percent: percentage, 
                opened: data.opened, 
                closed: data.closed,
                isPercentage: true 
            } 
        };
    });
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
    return sortedKeys.map(key => ({ label: key, value: counts[key], isPie: true }));
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
    return sortedKeys.map(key => ({ label: key, value: counts[key], isPie: true }));
}

// --- 4. Drawing Logic ---
function drawGraph(data, chartTitle = '') {
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

    // --- DRAW MAIN TITLE ---
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = "bold 20px Arial";
    
    if (data[0].isPie) {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        ctx.fillText(`${chartTitle} (Total: ${total})`, canvas.width / 2, 10);
    } else {
        ctx.fillText(chartTitle, canvas.width / 2, 10);
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
            const legendStartY = 50 + (index * 25);
            
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

        return; 
    }

    // --- BAR CHART DRAWING LOGIC ---
    const isStacked = data[0].value && data[0].value.isStacked === true;
    const isGrouped = data[0].value && data[0].value.isGrouped === true;
    const isPercentage = data[0].value && data[0].value.isPercentage === true; // NEW

    const isV2 = isStacked && data[0].value.stackType === 'v2';
    const isV3 = isStacked && data[0].value.stackType === 'v3';
    const isV2orV3 = isV2 || isV3;

    const paddingTop = (isStacked || isGrouped) ? (isV2orV3 ? 130 : 110) : 70;
    const paddingSides = 60;
    const paddingBottom = 120; 
    
    const graphWidth = canvas.width - (paddingSides * 2);
    const graphHeight = canvas.height - (paddingTop + paddingBottom);
    
    // NEW Max Value Logic
    let maxValue = 0;
    if (isStacked) {
        maxValue = Math.max(...data.map(d => d.value.total));
    } else if (isGrouped) {
        maxValue = Math.max(...data.map(d => Math.max(d.value.opened, d.value.closed)));
    } else if (isPercentage) {
        maxValue = 100; // Percentages are always out of 100!
    } else {
        maxValue = Math.max(...data.map(d => d.value));
    }
    
    if (isStacked) {
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
        
        ctx.font = "14px Arial";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        let legendY = 40; 
        const itemSpacing = 20; 
        let rows = [];
        let currentRow = [];
        let currentWidth = 0;
        
        // Measure and group legend items into rows to keep them perfectly centered
        legendItems.forEach(item => {
            const itemWidth = 15 + 5 + ctx.measureText(item.label).width + itemSpacing;
            if (currentWidth + itemWidth > canvas.width - (paddingSides * 2) && currentRow.length > 0) {
                rows.push({ items: currentRow, width: currentWidth - itemSpacing });
                currentRow = [item];
                currentWidth = itemWidth;
            } else {
                currentRow.push(item);
                currentWidth += itemWidth;
            }
        });
        if (currentRow.length > 0) {
            rows.push({ items: currentRow, width: currentWidth - itemSpacing });
        }

        // Draw the centered legend rows
        rows.forEach(row => {
            let startX = (canvas.width - row.width) / 2;
            
            row.items.forEach(item => {
                ctx.fillStyle = item.color;
                ctx.fillRect(startX, legendY - 7, 15, 15); // -7 to visually align box with text middle
                ctx.fillStyle = '#000';
                ctx.fillText(item.label, startX + 20, legendY);
                startX += 15 + 5 + ctx.measureText(item.label).width + itemSpacing;
            });
            legendY += 25;
        });
    } else if (isGrouped) {
        ctx.font = "14px Arial";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let startX = canvas.width / 2 - 60;
        
        // Opened Legend
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(startX, 35, 15, 15);
        ctx.fillStyle = '#000';
        ctx.fillText('Opened', startX + 45, 43);
        
        // Closed Legend
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(startX + 90, 35, 15, 15);
        ctx.fillStyle = '#000';
        ctx.fillText('Closed', startX + 135, 43);
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

        } else if (isGrouped) {
            const openedCount = item.value.opened;
            const closedCount = item.value.closed;
            
            // Split the available bar width in half
            const groupWidth = barWidth - gap;
            const subBarWidth = groupWidth / 2;

            // Draw Opened Bar (Blue, Left side)
            const openedHeight = maxValue === 0 ? 0 : (openedCount / maxValue) * graphHeight;
            const openedY = canvas.height - paddingBottom - openedHeight;
            ctx.fillStyle = '#4A90E2';
            ctx.fillRect(x + (gap/2), openedY, subBarWidth, openedHeight);
            
            // Draw Closed Bar (Green, Right side)
            const closedHeight = maxValue === 0 ? 0 : (closedCount / maxValue) * graphHeight;
            const closedY = canvas.height - paddingBottom - closedHeight;
            ctx.fillStyle = '#4CAF50';
            ctx.fillRect(x + (gap/2) + subBarWidth, closedY, subBarWidth, closedHeight);

            // Add the text numbers on top of both bars
            ctx.fillStyle = '#000';
            
            // NEW: Dynamically shrink font based on the sub-bar width
            const fontSize = subBarWidth < 25 ? 9 : 11; 
            ctx.font = `${fontSize}px Arial`;

            if (openedCount > 0) {
                ctx.fillText(openedCount, x + (gap/2) + (subBarWidth / 2), openedY - 5);
            }
            if (closedCount > 0) {
                ctx.fillText(closedCount, x + (gap/2) + subBarWidth + (subBarWidth / 2), closedY - 5);
            }
        } else if (isPercentage) {
            // NEW: Drawing logic for the Percentage bars
            const pct = item.value.percent;
            const barHeight = (pct / 100) * graphHeight;
            const y = canvas.height - paddingBottom - barHeight;
            
            // Let's use a nice distinct purple for this special metric
            ctx.fillStyle = '#9C27B0'; 
            ctx.fillRect(x, y, barWidth - gap, barHeight);
            
            // Draw the percentage text on top
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.fillText(pct + '%', x + (barWidth - gap) / 2, y - 5);

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

// --- 5. Statistics & Math Engine ---
function generateStatsReport(tickets, startDate, endDate) {
    // --- NEW: Filter tickets for BOTH the core tables AND Quick Insights ---
    const filteredTickets = tickets.filter(ticket => {
        const dateString = ticket['Opening Date'];
        if (!dateString) return false; 
        
        const openDate = new Date(dateString.replace(' ', 'T'));
        if (isNaN(openDate.getTime())) return false; 
        
        // Apply user's date filters
        if (startDate && openDate < startDate) return false;
        if (endDate && openDate > endDate) return false;
        
        return true; 
    });

    let resolutionTimes = [];
    let byCategory = {};
    let byEntity = {};

    // Use the filtered array for all remaining math
    filteredTickets.forEach(ticket => {
        const status = (ticket['Status'] || '').toLowerCase().trim();
        const isClosed = status.includes('solved') || status.includes('closed');
        if (!isClosed) return;

        const endString = ticket['Last Update'];
        if (!endString) return;

        const dateString = ticket['Opening Date'];
        const openDate = new Date(dateString.replace(' ', 'T'));
        const closeDate = new Date(endString.replace(' ', 'T'));
        
        if (isNaN(closeDate.getTime())) return;
        
        // Calculate time in Days
        const daysToResolve = (closeDate - openDate) / (1000 * 60 * 60 * 24);
        if (daysToResolve < 0) return; // Sanity check for weird GLPI data

        resolutionTimes.push(daysToResolve);

        // Group by Category
        let category = ticket['Category'] || 'Uncategorized';
        if (!byCategory[category]) byCategory[category] = [];
        byCategory[category].push(daysToResolve);

        // Group by Entity (using our existing abbreviation logic)
        let rawEntity = ticket['Entity'] || 'Unassigned';
        let targetString = rawEntity.includes('>') ? rawEntity.split('>').pop().trim() : rawEntity.trim();
        let entityAbbr = targetString.split(/\s+/).filter(w => w.length > 0).map(w => w[0].toUpperCase()).join('') || 'Unassigned';
        
        if (!byEntity[entityAbbr]) byEntity[entityAbbr] = [];
        byEntity[entityAbbr].push(daysToResolve);
    });

    // Helper math function for Mean, Median, and Standard Deviation
    const getStats = (arr) => {
        if (!arr.length) return { count: 0, mean: 0, median: 0, stdDev: 0 };
        
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        
        const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
        const stdDev = Math.sqrt(variance);
        
        return {
            count: arr.length,
            mean: mean.toFixed(2),
            median: median.toFixed(2),
            stdDev: stdDev.toFixed(2)
        };
    };

    const overall = getStats(resolutionTimes);
    
    // Convert objects to arrays and sort by volume (highest ticket count first)
    const catStats = Object.keys(byCategory).map(k => ({ name: k, ...getStats(byCategory[k]) })).sort((a, b) => b.count - a.count);
    const entStats = Object.keys(byEntity).map(k => ({ name: k, ...getStats(byEntity[k]) })).sort((a, b) => b.count - a.count);

    // Pass the FILTERED tickets down instead of the full raw array
    renderStatsHTML(overall, catStats, entStats, filteredTickets);
}

function renderStatsHTML(overall, categories, entities, tickets = []) {
    const container = document.getElementById('statsContainer');
    if (!container) return;

    // --- NEW: Calculate Quick Insights ---
    let sameDayCount = 0;
    let closedCount = 0;
    let totalOpenAgeDays = 0;
    let openTicketsWithAge = 0;
    let dayCounts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0}; // 0 = Sunday
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const now = new Date(); // Used to calculate age of open tickets

    tickets.forEach(t => {
        const openDateStr = t['Opening Date'] || t.openingDate || t['Opening date'];
        const updateDateStr = t['Last Update'] || t['Last update'] || t.lastUpdate;
        const status = t['Status'] || t.status;

        if (!openDateStr) return;
        const openDate = new Date(openDateStr);
        if (isNaN(openDate)) return;

        // 1. Busiest Day Math
        dayCounts[openDate.getDay()]++;

        const isClosed = status === 'Closed' || status === 'Solved';

        if (isClosed) {
            closedCount++;
            const closeDate = new Date(updateDateStr);
            if (!isNaN(closeDate) && openDate.toDateString() === closeDate.toDateString()) {
                // 2. Same-Day Resolution Math
                sameDayCount++;
            }
        } else {
            // 3. Mean Age of Open Tickets Math
            const ageMs = now - openDate;
            totalOpenAgeDays += (ageMs / (1000 * 60 * 60 * 24));
            openTicketsWithAge++;
        }
    });

    // Finalize Insight Variables
    const sameDayRate = closedCount > 0 ? ((sameDayCount / closedCount) * 100).toFixed(1) + '%' : 'N/A';
    const keepUpRatio = `${tickets.length} Opened / ${closedCount} Closed`;
    const meanOpenAge = openTicketsWithAge > 0 ? (totalOpenAgeDays / openTicketsWithAge).toFixed(1) + ' days' : '0 open tickets';
    
    let busiestDay = dayNames[0];
    let maxCount = dayCounts[0];
    for(let i=1; i<7; i++) {
        if(dayCounts[i] > maxCount) {
            maxCount = dayCounts[i];
            busiestDay = dayNames[i];
        }
    }

    // Top 5 / Bottom 5 Categories (using the already calculated categories array)
    const validCats = categories.filter(c => c.count > 0).sort((a, b) => a.mean - b.mean);
    const quickest = validCats.slice(0, 5).map(c => `• ${c.name} (${c.mean}d)`).join('<br>') || 'N/A';
    const slowest = validCats.slice(-5).reverse().map(c => `• ${c.name} (${c.mean}d)`).join('<br>') || 'N/A';

    // --- Existing Table Generators ---
    const makeTableContent = (title, dataArray, isOverall = false) => {
        if (!isOverall && dataArray.length === 0) return '';
        let rows = isOverall 
            ? `<tr>
                <td style="padding: 6px 8px; border: 1px solid #ddd; word-break: break-word;">All Closed Tickets</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${dataArray.count}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${dataArray.mean}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${dataArray.median}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${dataArray.stdDev}</td>
               </tr>`
            : dataArray.filter(d => d.count > 0).map(d => `<tr>
                <td style="padding: 6px 8px; border: 1px solid #ddd; word-break: break-word;">${d.name}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${d.count}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${d.mean}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${d.median}</td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">${d.stdDev}</td>
               </tr>`).join('');
        
        return `
            <h3 style="margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; color: #333; font-size: 16px;">${title}</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.1); background: #fff;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                            <th style="padding: 6px 8px; border: 1px solid #ddd;">Name</th>
                            <th style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">Count</th>
                            <th style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">Mean (Days)</th>
                            <th style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">Median</th>
                            <th style="padding: 6px 8px; border: 1px solid #ddd; white-space: nowrap;">Std Dev</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    };

// --- NEW: Insights Table Generator ---
    const makeInsightsTable = () => {
        if (tickets.length === 0) return ''; // Hide if no raw tickets are passed
        return `
            <h3 style="margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; color: #333; font-size: 16px;">💡 Quick Insights</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.1); background: #fff;">
                    <tbody>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa; width: 45%;">⚡ Same-Day Resolution</td>
                            <td style="padding: 8px;">${sameDayRate}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">📅 Busiest Day</td>
                            <td style="padding: 8px;">${busiestDay}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">⚖️ Keep Up Ratio</td>
                            <td style="padding: 8px;">${keepUpRatio}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">🧟 Mean Age (Open)</td>
                            <td style="padding: 8px;">${meanOpenAge}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">🏆 Quickest Categories</td>
                            <td style="padding: 8px; line-height: 1.4;">${quickest}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">🐌 Slowest Categories</td>
                            <td style="padding: 8px; line-height: 1.4;">${slowest}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    };

    // Render the final layout
    container.innerHTML = `
        <div style="width: 100%;">
            <h2 style="margin-top: 20px; color: #2c3e50; font-size: 20px;">📊 Resolution Time Statistics</h2>
            
            <div style="display: flex; flex-wrap: wrap; gap: 30px; margin-bottom: 30px;">
                <div style="flex: 1 1 300px; min-width: 0;">
                    ${makeTableContent('Overall Performance', overall, true)}
                    <div style="margin-top: 25px;">
                        ${makeTableContent('By Entity', entities)}
                    </div>
                </div>
                <div style="flex: 1 1 300px; min-width: 0;">
                    ${makeInsightsTable()} 
                </div>
            </div>

            <div style="width: 100%; margin-bottom: 30px;">
                ${makeTableContent('By Category (Sorted by Volume)', categories)}
            </div>
        </div>
    `;
}