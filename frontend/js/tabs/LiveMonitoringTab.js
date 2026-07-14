function LiveMonitoringTab({ api_url, currentUser }) {
    const [sessions, setSessions] = React.useState([]);
    const [partsList, setPartsList] = React.useState([]);
    const [selectedPart, setSelectedPart] = React.useState('');
    const [selectedLine, setSelectedLine] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [lastUpdatedTime, setLastUpdatedTime] = React.useState(new Date());
    const [analyticsPart, setAnalyticsPart] = React.useState(null);

    const chartRefs = React.useRef({ problem: null, part: null, line: null });
    const canvasRefs = {
        problem: React.useRef(null),
        part: React.useRef(null),
        line: React.useRef(null)
    };

    // Fetch master parts for the filter dropdown
    React.useEffect(() => {
        fetch(`${api_url}/api/master/parts`)
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') setPartsList(res.data);
            })
            .catch(err => console.error("Error fetching master parts:", err));
    }, [api_url]);

    // Fetch active live sessions
    const fetchSessions = async () => {
        try {
            const url = new URL(`${api_url}/api/dashboard/live-sessions`);
            if (selectedPart) url.searchParams.append('partNumber', selectedPart);
            if (selectedLine) url.searchParams.append('linePos', selectedLine);

            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') {
                setSessions(result.data);
                setLastUpdatedTime(new Date());
                renderCharts(result.data);
            }
        } catch (error) {
            console.error("Failed to fetch live sessions:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Poll for updates every 1 minute
    React.useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 60000);
        return () => clearInterval(interval);
    }, [selectedPart, selectedLine]);

    // Aggregate data and render charts dynamically
    const renderCharts = (data) => {
        setTimeout(() => {
            // Destroy existing charts to prevent canvas re-use errors
            Object.keys(chartRefs.current).forEach(key => {
                if (chartRefs.current[key]) {
                    chartRefs.current[key].destroy();
                    chartRefs.current[key] = null;
                }
            });

            if (!data || data.length === 0) return;

            // 1. Aggregate Pareto Problem (Defect Qty)
            const problemMap = {};
            data.forEach(s => {
                (s.problems_list || []).forEach(p => {
                    if (p.defectCode && p.defectCode !== '-') {
                        const cleanProblemName = p.problem.split('(')[0].trim();
                        const key = `${p.defectCode} - ${cleanProblemName}`;
                        problemMap[key] = (problemMap[key] || 0) + (p.qty || 1);
                    }
                });
            });
            const problemSorted = Object.entries(problemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const problemLabels = problemSorted.map(e => e[0]);
            const problemValues = problemSorted.map(e => e[1]);

            if (canvasRefs.problem.current && problemLabels.length > 0) {
                chartRefs.current.problem = new Chart(canvasRefs.problem.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: problemLabels,
                        datasets: [{
                            label: 'Jumlah Defect',
                            data: problemValues,
                            backgroundColor: '#f59e0b',
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true, grid: { display: false } }, y: { ticks: { font: { size: 9, weight: 'bold' } } } }
                    }
                });
            }

            // 2. Aggregate Pareto Part Number (Top NG Parts)
            const partMap = {};
            data.forEach(s => {
                if (s.part_number && s.total_ng > 0) {
                    partMap[s.part_number] = (partMap[s.part_number] || 0) + s.total_ng;
                }
            });
            const partSorted = Object.entries(partMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const partLabels = partSorted.map(e => e[0]);
            const partValues = partSorted.map(e => e[1]);

            if (canvasRefs.part.current && partLabels.length > 0) {
                chartRefs.current.part = new Chart(canvasRefs.part.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: partLabels,
                        datasets: [{
                            label: 'Total NG Frame',
                            data: partValues,
                            backgroundColor: '#ef4444',
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { display: false } }, x: { ticks: { font: { size: 9, weight: 'bold' } } } }
                    }
                });
            }

            // 3. Aggregate Pareto Line (Top NG Lines)
            const lineMap = {};
            data.forEach(s => {
                if (s.line_pos && s.total_ng > 0) {
                    lineMap[s.line_pos] = (lineMap[s.line_pos] || 0) + s.total_ng;
                }
            });
            const lineSorted = Object.entries(lineMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const lineLabels = lineSorted.map(e => e[0]);
            const lineValues = lineSorted.map(e => e[1]);

            if (canvasRefs.line.current && lineLabels.length > 0) {
                chartRefs.current.line = new Chart(canvasRefs.line.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: lineLabels.map(l => `Line ${l}`),
                        datasets: [{
                            label: 'Total NG Frame',
                            data: lineValues,
                            backgroundColor: '#3b82f6',
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { display: false } }, x: { ticks: { font: { size: 9, weight: 'bold' } } } }
                    }
                });
            }

            }, 100);
    };

    // Calculate dynamic stats
    let totalProd = 0;
    let totalOk = 0;
    let totalNgFrame = 0;
    let totalNgPoint = 0;
    let totalScrap = 0;
    let totalWeldPoints = 0;

    // Helper to group NG findings by (checkNo, problem) with count
    const groupNgFindings = (list) => {
        const map = {};
        (list || []).forEach(p => {
            if (p.checkNo === '-') return;
            const key = `${p.checkNo}|${p.problem}`;
            if (!map[key]) {
                map[key] = { ...p, count: 1 };
            } else {
                map[key].count += 1;
            }
        });
        return Object.values(map);
    };

    // Sort sessions by yield ascending (worst first)
    const displaySessions = sessions
        .sort((a, b) => {
            const yA = (a.total_ok + a.total_ng) > 0 ? a.total_ok / (a.total_ok + a.total_ng) : 1;
            const yB = (b.total_ok + b.total_ng) > 0 ? b.total_ok / (b.total_ok + b.total_ng) : 1;
            return yA - yB;
        });

    displaySessions.forEach(s => {
        const prod = (s.total_ok + s.total_ng);
        totalProd += prod;
        totalOk += s.total_ok;
        totalNgFrame += s.total_ng;
        totalScrap += s.total_scrap;
        
        // Sum NG point instances
        const ngPts = (s.problems_list || []).reduce((sum, p) => sum + (p.qty || 1), 0);
        totalNgPoint += ngPts;

        // Sum total welding points checked
        const pMaster = partsList.find(p => p.part_number === s.part_number);
        const pts = pMaster ? Number(pMaster.total_points || 0) : 0;
        totalWeldPoints += prod * pts;
    });

    const totalEff = displaySessions.reduce((sum, s) => sum + (Number(s.efficiency) || 0), 0);
    const avgEfficiency = displaySessions.length > 0 ? Math.round(totalEff / displaySessions.length) : 0;

    const frameOkRatio = totalProd > 0 ? ((totalOk / totalProd) * 100).toFixed(1) : 100;
    const pointOkRatio = totalWeldPoints > 0 ? (((totalWeldPoints - totalNgPoint) / totalWeldPoints) * 100).toFixed(1) : (totalProd > 0 ? frameOkRatio : 100);

    // Get list of lines dynamically for the dropdown
    const availableLines = [...new Set(displaySessions.map(s => s.line_pos))].filter(l => l !== '');

    return (
        <div className="space-y-2 flex flex-col min-h-screen p-2">
            
            {/* 1. Header with Glow Status */}
            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-sm border border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-blue-600/10 text-blue-600 rounded-xl flex items-center justify-center text-[10px] shadow-inner shrink-0">
                        <i className="fas fa-tower-broadcast animate-pulse"></i>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xs font-black text-slate-800 tracking-tight leading-none uppercase truncate">Live QC Inspection</h2>
                        <p className="text-[6.5px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Monitoring Operator Aktif Hari Ini</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                    <button 
                        onClick={fetchSessions}
                        className="bg-blue-600 hover:bg-blue-700 text-white w-7 h-7 rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all shrink-0"
                        title="Update Data"
                    >
                        <i className="fas fa-sync-alt text-[9px]"></i>
                    </button>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl shrink-0">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full absolute"></div>
                        <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest pl-0.5">Live</span>
                    </div>
                    <div className="text-right shrink-0 leading-tight">
                        <div className="text-[7px] font-bold text-slate-400">{lastUpdatedTime.toLocaleTimeString('id-ID')}</div>
                    </div>
                </div>
            </div>

            {/* 2. Interactive Control Filter Panel */}
            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
                <div>
                    <label className="block text-[6.5px] font-black text-slate-400 uppercase tracking-widest mb-1">Filter Part Number</label>
                    <select 
                        value={selectedPart}
                        onChange={(e) => setSelectedPart(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    >
                        <option value="">-- Semua Part --</option>
                        {partsList.map(p => (
                            <option key={p.part_number} value={p.part_number}>{p.part_number} - {p.part_name}</option>
                        ))}
                    </select>
                </div>
                
                <div>
                    <label className="block text-[6.5px] font-black text-slate-400 uppercase tracking-widest mb-1">Filter Line</label>
                    <select 
                        value={selectedLine}
                        onChange={(e) => setSelectedLine(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    >
                        <option value="">-- Semua Line --</option>
                        {availableLines.map(line => (
                            <option key={line} value={line}>Line {line}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-end">
                    <button 
                        onClick={() => { setSelectedPart(''); setSelectedLine(''); }}
                        className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-200"
                    >
                        <i className="fas fa-filter-circle-xmark text-[9px]"></i>
                        Clear
                    </button>
                </div>
            </div>

            {/* 3. Summary Global Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
                {/* 1. Total Produksi */}
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-boxes"></i></div>
                    <div className="min-w-0">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Produksi</div>
                        <div className="text-lg font-black text-slate-800">{totalProd.toLocaleString('id-ID')}</div>
                    </div>
                </div>

                {/* 2. Total NG */}
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-exclamation-triangle"></i></div>
                    <div className="min-w-0">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total NG Qty</div>
                        <div className="text-lg font-black text-red-600">{totalNgFrame.toLocaleString('id-ID')}</div>
                    </div>
                </div>

                {/* 3. Frame OK Ratio (Chokoritsu) */}
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-percent"></i></div>
                    <div className="min-w-0">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Frame OK Ratio (Chokoritsu)</div>
                        <div className="text-lg font-black text-emerald-600">{frameOkRatio}%</div>
                    </div>
                </div>

                {/* 4. Point OK Ratio */}
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-bullseye"></i></div>
                    <div className="min-w-0">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Point OK Ratio</div>
                        <div className="text-lg font-black text-teal-600">{pointOkRatio}%</div>
                    </div>
                </div>

                {/* 5. Efisiensi */}
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-gauge-high"></i></div>
                    <div className="min-w-0">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Efisiensi</div>
                        <div className="text-lg font-black text-purple-600">{avgEfficiency}%</div>
                    </div>
                </div>
            </div>

            {/* 4. Visual Pareto & Dynamic Charts */}
            {displaySessions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-[165px]">
                        <h3 className="text-[6.5px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1.5 shrink-0">
                            <div className="w-1 h-2.5 bg-orange-500 rounded-full"></div> Pareto Defect Problem
                        </h3>
                        <div className="flex-1 relative min-h-0">
                            <canvas ref={canvasRefs.problem}></canvas>
                        </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-[165px]">
                        <h3 className="text-[6.5px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1.5 shrink-0">
                            <div className="w-1 h-2.5 bg-red-600 rounded-full"></div> Pareto NG per Part
                        </h3>
                        <div className="flex-1 relative min-h-0">
                            <canvas ref={canvasRefs.part}></canvas>
                        </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-[165px]">
                        <h3 className="text-[6.5px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1.5 shrink-0">
                            <div className="w-1 h-2.5 bg-blue-600 rounded-full"></div> Pareto NG per Line
                        </h3>
                        <div className="flex-1 relative min-h-0">
                            <canvas ref={canvasRefs.line}></canvas>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* 5. Active Operators Detail Table */}
            <div className="bg-white rounded-xl p-3 shadow-md border border-slate-100 h-[260px] overflow-hidden flex flex-col min-h-0">
                <h3 className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 shrink-0">
                    <i className="fas fa-list-check text-blue-500 text-[8px]"></i>
                    Operator Aktif ({displaySessions.length})
                </h3>

                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl custom-scrollbar bg-slate-50">
                    {displaySessions.length > 0 ? (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-150 text-slate-500 text-[7px] uppercase tracking-widest font-black sticky top-0 border-b border-slate-200 z-10">
                                <tr>
                                    <th className="p-1.5">Operator</th>
                                    <th className="p-1.5">Shift/Line</th>
                                    <th className="p-1.5">Part</th>
                                    <th className="p-1.5 text-center text-slate-500">Prod</th>
                                    <th className="p-1.5 text-center text-emerald-600">OK</th>
                                    <th className="p-1.5 text-center text-red-500">NG</th>
                                    <th className="p-1.5 text-center text-slate-400">Scrap</th>
                                    <th className="p-1.5 text-center text-red-400">Abnorm</th>
                                    <th className="p-1.5 text-center">%Frame OK<br/>| %Efisiensi</th>
                                    <th className="p-1.5">NG Detail</th>
                                    <th className="p-1.5 text-right">Update</th>
                                    <th className="p-1.5 text-center w-10">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {displaySessions.map((s, idx) => {
                                    const total = s.total_ok + s.total_ng;
                                    const yld = total > 0 ? ((s.total_ok / total) * 100).toFixed(1) : 100;
                                    const groupedNg = groupNgFindings(s.problems_list).sort((a, b) => b.count - a.count);

                                    return (
                                        <tr key={s.id || idx} className="hover:bg-blue-50/30 bg-white transition-colors cursor-pointer"
                                            onClick={() => setAnalyticsPart({
                                                part_number: s.part_number,
                                                part_name: s.part_name,
                                                model: s.model
                                            })}>
                                            <td className="p-1.5">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></div>
                                                    <span className="text-[10px] font-black text-slate-800 leading-tight truncate max-w-[80px]">{s.inspector}</span>
                                                    <span className={`px-1 py-[1px] rounded text-[6.5px] font-black uppercase leading-none ${s.side === 'KANAN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {s.side || 'KIRI'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-1.5 text-[9px] font-bold text-slate-500 leading-tight whitespace-nowrap">
                                                S{s.shift}/L{s.line_pos}
                                            </td>
                                            <td className="p-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-[1px] rounded text-[8px] font-black leading-none shrink-0">{s.part_number}</span>
                                                    {s.part_name && <span className="text-[9px] font-bold text-slate-500 leading-tight">{s.part_name}</span>}
                                                </div>
                                            </td>
                                            <td className="p-1.5 text-center whitespace-nowrap">
                                                <span className="text-[10px] font-black text-slate-800 leading-tight">{total}</span>
                                            </td>
                                            <td className="p-1.5 text-center whitespace-nowrap">
                                                <span className="text-[10px] font-black text-emerald-600 leading-tight">{s.total_ok}</span>
                                            </td>
                                            <td className="p-1.5 text-center whitespace-nowrap">
                                                <span className="text-[10px] font-black text-red-500 leading-tight">{s.total_ng}</span>
                                            </td>
                                            <td className="p-1.5 text-center whitespace-nowrap">
                                                <span className="text-[10px] font-black text-slate-600 leading-tight">{s.total_scrap}</span>
                                            </td>
                                            <td className="p-1.5 text-center whitespace-nowrap">
                                                <span className={`text-[10px] font-black leading-tight ${s.total_abnormality > 0 ? 'text-red-500' : 'text-slate-300'}`}>{s.total_abnormality || 0}</span>
                                            </td>
                                            <td className="p-1.5 text-center">
                                                <div className="flex items-center justify-center gap-1 text-[10px] font-black leading-tight">
                                                    <span className={Number(yld) < 98 ? 'text-red-500' : 'text-emerald-600'}>{yld}%</span>
                                                    <span className="text-slate-300 text-[7px]">|</span>
                                                    <span className="text-blue-500 text-[9px]">{s.efficiency || 0}%</span>
                                                </div>
                                            </td>
                                            <td className="p-1.5">
                                                <div className="flex flex-wrap gap-0.5">
                                                    {groupedNg.length > 0 ? (
                                                        groupedNg.map((p, pIdx) => (
                                                            <span key={pIdx} className="bg-red-50 border border-red-200 text-red-700 px-1.5 py-[1px] rounded text-[7px] font-black leading-tight flex items-center gap-0.5" title={`${p.defectCode} ${p.problem}${p.count > 1 ? ` x${p.count}` : ''}`}>
                                                                <i className="fas fa-triangle-exclamation text-[6px] text-red-500"></i>
                                                                P{p.checkNo} ({p.problem.split('(')[0].trim()})
                                                                {p.count > 1 && <span className="bg-red-200 text-red-800 px-0.5 rounded text-[6px] ml-0.5">x{p.count}</span>}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[7px] font-bold text-emerald-600 leading-tight flex items-center gap-0.5">
                                                            <i className="fas fa-check text-[6px] text-emerald-500"></i>
                                                            ALL OK
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-1.5 text-right whitespace-nowrap">
                                                <span className="text-[7px] font-bold text-slate-400 leading-tight">{new Date(s.last_update).toLocaleTimeString('id-ID')}</span>
                                            </td>
                                            <td className="p-1.5 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); setAnalyticsPart({
                                                        part_number: s.part_number,
                                                        part_name: s.part_name,
                                                        model: s.model
                                                    }); }}
                                                        className="w-4 h-4 bg-blue-50 hover:bg-blue-500 text-blue-500 hover:text-white rounded-lg flex items-center justify-center transition-all text-[6px]"
                                                        title="Live Analytics Part">
                                                        <i className="fas fa-chart-simple"></i>
                                                    </button>
                                                    {currentUser?.role === 'admin' && (
                                                    <button
                                                        onClick={async (e) => { e.stopPropagation();
                                                            if (!confirm(`Hapus sesi "${s.inspector}"?`)) return;
                                                            try {
                                                                const resp = await fetch(`${api_url}/api/dashboard/live-delete`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ inspector: s.inspector })
                                                                });
                                                                const result = await resp.json();
                                                                if (result.status === 'success') fetchSessions();
                                                            } catch (err) {
                                                                console.error("Gagal menghapus sesi:", err);
                                                            }
                                                        }}
                                                        className="w-4 h-4 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-lg flex items-center justify-center transition-all text-[6px]"
                                                        title="Hapus sesi">
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-[9px] text-center gap-1.5 bg-slate-50 py-6">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200 text-[9px]">
                                <i className="fas fa-clock animate-pulse"></i>
                            </div>
                            <span>Belum ada operator aktif.</span>
                            <span className="text-[7px] font-bold text-slate-400">Produksi = 0 disembunyikan.</span>
                        </div>
                    )}
                </div>
            </div>

            {analyticsPart && (
                <window.LivePartAnalyticsModal
                    part={analyticsPart}
                    api_url={api_url}
                    onClose={() => setAnalyticsPart(null)}
                />
            )}

        </div>
    );
}

window.LiveMonitoringTab = LiveMonitoringTab;
