function LivePartAnalyticsModal({ part, api_url, onClose }) {
    const [data, setData] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [autoRefresh, setAutoRefresh] = React.useState(true);
    const [expandedOperator, setExpandedOperator] = React.useState(null);
    const [operatorHourly, setOperatorHourly] = React.useState({});
    const [partPoints, setPartPoints] = React.useState([]);
    const [selectedPoint, setSelectedPoint] = React.useState(null);
    const [markerSize, setMarkerSize] = React.useState(32);
    const [chartMaxY, setChartMaxY] = React.useState(100);
    const heatmapContainerRef = React.useRef(null);

    const paretoProblemRef = React.useRef(null);
    const paretoPointRef = React.useRef(null);
    const canvasProblemRef = React.useRef(null);
    const canvasPointRef = React.useRef(null);
    const sessionChartRef = React.useRef(null);
    const sessionCanvasRef = React.useRef(null);
    const refreshIntervalRef = React.useRef(null);

    const today = new Date().toISOString().split('T')[0];

    const fetchAnalytics = async () => {
        try {
            const res = await fetch(`${api_url}/api/dashboard/live-analytics/${part.part_number}`);
            const result = await res.json();
            if (result.status === 'success') setData(result.data);
            setError(null);
        } catch (e) {
            setError('Gagal memuat data');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchOperatorHourly = async (inspector, side) => {
        const key = `${inspector}|${side}`;
        if (operatorHourly[key]) return;
        try {
            const url = new URL(`${api_url}/api/efficiency/hourly`);
            url.searchParams.append('date', today);
            url.searchParams.append('partNumber', part.part_number);
            url.searchParams.append('inspector', inspector);
            if (side) url.searchParams.append('side', side);
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') {
                setOperatorHourly(prev => ({ ...prev, [key]: result }));
            }
        } catch (e) {
            console.error('Fetch operator hourly error:', e);
        }
    };

    const fetchMasterPoints = async () => {
        try {
            const modelVal = part.model || part.initialModel || '';
            const res = await fetch(`${api_url}/api/master/points/${encodeURIComponent(part.part_number)}?model=${encodeURIComponent(modelVal)}`);
            const result = await res.json();
            if (result.status === 'success') setPartPoints(result.data);
        } catch (e) { console.error('Fetch master points error:', e); }
    };

    React.useEffect(() => {
        fetchAnalytics();
        fetchMasterPoints();
    }, [part.part_number]);

    React.useEffect(() => {
        if (autoRefresh) {
            refreshIntervalRef.current = setInterval(fetchAnalytics, 15000);
        }
        return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
    }, [autoRefresh, part.part_number]);

    React.useEffect(() => {
        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
        };
    }, []);

    React.useEffect(() => {
        const el = heatmapContainerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                setMarkerSize(Math.max(14, Math.min(36, Math.round(w * 0.025))));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [data]);

    const getParetoData = (items, labelKey, qtyKey) => {
        const sorted = [...(items || [])]
            .map(item => ({ ...item, qty: Number(item[qtyKey] || 0) }))
            .filter(item => item.qty > 0)
            .sort((a, b) => b.qty - a.qty);
        const total = sorted.reduce((sum, item) => sum + item.qty, 0);
        let cumulativeSum = 0;
        const labels = [];
        const qtyValues = [];
        const pctValues = [];
        sorted.forEach(item => {
            labels.push(item[labelKey]);
            qtyValues.push(item.qty);
            cumulativeSum += item.qty;
            pctValues.push(total > 0 ? Number((cumulativeSum / total * 100).toFixed(1)) : 0);
        });
        return { labels, qtyValues, pctValues };
    };

    React.useEffect(() => {
        if (!data) return;
        setTimeout(() => {
            if (paretoProblemRef.current) { paretoProblemRef.current.destroy(); paretoProblemRef.current = null; }
            if (paretoPointRef.current) { paretoPointRef.current.destroy(); paretoPointRef.current = null; }

            if (canvasProblemRef.current && data.problems.length > 0) {
                const { labels, qtyValues, pctValues } = getParetoData(data.problems, 'problem', 'qty');
                paretoProblemRef.current = new Chart(canvasProblemRef.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            { type: 'bar', label: 'Defect Qty', data: qtyValues, backgroundColor: '#f59e0b', borderRadius: 6, yAxisID: 'y', order: 1 },
                            { type: 'line', label: 'Kumulatif %', data: pctValues, borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2.5, tension: 0.1, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#ef4444', pointBorderColor: '#ffffff', pointBorderWidth: 1.5, fill: false, yAxisID: 'y1', order: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            x: { grid: { display: false } },
                            y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'Jumlah Defect (Qty)', font: { size: 9, weight: 'bold' } }, grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' } },
                            y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, min: 0, max: 100, title: { display: true, text: 'Persentase Kumulatif (%)', font: { size: 9, weight: 'bold' } }, ticks: { callback: v => v + '%' }, grid: { drawOnChartArea: false } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 9, weight: 'bold' } } },
                            tooltip: {
                                mode: 'index', intersect: false,
                                callbacks: {
                                    label: (ctx) => {
                                        if (ctx.dataset.yAxisID === 'y1') return `${ctx.parsed.y}%`;
                                        return `Qty: ${ctx.parsed.y}`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            if (canvasPointRef.current && data.points.length > 0) {
                const { labels, qtyValues, pctValues } = getParetoData(data.points, 'check_no', 'qty');
                const pointLabels = labels.map(c => `#${c}`);
                paretoPointRef.current = new Chart(canvasPointRef.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: pointLabels,
                        datasets: [
                            { type: 'bar', label: 'Defect Qty', data: qtyValues, backgroundColor: '#3b82f6', borderRadius: 6, yAxisID: 'y', order: 1 },
                            { type: 'line', label: 'Kumulatif %', data: pctValues, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2.5, tension: 0.1, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#ef4444', pointBorderColor: '#ffffff', pointBorderWidth: 1.5, fill: false, yAxisID: 'y1', order: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 8, weight: 'bold' } }, grid: { display: false } },
                            y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'Jumlah Defect (Qty)', font: { size: 9, weight: 'bold' } }, grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' } },
                            y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, min: 0, max: 100, title: { display: true, text: 'Persentase Kumulatif (%)', font: { size: 9, weight: 'bold' } }, ticks: { callback: v => v + '%' }, grid: { drawOnChartArea: false } }
                        },
                        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 9, weight: 'bold' } } }, tooltip: { mode: 'index', intersect: false } }
                    }
                });
            }
        }, 100);
        return () => {
            if (paretoProblemRef.current) paretoProblemRef.current.destroy();
            if (paretoPointRef.current) paretoPointRef.current.destroy();
        };
    }, [data]);

    React.useEffect(() => {
        if (!expandedOperator || !operatorHourly[expandedOperator]) return;
        setTimeout(() => {
            if (sessionChartRef.current) { sessionChartRef.current.destroy(); sessionChartRef.current = null; }
            const hData = operatorHourly[expandedOperator];
            if (sessionCanvasRef.current && hData.items?.length > 0) {
                const items = hData.items;
                const taktLine = items[0]?.takt_time_sec || 60;
                const labels = items.map((_, i) => i + 1);
                const durations = items.map(it => it.duration_sec);
                const colors = items.map(it => it.judgment === 'OK' ? '#22c55e' : '#ef4444');

                sessionChartRef.current = new Chart(sessionCanvasRef.current.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Durasi (dtk)',
                            data: durations,
                            backgroundColor: colors,
                            borderRadius: 3,
                            barPercentage: 0.7
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        layout: { padding: { top: 14 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (ctx) => `Check #${ctx[0].label}`,
                                    label: (ctx) => {
                                        const item = items[ctx.dataIndex];
                                        return [`Durasi: ${item.duration_sec}s`, `Takt: ${item.takt_time_sec}s`, `Hasil: ${item.judgment}`, `Jam: ${item.time}`];
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: 'Check Ke-', font: { size: 10 } }, ticks: { font: { size: 9 } } },
                            y: { beginAtZero: true, max: chartMaxY ? Number(chartMaxY) : undefined, title: { display: true, text: 'Durasi (detik)', font: { size: 10 } }, ticks: { font: { size: 9 } } }
                        }
                    },
                    plugins: [{
                        id: 'hourlyGroup',
                        beforeDraw(chart) {
                            const ctx = chart.ctx;
                            const ca = chart.chartArea;
                            const meta = chart.getDatasetMeta(0);
                            if (!meta?.data?.length || !items.length) return;
                            const groups = [];
                            let cur = null, si = 0;
                            items.forEach((it, i) => {
                                const h = it.time ? it.time.substring(0, 2) : '??';
                                if (h !== cur) {
                                    if (cur !== null) groups.push({ hour: cur, start: si, end: i - 1 });
                                    cur = h; si = i;
                                }
                            });
                            if (cur !== null) groups.push({ hour: cur, start: si, end: items.length - 1 });
                            ctx.save();
                            groups.forEach((g, gi) => {
                                const fx = meta.data[g.start].x, lx = meta.data[g.end].x;
                                const gap = meta.data.length > 1 ? (meta.data[1].x - meta.data[0].x) : 20;
                                const hg = gap / 2;
                                ctx.fillStyle = gi % 2 === 0 ? 'rgba(0,20,40,0.035)' : 'rgba(0,0,0,0)';
                                ctx.fillRect(fx - hg, ca.top, lx - fx + gap, ca.bottom - ca.top);
                                if (gi > 0) {
                                    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.moveTo(fx - hg, ca.top);
                                    ctx.lineTo(fx - hg, ca.bottom);
                                    ctx.stroke();
                                }
                                const next = String(Number(g.hour) + 1).padStart(2, '0');
                                ctx.fillStyle = '#94a3b8';
                                ctx.font = '8px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillText(g.hour + ':00-' + next + ':00', (fx + lx) / 2, ca.top - 1);
                            });
                            ctx.restore();
                        }
                    }, {
                        id: 'taktLine',
                        afterDraw(chart) {
                            const yScale = chart.scales.y;
                            const y = yScale.getPixelForValue(taktLine);
                            if (y === undefined) return;
                            const ctx = chart.ctx;
                            ctx.save();
                            ctx.beginPath();
                            ctx.moveTo(chart.chartArea.left, y);
                            ctx.lineTo(chart.chartArea.right, y);
                            ctx.strokeStyle = '#f59e0b';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([6, 4]);
                            ctx.stroke();
                            ctx.fillStyle = '#f59e0b';
                            ctx.font = '9px sans-serif';
                            ctx.textAlign = 'right';
                            ctx.fillText(`Takt ${taktLine}s`, chart.chartArea.right - 4, y - 4);
                            ctx.restore();
                        }
                    }]
                });
            }
        }, 100);
        return () => { if (sessionChartRef.current) sessionChartRef.current.destroy(); };
    }, [expandedOperator, operatorHourly, chartMaxY]);

    const handleOpenHistory = () => {
        if (window.showPartAnalytics) {
            window.showPartAnalytics({
                part_number: part.part_number,
                part_name: part.part_name,
                model: part.model,
                initialModel: part.model
            });
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-[2rem] w-full max-w-sm mx-4 p-10 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-sm font-bold text-slate-400">Memuat data live...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-[2rem] w-full max-w-sm mx-4 p-10 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4 text-red-500 text-xl"><i className="fas fa-circle-exclamation"></i></div>
                    <p className="text-sm font-bold text-red-600 mb-4">{error}</p>
                    <button onClick={fetchAnalytics} className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl">Coba Lagi</button>
                </div>
            </div>
        );
    }

    if (!data || data.summary.active_sessions === 0) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-[2rem] w-full max-w-sm mx-4 p-10 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-300 text-xl"><i className="fas fa-chart-simple"></i></div>
                    <p className="text-sm font-bold text-slate-500">Tidak ada sesi aktif untuk part ini.</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl">Tutup</button>
                </div>
            </div>
        );
    }

    const effStyle = (val) => ({ color: val >= 80 ? '#059669' : val >= 50 ? '#d97706' : '#dc2626' });

    const totalProd = data.summary.total_prod;
    const totalNG = data.summary.total_ng;
    const totalNgPoint = data.points?.reduce((sum, p) => sum + Number(p.qty), 0) || 0;
    const frameOKRatio = totalProd > 0 ? (((totalProd - totalNG) / totalProd) * 100).toFixed(2) : 100;
    const maxPoints = totalProd * partPoints.length;
    const pointOKRatio = maxPoints > 0 ? (((maxPoints - totalNgPoint) / maxPoints) * 100).toFixed(2) : (totalProd > 0 ? frameOKRatio : 100);

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-[2.5rem] w-full max-w-[98vw] max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-slate-800 truncate">{part.part_number}</h3>
                        <p className="text-[11px] font-bold text-slate-400 truncate">{part.part_name || ''}{part.model ? ` · ${part.model}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping absolute"></div>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full relative"></div>
                            <span className="text-[8px] font-black text-emerald-700 uppercase tracking-wider ml-1.5">LIVE</span>
                        </div>
                        <button onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${autoRefresh ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                            <i className={`fas fa-rotate mr-0.5 ${autoRefresh ? 'animate-spin' : ''}`}></i>{autoRefresh ? '15s' : 'OFF'}
                        </button>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto min-h-0 p-6 custom-scrollbar space-y-4" style={{overscrollBehavior:'contain'}}>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        {/* 1. Total Produksi */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-boxes"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Produksi</div>
                                <div className="text-lg font-black text-slate-800">{totalProd.toLocaleString('id-ID')}</div>
                            </div>
                        </div>

                        {/* 2. Total NG Frame */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-cube"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total NG Frame</div>
                                <div className="text-lg font-black text-red-650">{totalNG.toLocaleString('id-ID')}</div>
                            </div>
                        </div>

                        {/* 3. Total NG Point */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-exclamation-triangle"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total NG Point</div>
                                <div className="text-lg font-black text-purple-600">{totalNgPoint.toLocaleString('id-ID')}</div>
                            </div>
                        </div>

                        {/* 4. Frame OK Ratio (Chokoritsu) */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-percent"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Frame OK Ratio (Chokoritsu)</div>
                                <div className="text-lg font-black text-emerald-600">{frameOKRatio}%</div>
                            </div>
                        </div>

                        {/* 5. Point OK Ratio */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-bullseye"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Point OK Ratio</div>
                                <div className="text-lg font-black text-teal-600">{pointOKRatio}%</div>
                            </div>
                        </div>

                        {/* 6. Efisiensi */}
                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-gauge-high"></i></div>
                            <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Efisiensi</div>
                                <div className="text-lg font-black text-purple-600">{data.summary.avg_efficiency}%</div>
                            </div>
                        </div>
                    </div>

                    {/* Pareto Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col" style={{height:'340px'}}>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 shrink-0">
                                <span className="w-1 h-2.5 bg-amber-500 rounded-full inline-block mr-1"></span> Pareto Problem
                            </h4>
                            <div className="flex-1 relative min-h-0">
                                <canvas ref={canvasProblemRef} className="w-full h-full"></canvas>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col" style={{height:'340px'}}>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 shrink-0">
                                <span className="w-1 h-2.5 bg-red-500 rounded-full inline-block mr-1"></span> Pareto Point Check
                            </h4>
                            <div className="flex-1 relative min-h-0">
                                <canvas ref={canvasPointRef} className="w-full h-full"></canvas>
                            </div>
                        </div>
                    </div>

                    {/* Heatmap */}
                    <div ref={heatmapContainerRef} className="bg-slate-900 rounded-[2rem] border-4 border-slate-800 overflow-hidden relative shadow-xl flex flex-col min-h-[450px]">
                        <div className="flex justify-between items-center bg-slate-800 px-5 py-3 text-white">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Intensity Heatmap</span>
                            <div className="flex items-center gap-1.5 text-[8px] font-black tracking-normal uppercase bg-slate-900/60 px-3 py-1 rounded-xl">
                                <span className="text-slate-400">Low</span>
                                <span className="w-2 h-2 rounded-full bg-blue-500/80 border border-blue-400/40 inline-block" title="Aman (0 NG)"></span>
                                <span className="w-2 h-2 rounded-full bg-yellow-500 border border-yellow-600 inline-block" title="Rendah (1-2 NG)"></span>
                                <span className="w-2 h-2 rounded-full bg-orange-500 border border-orange-600 inline-block" title="Sedang (>=3 NG)"></span>
                                <span className="w-2 h-2 rounded-full bg-red-650 border border-red-800 inline-block" title="Tinggi (Top 3 NG)"></span>
                                <span className="text-slate-400">High</span>
                            </div>
                        </div>
                        <div className="relative flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4 custom-scrollbar-dark">
                            {data.image_path ? (
                                <div className="relative w-full shadow-2xl rounded-2xl overflow-hidden border-4 border-slate-800">
                                    <img src={`${api_url}/${data.image_path}`} className="w-full block" alt="Part" />
                                    {selectedPoint && (
                                        <div className="absolute inset-0 z-20" onClick={() => setSelectedPoint(null)} />
                                    )}
                                    {partPoints.map((p, idx) => {
                                        const ana = data.points?.find(ap => ap.check_no == p.check_no);
                                        const qty = ana ? Number(ana.qty) : 0;
                                        const size = markerSize;
                                        const top3Set = new Set(
                                            [...(data.points || [])]
                                                .filter(pt => Number(pt.qty || 0) > 0)
                                                .sort((a, b) => b.qty - a.qty)
                                                .slice(0, 3)
                                                .map(pt => String(pt.check_no))
                                        );
                                        const isTop3 = top3Set.has(String(p.check_no)) && qty > 0;
                                        let colorClass = 'bg-blue-500/20 border-blue-400/40 text-blue-800/40';
                                        if (isTop3) {
                                            colorClass = 'bg-red-600/90 border-red-800 text-white scale-110 z-20 shadow-[0_0_20px_rgba(220,38,38,0.8)]';
                                        } else if (qty > 0 && qty < 3) {
                                            colorClass = 'bg-yellow-500/40 border-yellow-600 text-white shadow-[0_0_15px_rgba(234,179,8,0.4)]';
                                        } else if (qty >= 3) {
                                            colorClass = 'bg-orange-500/50 border-orange-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.5)]';
                                        }
                                        const isSelected = selectedPoint?.check_no == p.check_no;
                                        const handlePointClick = (e) => {
                                            e.stopPropagation();
                                            if (isSelected) { setSelectedPoint(null); return; }
                                            const pp = (data.pointProblems || []).find(pp => pp.check_no == p.check_no);
                                            const problems = pp ? pp.problems.map(pr => ({
                                                problem: pr.problem || pr.defect_code,
                                                defect_code: pr.defect_code,
                                                total_qty: pr.qty
                                            })) : [];
                                            setSelectedPoint({ check_no: p.check_no, qty, problems, x: p.x_coord, y: p.y_coord });
                                        };
                                        return (
                                            <div key={idx} style={{ left: `${p.x_coord}%`, top: `${p.y_coord}%`, width: `${size}px`, height: `${size}px`, transform: 'translate(-50%, -50%)', position: 'absolute', zIndex: isSelected ? 30 : undefined }}>
                                                <div className={`w-full h-full rounded-full flex items-center justify-center font-black transition-all cursor-pointer border-2 ${colorClass} ${isSelected ? 'ring-4 ring-white ring-offset-1 scale-125' : 'hover:scale-110'}`}
                                                    onClick={handlePointClick}
                                                    title={`Point #${p.check_no}: ${qty} Defect`}>
                                                    <span style={{ fontSize: `${Math.max(8, size / 3.2)}px` }}>{p.check_no}</span>
                                                </div>
                                                {isSelected && (
                                                    <div className="absolute z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                                                        style={{ width: '200px', maxHeight: '260px', left: p.x_coord > 65 ? 'auto' : '110%', right: p.x_coord > 65 ? '110%' : 'auto', top: p.y_coord > 60 ? 'auto' : '0', bottom: p.y_coord > 60 ? '0' : 'auto' }}
                                                        onClick={e => e.stopPropagation()}>
                                                        <div className="bg-slate-900 px-4 py-2.5 flex justify-between items-center">
                                                            <div>
                                                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Point #{p.check_no}</div>
                                                                <div className="text-[11px] font-black text-white">{qty} Total NG</div>
                                                            </div>
                                                            <button onClick={() => setSelectedPoint(null)} className="text-slate-400 hover:text-white transition-colors w-5 h-5 flex items-center justify-center">
                                                                <i className="fas fa-times text-[10px]"></i>
                                                            </button>
                                                        </div>
                                                        <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                                                            {selectedPoint.problems.length === 0 ? (
                                                                <div className="py-6 text-center text-slate-300 text-[10px] italic font-bold uppercase tracking-widest">No Problem Data</div>
                                                            ) : (
                                                                selectedPoint.problems.map((prob, pi) => {
                                                                    const maxQty = selectedPoint.problems[0]?.total_qty || 1;
                                                                    const barPct = Math.round((prob.total_qty / maxQty) * 100);
                                                                    return (
                                                                        <div key={pi} className={`px-3 py-2 border-b border-slate-50 ${pi === 0 ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                                                                            <div className="flex justify-between items-center mb-1">
                                                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                                    <span className="text-[8px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded shrink-0">{pi + 1}</span>
                                                                                    <span className="text-[9px] font-bold text-slate-700 truncate">{prob.problem}</span>
                                                                                </div>
                                                                                <span className={`text-[9px] font-black ml-1 shrink-0 ${pi === 0 ? 'text-red-600' : 'text-slate-500'}`}>{prob.total_qty}</span>
                                                                            </div>
                                                                            <div className="w-full bg-slate-100 rounded-full h-1">
                                                                                <div className={`h-1 rounded-full ${pi === 0 ? 'bg-red-500' : 'bg-slate-400'}`} style={{ width: `${barPct}%` }}></div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-slate-400 text-center py-20 font-bold italic">Gambar master part belum diunggah</div>
                            )}
                        </div>
                    </div>

                    {/* Operator Detail + Efisiensi */}
                    <div>
                        <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <i className="fas fa-list-check text-blue-500 text-[9px]"></i>
                            Detail Operator · {data.summary.active_sessions} sesi aktif
                        </h4>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-100 text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="p-2">Operator</th>
                                        <th className="p-2 text-right">Checks</th>
                                        <th className="p-2 text-right">Durasi</th>
                                        <th className="p-2 text-right">Takt</th>
                                        <th className="p-2 text-right">Expected</th>
                                        <th className="p-2 text-right">Loss (time|Pcs)</th>
                                        <th className="p-2 text-right">Eff%</th>
                                        <th className="p-2 text-right w-12">Jam</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.operators.map((op, i) => {
                                        const key = `${op.inspector}|${op.side}`;
                                        const expanded = expandedOperator === key;
                                        return (
                                            <React.Fragment key={key}>
                                                <tr className={`text-[11px] font-bold cursor-pointer transition-colors ${expanded ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                                    onClick={() => {
                                                        if (expanded) { setExpandedOperator(null); }
                                                        else { setExpandedOperator(key); fetchOperatorHourly(op.inspector, op.side); }
                                                    }}>
                                                    <td className="p-2">
                                                        <i className={`fas fa-chevron-right text-[7px] transition-transform mr-1.5 text-slate-400 ${expanded ? 'rotate-90' : ''}`}></i>
                                                        <span className="text-slate-800">{op.inspector}</span>
                                                        <span className={`ml-1 px-1 py-[1px] rounded text-[6px] font-black uppercase ${op.side === 'KANAN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {op.side || 'KIRI'}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 text-right tabular-nums">{op.total_checks}</td>
                                                    <td className="p-2 text-right tabular-nums text-slate-500">{op.active_min} mnt</td>
                                                    <td className="p-2 text-right tabular-nums text-slate-500">{op.avg_takt}s</td>
                                                    <td className="p-2 text-right tabular-nums text-slate-500">{op.expected}</td>
                                                    <td className="p-2 text-right tabular-nums text-red-500">{op.lost_time_min} mnt | {op.lost_products} pcs</td>
                                                    <td className="p-2 text-right tabular-nums font-black" style={effStyle(op.efficiency)}>{op.efficiency}%</td>
                                                    <td className="p-2 text-right">
                                                        <i className={`fas fa-chevron-down text-[9px] text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}></i>
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr key={`${key}-detail`}>
                                                        <td colSpan={8} className="p-0">
                                                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 animate-in slide-in-from-top-1 duration-150">
                                                                {operatorHourly[key] ? (
                                                                    <div className="space-y-3">
                                                                        {operatorHourly[key].items?.length > 0 && (
                                                                            <div className="space-y-2">
                                                                                <div className="flex items-center justify-end gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Batas Sumbu Y (detik):</span>
                                                                                    <input type="number" value={chartMaxY || ''} onChange={(e) => { const val = e.target.value; setChartMaxY(val ? Number(val) : null); }} className="w-16 px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-700 outline-none text-right" />
                                                                                </div>
                                                                                <div className="h-48">
                                                                                    <canvas ref={sessionCanvasRef} className="w-full h-full"></canvas>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {operatorHourly[key].data?.length > 0 ? (
                                                                            <table className="w-full text-left">
                                                                                <thead>
                                                                                    <tr className="text-[8px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200">
                                                                                        <th className="pb-1">Jam</th>
                                                                                        <th className="pb-1 text-right">Checks</th>
                                                                                        <th className="pb-1 text-right">Durasi</th>
                                                                                        <th className="pb-1 text-right">Takt</th>
                                                                                        <th className="pb-1 text-right">Expected</th>
                                                                                        <th className="pb-1 text-right">Loss (time|Prod)</th>
                                                                                        <th className="pb-1 text-right">Eff%</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {operatorHourly[key].data.map((h, hi) => (
                                                                                        <tr key={hi} className="text-[10px] font-bold border-b border-slate-100">
                                                                                            <td className="py-1 text-slate-500">{h.hour}</td>
                                                                                            <td className="py-1 text-right tabular-nums">{h.checks}</td>
                                                                                            <td className="py-1 text-right tabular-nums text-slate-400">{h.active_min} mnt</td>
                                                                                            <td className="py-1 text-right tabular-nums text-slate-500">{h.avg_takt}s</td>
                                                                                            <td className="py-1 text-right tabular-nums text-slate-500">{h.expected}</td>
                                                                                            <td className="py-1 text-right tabular-nums text-red-500">{h.lost_time_min} mnt | {h.lost_products} pcs</td>
                                                                                            <td className="py-1 text-right tabular-nums font-black" style={effStyle(h.efficiency)}>{h.efficiency}%</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                    {operatorHourly[key].daily && (
                                                                                        <tr className="text-[10px] font-black border-t-2 border-slate-300">
                                                                                            <td className="py-1.5 text-slate-800">Total</td>
                                                                                            <td className="py-1.5 text-right tabular-nums">{operatorHourly[key].daily.total_checks}</td>
                                                                                            <td className="py-1.5 text-right tabular-nums text-slate-500">{operatorHourly[key].daily.active_min} mnt</td>
                                                                                            <td className="py-1.5 text-right tabular-nums text-slate-500">{operatorHourly[key].avg_takt}s</td>
                                                                                            <td className="py-1.5 text-right tabular-nums text-slate-500">{operatorHourly[key].daily.total_expected}</td>
                                                                                            <td className="py-1.5 text-right tabular-nums text-red-600">{operatorHourly[key].daily.lost_time_min} mnt | {operatorHourly[key].daily.lost_products} pcs</td>
                                                                                            <td className="py-1.5 text-right tabular-nums font-black" style={effStyle(operatorHourly[key].daily.efficiency)}>{operatorHourly[key].daily.efficiency}%</td>
                                                                                        </tr>
                                                                                    )}
                                                                                </tbody>
                                                                            </table>
                                                                        ) : (
                                                                            <div className="text-[10px] text-slate-400 italic font-bold text-center py-2">Tidak ada data per jam</div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-center gap-2 py-2">
                                                                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                                        <span className="text-[10px] font-bold text-slate-400">Memuat data per jam...</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                {data.summary.total_checks > 0 && (
                                    <tfoot>
                                        <tr className="text-[12px] font-black border-t-2 border-slate-200">
                                            <td className="p-2 text-slate-900" colSpan={2}>Total ({data.summary.active_sessions} sesi)</td>
                                            <td className="p-2 text-right tabular-nums text-slate-500">{data.summary.active_min} mnt</td>
                                            <td className="p-2 text-right tabular-nums text-slate-500">{data.summary.avg_takt}s</td>
                                            <td className="p-2 text-right tabular-nums text-slate-500">{data.summary.total_expected}</td>
                                            <td className="p-2 text-right tabular-nums text-red-600">{data.summary.lost_time_min} mnt | {data.summary.lost_products} pcs</td>
                                            <td className="p-2 text-right tabular-nums font-black" style={effStyle(data.summary.avg_efficiency)}>{data.summary.avg_efficiency}%</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Tombol History Analytics */}
                    <div className="flex justify-center pt-1">
                        <button onClick={handleOpenHistory}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase rounded-2xl transition-all shadow-lg active:scale-[0.99] flex items-center gap-2">
                            <i className="fas fa-chart-line"></i>
                            Lihat History Analytics (check_sheets)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

window.LivePartAnalyticsModal = LivePartAnalyticsModal;
