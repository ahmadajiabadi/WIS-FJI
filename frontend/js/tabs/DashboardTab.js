function InlineChart({ type, data }) {
    const canvasRef = React.useRef(null);
    const chartRef = React.useRef(null);

    React.useEffect(() => {
        if (!canvasRef.current || !data) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        
        if (type === 'pareto') {
            const labels = (data || []).slice(0, 5).map(p => p.defect_code);
            const values = (data || []).slice(0, 5).map(p => p.total_qty);

            chartRef.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Defect Qty',
                        data: values,
                        backgroundColor: '#f59e0b',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { display: false }, ticks: { font: { size: 8 } } },
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        } else if (type === 'trend') {
            const labels = (data || []).slice(-7).map(t => new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
            const values = (data || []).slice(-7).map(t => Number(t.ratio));

            chartRef.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'NG Ratio (%)',
                        data: values,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, grid: { display: false }, ticks: { font: { size: 8 }, callback: v => v + '%' } },
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        } else if (type === 'efficiency') {
            const labels = (data || []).map(t => {
                const d = new Date(t.month + 'T00:00:00');
                return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
            });
            const values = (data || []).map(t => Number(t.avg_efficiency));

            chartRef.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Efisiensi (%)',
                        data: values,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#8b5cf6'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, grid: { display: false }, ticks: { font: { size: 8 }, callback: v => v + '%' } },
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [data, type]);

    return (
        <div className="w-full h-36 bg-slate-50 border border-slate-200/60 rounded-xl p-3 my-2 shadow-inner">
            <canvas ref={canvasRef}></canvas>
        </div>
    );
}

function parseMarkdownToReact(text, stats) {
    if (!text) return null;
    
    const lines = text.split('\n');
    const elements = [];
    let currentList = [];
    let insideTable = false;
    let tableHeaders = [];
    let tableRows = [];
    let insideCode = false;
    let codeLines = [];

    const flushList = (key) => {
        if (currentList.length > 0) {
            elements.push(
                <ul key={`ul-${key}`} className="space-y-1 my-2 list-disc pl-5">
                    {currentList}
                </ul>
            );
            currentList = [];
        }
    };

    const flushTable = (key) => {
        if (insideTable) {
            elements.push(
                <div key={`table-wrapper-${key}`} className="overflow-x-auto my-3 border border-slate-200/80 rounded-2xl shadow-sm">
                    <table className="w-full text-left border-collapse bg-white">
                        <thead>
                            <tr className="bg-slate-900 text-white border-b border-slate-200">
                                {tableHeaders.map((h, i) => (
                                    <th key={i} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider">{h.trim()}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map((row, ri) => (
                                <tr key={ri} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="px-4 py-2 text-[10px] font-bold text-slate-700">{parseInlineStyles(cell)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            insideTable = false;
            tableHeaders = [];
            tableRows = [];
        }
    };

    const flushCode = (key) => {
        if (insideCode) {
            elements.push(
                <div key={`code-${key}`} className="bg-slate-950 text-slate-100 p-4 rounded-2xl font-mono text-[9px] my-2 overflow-x-auto border border-slate-800 leading-relaxed whitespace-pre shadow-inner">
                    {codeLines.join('\n')}
                </div>
            );
            insideCode = false;
            codeLines = [];
        }
    };

    const parseInlineStyles = (txt) => {
        if (!txt) return "";
        let key = 0;
        let remaining = txt;
        
        // Regex for bold **bold**
        const boldRegex = /\*\*([^*]+)\*\*/g;
        let match;
        let lastIndex = 0;
        const inlineElements = [];
        
        while ((match = boldRegex.exec(remaining)) !== null) {
            const before = remaining.substring(lastIndex, match.index);
            if (before) inlineElements.push(<span key={key++}>{before}</span>);
            
            const boldText = match[1];
            const isAlert = /NG|defect|critical|prioritas|persen|%|gagal|error|mismatch|mati|prioritas/i.test(boldText) || /\b\d+([.,]\d+)?\b/.test(boldText);
            
            inlineElements.push(
                <strong key={key++} className={`font-black ${isAlert ? 'text-red-600 bg-red-50/80 border border-red-100 px-1.5 py-0.5 rounded-md mx-0.5' : 'text-slate-900 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded-md mx-0.5'}`}>
                    {boldText}
                </strong>
            );
            lastIndex = boldRegex.lastIndex;
        }
        
        const after = remaining.substring(lastIndex);
        if (after) inlineElements.push(<span key={key++}>{after}</span>);
        
        return inlineElements.length > 0 ? inlineElements : txt;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 1. Chart tag injections
        if (trimmed === '[CHART: PARETO]') {
            flushList(i);
            elements.push(<InlineChart key={`inline-chart-pareto-${i}`} type="pareto" data={stats?.pareto} />);
            continue;
        }
        if (trimmed === '[CHART: TREND]') {
            flushList(i);
            elements.push(<InlineChart key={`inline-chart-trend-${i}`} type="trend" data={stats?.trend} />);
            continue;
        }
        if (trimmed.startsWith('[HOTSPOT:') && trimmed.includes(']')) {
            flushList(i);
            const checkNo = trimmed.replace('[HOTSPOT:', '').replace(']', '').trim();
            elements.push(
                <div key={`hotspot-inline-${i}`} className="my-2.5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-200 p-4 rounded-2xl flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-md">
                            #{checkNo}
                        </div>
                        <div>
                            <div className="text-[8px] font-black text-purple-600 uppercase tracking-widest">Defect Hotspot Locator</div>
                            <div className="text-[10px] font-black text-slate-800">Visual check point #{checkNo} terpantau mengalami defect.</div>
                        </div>
                    </div>
                </div>
            );
            continue;
        }

        // 2. Code Block logic
        if (trimmed.startsWith('```')) {
            if (insideCode) {
                flushCode(i);
            } else {
                flushList(i);
                flushTable(i);
                insideCode = true;
            }
            continue;
        }

        if (insideCode) {
            codeLines.push(line);
            continue;
        }

        // 3. Table Block logic
        if (trimmed.startsWith('|')) {
            flushList(i);
            flushCode(i);
            
            const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            if (trimmed.includes('---')) {
                continue;
            }
            
            if (!insideTable) {
                insideTable = true;
                tableHeaders = cells;
            } else {
                tableRows.push(cells);
            }
            continue;
        } else if (insideTable) {
            flushTable(i);
        }

        // 4. Headers
        if (trimmed.startsWith('### ')) {
            flushList(i);
            const headerText = trimmed.replace('### ', '');
            elements.push(
                <h3 key={`h3-${i}`} className="text-[11px] font-black text-slate-800 border-b border-indigo-100 pb-1 mt-4 mb-2 flex items-center gap-2 uppercase tracking-wider">
                    <div className="w-1.5 h-3 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full shrink-0" />
                    {headerText}
                </h3>
            );
            continue;
        }

        if (trimmed.startsWith('#### ')) {
            flushList(i);
            const headerText = trimmed.replace('#### ', '');
            elements.push(
                <h4 key={`h4-${i}`} className="text-[10px] font-black text-indigo-600 mt-3 mb-1 flex items-center gap-1">
                    <i className="fas fa-caret-right text-indigo-500" />
                    {headerText}
                </h4>
            );
            continue;
        }

        // 5. Bullet points
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\.\s+/.test(trimmed)) {
            const isNumbered = /^\d+\.\s+/.test(trimmed);
            const listText = trimmed.replace(/^[*|-]\s+/, '').replace(/^\d+\.\s+/, '');
            currentList.push(
                <li key={`li-${i}-${currentList.length}`} className={`text-[10px] font-bold text-slate-600 leading-relaxed ml-2 ${isNumbered ? 'list-decimal' : 'list-disc'}`}>
                    {parseInlineStyles(listText)}
                </li>
            );
            continue;
        } else {
            flushList(i);
        }

        // 6. Separator line
        if (trimmed === '---') {
            elements.push(<hr key={`hr-${i}`} className="my-3 border-t border-slate-100" />);
            continue;
        }

        // 7. Normal paragraph
        if (trimmed !== '') {
            if (trimmed.startsWith('[') && trimmed.includes(']')) {
                elements.push(
                    <div key={`badge-${i}`} className="my-1.5 inline-block px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-[8px] uppercase tracking-wider rounded-lg shadow-sm">
                        {trimmed}
                    </div>
                );
            } else {
                elements.push(
                    <p key={`p-${i}`} className="text-[10px] leading-relaxed text-slate-600 font-bold mb-2">
                        {parseInlineStyles(line)}
                    </p>
                );
            }
        }
    }

    flushList(lines.length);
    flushTable(lines.length);
    flushCode(lines.length);

    return elements;
}

function DashboardTab({ api_url }) {
    const [stats, setStats] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [dateRange, setDateRange] = React.useState({
        start: (() => {
            const d = new Date();
            d.setMonth(d.getMonth() - 1);
            return d.toISOString().split('T')[0];
        })(),
        end: new Date().toISOString().split('T')[0]
    });
    const [activeFilter, setActiveFilter] = React.useState('30 Hari');

    // State for dynamic yearly quality ratios
    const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
    const [availableYears, setAvailableYears] = React.useState([new Date().getFullYear()]);
    const [yearlyData, setYearlyData] = React.useState({ frameRatios: [], pointRatios: [] });

    // States for AI Analysis Assistant
    const [isChatOpen, setIsChatOpen] = React.useState(false);
    const [isChatMaximized, setIsChatMaximized] = React.useState(false);
    const [showQuickPrompts, setShowQuickPrompts] = React.useState(true);
    
    const [chatMessages, setChatMessages] = React.useState(() => {
        const saved = localStorage.getItem('qc_scanner_chat_history');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Error parsing chat history:", e);
            }
        }
        return [
            { role: 'model', content: 'Halo! Saya adalah Asisten Analisis AI QC Scanner Anda. Silakan pilih rekomendasi analisis di bawah atau ketik pertanyaan Anda sendiri terkait data produksi & defect saat ini.' }
        ];
    });
    const [chatInput, setChatInput] = React.useState('');
    const [isChatLoading, setIsChatLoading] = React.useState(false);
    const chatEndRef = React.useRef(null);

    React.useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isChatOpen]);

    // Save chat history to localStorage automatically
    React.useEffect(() => {
        localStorage.setItem('qc_scanner_chat_history', JSON.stringify(chatMessages));
    }, [chatMessages]);

    const handleClearChatHistory = () => {
        if (confirm("Apakah Anda yakin ingin menghapus seluruh riwayat obrolan AI?")) {
            const initialMsg = [
                { role: 'model', content: 'Halo! Saya adalah Asisten Analisis AI QC Scanner Anda. Silakan pilih rekomendasi analisis di bawah atau ketik pertanyaan Anda sendiri terkait data produksi & defect saat ini.' }
            ];
            setChatMessages(initialMsg);
            localStorage.setItem('qc_scanner_chat_history', JSON.stringify(initialMsg));
        }
    };

    const handleSendChatMessage = async (msgText = chatInput) => {
        const textToSend = typeof msgText === 'string' ? msgText : chatInput;
        if (!textToSend || !textToSend.trim()) return;
        
        const newMsg = { role: 'user', content: textToSend };
        setChatMessages(prev => [...prev, newMsg]);
        setChatInput('');
        setIsChatLoading(true);

        try {
            const currentContext = {
                active_filters: {
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    active_filter: activeFilter
                },
                summary: stats?.summary || {},
                top_problematic_parts: stats?.topParts || [],
                pareto_defects: stats?.pareto?.slice(0, 10) || [],
                line_pos_breakdown: stats?.lines || []
            };

            const response = await fetch(`${api_url}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: textToSend,
                    history: chatMessages.slice(1).map(m => ({ role: m.role, content: m.content })),
                    context: currentContext
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                setChatMessages(prev => [...prev, { role: 'model', content: result.reply }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: ${result.message || 'Gagal terhubung dengan asisten AI.'}` }]);
            }
        } catch (error) {
            console.error("AI Chat error:", error);
            setChatMessages(prev => [...prev, { role: 'model', content: '⚠️ Gagal mengirim pesan ke server. Pastikan koneksi internet aktif.' }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const quickPrompts = [
        { label: "💡 Saran Pareto Defect", prompt: "Berikan saran perbaikan taktis terhadap defect utama berdasarkan data pareto saat ini." },
        { label: "⚙️ Prioritas Perbaikan Mesin", prompt: "Mesin (Line/Pos) mana yang paling kritis untuk segera diperbaiki dan jelaskan alasannya berdasarkan data yang ada." },
        { label: "📊 Summary Kualitas Global", prompt: "Berikan ringkasan performa kualitas global (Frame OK vs Point OK Ratio) periode ini dan perbandingannya terhadap target." }
    ];

    const chartRefs = React.useRef({ trend: null, pareto: null, frameOk: null, pointOk: null, efficiency: null });
    const canvasRefs = { 
        trend: React.useRef(null), 
        pareto: React.useRef(null),
        frameOk: React.useRef(null),
        pointOk: React.useRef(null),
        efficiency: React.useRef(null)
    };

    React.useEffect(() => {
        fetchDashboardData();
    }, []);

    React.useEffect(() => {
        fetchYearlyData(selectedYear);
    }, [selectedYear]);

    const fetchYearlyData = async (year = selectedYear) => {
        try {
            const res = await fetch(`${api_url}/api/dashboard/yearly-ratios?year=${year}`);
            const result = await res.json();
            if (result.status === 'success') {
                setYearlyData(result);
                if (result.availableYears && result.availableYears.length > 0) {
                    setAvailableYears(result.availableYears);
                }
                renderYearlyCharts(result);
            }
        } catch (error) {
            console.error("Yearly ratios fetch error:", error);
        }
    };

    const fetchDashboardData = async (start = dateRange.start, end = dateRange.end) => {
        setIsLoading(true);
        try {
            const url = new URL(`${api_url}/api/dashboard/advanced`);
            if (start) url.searchParams.append('startDate', start);
            if (end) url.searchParams.append('endDate', end);
            
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') {
                setStats(result);
                renderCharts(result);
            }
        } catch (error) {
            console.error("Dashboard fetch error:", error);
        } finally {
            setIsLoading(false);
        }
        // Always re-fetch and re-render yearly charts when period changes
        // so the Tren Kualitas Bulanan section stays in sync
        fetchYearlyData(selectedYear);
    };

    const renderCharts = (data) => {
        const safeChart = (name, cb) => {
            try {
                if (chartRefs.current[name]) chartRefs.current[name].destroy();
                if (cb) cb();
            } catch (e) { console.warn('Chart init error (' + name + '):', e); }
        };
        setTimeout(() => {
            // 1. NG Ratio Trend Chart
            safeChart('trend', () => {
                if (!canvasRefs.trend.current) return;
                const trendData = data.trend || [];
                const labels = trendData.map(t => new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
                const values = trendData.map(t => Number(t.ratio));
                
                chartRefs.current.trend = new Chart(canvasRefs.trend.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                type: 'line',
                                label: 'NG Ratio (%)',
                                data: values,
                                borderColor: '#3b82f6',
                                backgroundColor: '#3b82f6',
                                fill: false,
                                tension: 0.4,
                                borderWidth: 3,
                                pointRadius: 4,
                                pointBackgroundColor: '#3b82f6',
                                order: 1
                            },
                            {
                                type: 'bar',
                                label: 'NG Ratio (%) Bar',
                                data: values,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                borderColor: 'rgba(59, 130, 246, 0.3)',
                                borderWidth: 1,
                                borderRadius: 4,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: 'Target (92.5%)',
                                data: new Array(labels.length).fill(92.5),
                                borderColor: '#ef4444',
                                borderDash: [5, 5],
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: false,
                                order: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                max: 100,
                                ticks: { callback: v => v + '%' }
                            } 
                        },
                        plugins: {
                            legend: { 
                                position: 'top', 
                                labels: { 
                                    boxWidth: 12, 
                                    font: { size: 10, weight: 'bold' },
                                    filter: (item) => !item.text.endsWith('Bar')
                                } 
                            },
                            tooltip: { 
                                mode: 'index', 
                                intersect: false,
                                filter: (item) => !item.dataset.label.endsWith('Bar')
                            }
                        }
                    }
                });
            });

            // 2. Global Pareto
            safeChart('pareto', () => {
                if (!canvasRefs.pareto.current) return;
                const paretoData = data.pareto || [];
                const labels = paretoData.map(p => {
                    const guidance = window.DEFECT_GUIDANCE?.find(g => g.code === p.defect_code);
                    return guidance ? `${p.defect_code} - ${guidance.name}` : p.defect_code;
                });
                const values = paretoData.map(p => p.total_qty);

                chartRefs.current.pareto = new Chart(canvasRefs.pareto.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Total Defects',
                            data: values,
                            backgroundColor: '#f59e0b',
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        plugins: {
                            legend: { display: false }
                        },
                        scales: { x: { beginAtZero: true } }
                    }
                });
            });

            // 3. Efficiency Trend Chart (bar + line hybrid)
            safeChart('efficiency', () => {
                if (!canvasRefs.efficiency.current) return;
                const effData = data.efficiencyTrend || [];
                const labels = effData.map(t => {
                    const d = new Date(t.month + 'T00:00:00');
                    return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
                });
                const values = effData.map(t => Number(t.avg_efficiency));

                chartRefs.current.efficiency = new Chart(canvasRefs.efficiency.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            type: 'line',
                            label: 'Efisiensi (%)',
                            data: values,
                            borderColor: '#8b5cf6',
                            backgroundColor: '#8b5cf6',
                            fill: false,
                            tension: 0.3,
                            borderWidth: 3,
                            pointRadius: 4,
                            pointBackgroundColor: '#8b5cf6',
                            spanGaps: false,
                            order: 1
                        }, {
                            type: 'bar',
                            label: 'Efisiensi (%) Bar',
                            data: values,
                            backgroundColor: 'rgba(139, 92, 246, 0.15)',
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            borderWidth: 1,
                            borderRadius: 4,
                            order: 2
                        }, {
                            type: 'line',
                            label: 'Target (100%)',
                            data: values.map(() => 100),
                            borderColor: '#10b981',
                            borderDash: [5, 5],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            order: 3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, max: 100, grid: { display: false }, ticks: { font: { size: 10 }, callback: v => v + '%' } },
                            x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' }, filter: (item) => !item.text.endsWith('Bar') } },
                            tooltip: { mode: 'index', intersect: false, filter: (item) => !item.dataset.label.endsWith('Bar') }
                        }
                    }
                });
            });
        }, 100);
    };

    const renderYearlyCharts = (data) => {
        setTimeout(() => {
            // 1. Frame OK Ratio Bulanan Chart
            if (chartRefs.current.frameOk) chartRefs.current.frameOk.destroy();
            if (canvasRefs.frameOk.current) {
                const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
                const values = data.frameRatios || Array(12).fill(null);
                
                // Safe min calculation: filter out nulls before finding minimum
                const validValues = values.filter(v => v !== null && v !== undefined);
                const frameMin = validValues.length > 0
                    ? Math.max(0, Math.min(90, Math.floor(Math.min(...validValues) - 2)))
                    : 90;
                
                chartRefs.current.frameOk = new Chart(canvasRefs.frameOk.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                type: 'line',
                                label: 'Frame OK Ratio (Chokoritsu) (%)',
                                data: values,
                                borderColor: '#10b981', // emerald
                                backgroundColor: '#10b981',
                                fill: false,
                                tension: 0.3,
                                borderWidth: 3,
                                pointRadius: 4,
                                pointBackgroundColor: '#10b981',
                                spanGaps: false, // don't connect across null months
                                order: 1
                            },
                            {
                                type: 'bar',
                                label: 'Frame OK Ratio (Chokoritsu) (%) Bar',
                                data: values,
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                borderColor: 'rgba(16, 185, 129, 0.3)',
                                borderWidth: 1,
                                borderRadius: 4,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: 'Target (98.0%)',
                                data: new Array(12).fill(98.0),
                                borderColor: '#ef4444',
                                borderDash: [5, 5],
                                borderWidth: 1.5,
                                pointRadius: 0,
                                fill: false,
                                order: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { 
                            y: { 
                                beginAtZero: false,
                                min: frameMin,
                                max: 100,
                                ticks: { callback: v => v + '%' }
                            } 
                        },
                        plugins: {
                            legend: { 
                                position: 'top', 
                                labels: { 
                                    boxWidth: 12, 
                                    font: { size: 10, weight: 'bold' },
                                    filter: (item) => !item.text.endsWith('Bar')
                                } 
                            },
                            tooltip: { 
                                mode: 'index', 
                                intersect: false,
                                filter: (item) => !item.dataset.label.endsWith('Bar'),
                                callbacks: {
                                    label: (ctx) => {
                                        if (ctx.raw === null || ctx.raw === undefined) return null;
                                        return ` ${ctx.dataset.label}: ${ctx.raw}%`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // 2. Point OK Ratio Bulanan Chart
            if (chartRefs.current.pointOk) chartRefs.current.pointOk.destroy();
            if (canvasRefs.pointOk.current) {
                const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
                const values = data.pointRatios || Array(12).fill(null);
                
                // Safe min calculation: filter out nulls
                const validValues = values.filter(v => v !== null && v !== undefined);
                const pointMin = validValues.length > 0
                    ? Math.max(0, Math.min(95, Math.floor(Math.min(...validValues) - 2)))
                    : 90;
                
                chartRefs.current.pointOk = new Chart(canvasRefs.pointOk.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                type: 'line',
                                label: 'Point OK Ratio (%)',
                                data: values,
                                borderColor: '#3b82f6', // blue
                                backgroundColor: '#3b82f6',
                                fill: false,
                                tension: 0.3,
                                borderWidth: 3,
                                pointRadius: 4,
                                pointBackgroundColor: '#3b82f6',
                                spanGaps: false, // don't connect across null months
                                order: 1
                            },
                            {
                                type: 'bar',
                                label: 'Point OK Ratio (%) Bar',
                                data: values,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                borderColor: 'rgba(59, 130, 246, 0.3)',
                                borderWidth: 1,
                                borderRadius: 4,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: 'Target (99.5%)',
                                data: new Array(12).fill(99.5),
                                borderColor: '#ef4444',
                                borderDash: [5, 5],
                                borderWidth: 1.5,
                                pointRadius: 0,
                                fill: false,
                                order: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { 
                            y: { 
                                beginAtZero: false,
                                min: pointMin,
                                max: 100,
                                ticks: { callback: v => v + '%' }
                            } 
                        },
                        plugins: {
                            legend: { 
                                position: 'top', 
                                labels: { 
                                    boxWidth: 12, 
                                    font: { size: 10, weight: 'bold' },
                                    filter: (item) => !item.text.endsWith('Bar')
                                } 
                            },
                            tooltip: { 
                                mode: 'index', 
                                intersect: false,
                                filter: (item) => !item.dataset.label.endsWith('Bar'),
                                callbacks: {
                                    label: (ctx) => {
                                        if (ctx.raw === null || ctx.raw === undefined) return null;
                                        return ` ${ctx.dataset.label}: ${ctx.raw}%`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }, 100);
    };

    if (isLoading && !stats) return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-500 font-bold animate-pulse">Menghimpun Data Strategis...</p>
        </div>
    );

    const hasNoData = !stats || !stats.summary || stats.summary.total_prod === null || Number(stats.summary.total_prod || 0) === 0;

    // Calculate top defect details from stats.pareto
    const pareto = stats?.pareto || [];
    const topDefect = pareto.length > 0 ? pareto[0] : null;
    const topDefectCode = topDefect ? topDefect.defect_code : '-';
    const topDefectQty = topDefect ? Number(topDefect.total_qty) : 0;
    const topDefectGuidanceEntry = window.DEFECT_GUIDANCE?.find(g => g.code === topDefectCode);
    const topDefectGuidance = topDefectGuidanceEntry ? topDefectGuidanceEntry.name : 'Tidak ada defect';

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Filter */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl gap-6">
                <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Dashboard Kualitas Global</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pusat Kendali Performa Produksi</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 px-3 border-r border-slate-200">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Periode</span>
                        <input type="date" value={dateRange.start} onChange={(e) => { setDateRange({...dateRange, start: e.target.value}); setActiveFilter('custom'); }} className="bg-transparent text-[10px] font-bold outline-none" />
                        <span className="text-slate-300">-</span>
                        <input type="date" value={dateRange.end} onChange={(e) => { setDateRange({...dateRange, end: e.target.value}); setActiveFilter('custom'); }} className="bg-transparent text-[10px] font-bold outline-none" />
                    </div>
                    <div className="flex gap-1">
                        {[
                            {label: 'Hari Ini', days: 0},
                            {label: '7 Hari', days: 7},
                            {label: '30 Hari', days: 30},
                            {label: 'Semua', days: null},
                        ].map(btn => (
                            <button 
                                key={btn.label}
                                onClick={() => {
                                    const end = new Date();
                                    const start = btn.days !== null ? new Date() : null;
                                    if (start) start.setDate(end.getDate() - btn.days);
                                    
                                    const startStr = start ? start.toISOString().split('T')[0] : '';
                                    const endStr = end.toISOString().split('T')[0];
                                    
                                    setDateRange({ start: startStr, end: endStr });
                                    setActiveFilter(btn.label);
                                    fetchDashboardData(startStr, endStr);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${activeFilter === btn.label ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => fetchDashboardData()} className="bg-slate-800 text-white w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-900 transition-all ml-1">
                        <i className="fas fa-sync-alt text-xs"></i>
                    </button>
                </div>
            </div>

            {hasNoData && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-slate-200 shadow-xl gap-4 animate-in fade-in duration-500">
                    <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center text-2xl shadow-inner"><i className="fas fa-database text-slate-300 animate-pulse"></i></div>
                    <div className="text-center">
                        <h3 className="text-lg font-black text-slate-700 tracking-tight">Tidak Ada Data Untuk Periode Ini</h3>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Silakan input data Check Sheet baru atau sesuaikan filter periode Anda</p>
                    </div>
                    <button onClick={() => fetchDashboardData()} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                        <i className="fas fa-sync-alt"></i> COBA LAGI
                    </button>
                </div>
            )}

            <div className={hasNoData ? "hidden" : "space-y-6"}>
                {/* KPI Row */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[
                        { 
                            label: 'Total Produksi', 
                            value: stats?.summary?.total_prod ? Number(stats.summary.total_prod).toLocaleString() : '0', 
                            icon: 'fa-industry', 
                            color: 'blue',
                            subtext: 'Unit Frame'
                        },
                        { 
                            label: 'Total NG Qty', 
                            value: stats?.summary?.total_ng_frame ? Number(stats.summary.total_ng_frame).toLocaleString() : '0', 
                            icon: 'fa-times-circle', 
                            color: 'red',
                            subtext: 'Frame NG'
                        },
                        { 
                            label: 'Frame OK Ratio (Chokoritsu) (%)', 
                            value: stats?.summary?.total_prod 
                                ? (((stats.summary.total_prod - stats.summary.total_ng_frame) / stats.summary.total_prod) * 100).toFixed(2) + '%' 
                                : '100.00%', 
                            icon: 'fa-percentage', 
                            color: 'emerald',
                            subtext: 'Target: >98.0%'
                        },
                        { 
                            label: 'Point OK Ratio (%)', 
                            value: stats?.summary?.max_points 
                                ? (((stats.summary.max_points - stats.summary.total_ng_point) / stats.summary.max_points) * 100).toFixed(2) + '%' 
                                : '100.00%', 
                            icon: 'fa-bullseye', 
                            color: 'teal',
                            subtext: 'Target: >99.5%'
                        },
                        { 
                            label: 'Efisiensi Rata-rata', 
                            value: stats?.summary?.avg_efficiency > 0 
                                ? Number(stats.summary.avg_efficiency).toFixed(1) + '%' 
                                : '-', 
                            icon: 'fa-gauge-high', 
                            color: 'purple',
                            subtext: stats?.summary?.total_checks > 0 
                                ? `${Number(stats.summary.total_checks).toLocaleString()} item` 
                                : 'Belum ada data'
                        },
                        { 
                            label: 'Top Defect', 
                            value: topDefectCode !== '-' ? `${topDefectCode} (${topDefectQty} pcs)` : 'Aman (0 NG)', 
                            icon: 'fa-triangle-exclamation', 
                            color: 'orange',
                            subtext: topDefectGuidance
                        },
                    ].map((card, i) => (
                        <div key={i} className="bg-white p-5 rounded-[1.8rem] border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                            <div className={`w-12 h-12 bg-${card.color}-50 text-${card.color}-600 rounded-2xl flex items-center justify-center text-lg shrink-0 shadow-inner`}><i className={`fas ${card.icon}`}></i></div>
                            <div>
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</div>
                                <div className="text-xl font-black text-slate-800">{card.value}</div>
                                <div className="text-[9px] text-slate-400 font-bold mt-0.5">{card.subtext}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Trend Charts - Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Tren % NG Ratio Bulanan
                            </h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-0.5 bg-red-500 border-t-2 border-dashed border-red-500"></div>
                                    <span className="text-[10px] font-bold text-slate-400">Target 92.5%</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[350px]">
                            <canvas ref={canvasRefs.trend}></canvas>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-purple-600 rounded-full"></div> Tren Efisiensi Bulanan
                            </h3>
                        </div>
                        <div className="h-[350px]">
                            <canvas ref={canvasRefs.efficiency}></canvas>
                        </div>
                    </div>
                </div>

                {/* Yearly Quality Yield section */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> Tren Kualitas Bulanan - Tahun {selectedYear}
                            </h3>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Analisis Komparatif Chokoritsu Frame & Point OK secara Akumulatif</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Tahun:</span>
                            <select 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-blue-500 cursor-pointer shadow-sm hover:bg-slate-100 transition-all"
                            >
                                {availableYears.map(yr => (
                                    <option key={yr} value={yr}>{yr}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Frame OK Yield Chart */}
                        <div className="border border-slate-100 p-5 rounded-[1.8rem] bg-slate-50/50">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Grafik Frame OK Ratio (Chokoritsu) (%)</div>
                                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md">Target: 98.0%</span>
                            </div>
                            <div className="h-[260px]">
                                <canvas ref={canvasRefs.frameOk}></canvas>
                            </div>
                        </div>

                        {/* Point OK Yield Chart */}
                        <div className="border border-slate-100 p-5 rounded-[1.8rem] bg-slate-50/50">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Grafik Point OK Ratio (%)</div>
                                <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">Target: 99.5%</span>
                            </div>
                            <div className="h-[260px]">
                                <canvas ref={canvasRefs.pointOk}></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Line / Pos Machine Analytics */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-purple-600 rounded-full"></div> Prioritas Perbaikan Mesin (Line / Pos)
                            </h3>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Prioritas tindakan berdasarkan volume defect pada stasiun kerja/mesin</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {stats?.lines?.map((item, index) => {
                            const ratio = Number(item.ng_ratio || 0);
                            let priority = "MEDIUM";
                            let colorClass = "bg-yellow-50 text-yellow-600 border-yellow-100";
                            if (ratio >= 5.0 || item.total_ng_frame >= 20) {
                                priority = "CRITICAL";
                                colorClass = "bg-red-50 text-red-600 border-red-100 animate-pulse";
                            } else if (ratio >= 2.0 || item.total_ng_frame >= 10) {
                                priority = "HIGH";
                                colorClass = "bg-orange-50 text-orange-600 border-orange-100";
                            }
                            return (
                                <div key={index} className="bg-slate-50/50 border border-slate-100 p-5 rounded-3xl flex flex-col justify-between hover:shadow-md transition-all hover:scale-[1.02]">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-sm shadow-inner shrink-0">
                                            <i className="fas fa-robot"></i>
                                        </div>
                                        <span className={`px-2 py-0.5 text-[8px] font-black tracking-widest border rounded-md uppercase ${colorClass}`}>
                                            {priority}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">STASIUN KERJA</div>
                                        <h4 className="text-base font-black text-slate-800 truncate mb-3" title={item.line_pos}>{item.line_pos}</h4>
                                        <div className="space-y-1 border-t border-slate-100 pt-3">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400 font-bold">Total NG:</span>
                                                <span className="text-slate-700 font-black">{Number(item.total_ng_frame).toLocaleString()} pcs</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-400 font-bold">Rasio Defect:</span>
                                                <span className="text-red-500 font-black">{Number(item.ng_ratio || 0).toFixed(2)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {(!stats?.lines || stats.lines.length === 0) && (
                            <div className="col-span-5 py-8 text-center text-slate-400 font-bold italic text-xs">
                                Tidak ada data Line / Pos yang tercatat dalam periode ini.
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Top Parts Table */}
                    <div className="lg:col-span-7 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <div className="w-1.5 h-4 bg-red-600 rounded-full"></div> Top 5 NG Ratio Parts
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Part Info</th>
                                        <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Prod</th>
                                        <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">NG Frame</th>
                                        <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">NG Ratio</th>
                                        <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats?.topParts?.map((p, i) => (
                                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                            <td className="py-4">
                                                <div className="font-bold text-slate-800 text-xs">{p.part_number}</div>
                                                <div className="text-[9px] text-slate-400 font-bold uppercase">{p.model}</div>
                                            </td>
                                            <td className="py-4 text-center text-xs font-bold text-slate-600">{Number(p.total_prod).toLocaleString()}</td>
                                            <td className="py-4 text-center text-xs font-bold text-red-600">{Number(p.total_ng_frame).toLocaleString()}</td>
                                            <td className="py-4 text-center">
                                                <div className="inline-block px-3 py-1 bg-red-50 text-red-600 rounded-full font-black text-xs">
                                                    {Number(p.ng_ratio).toFixed(2)}%
                                                </div>
                                            </td>
                                            <td className="py-4 text-center">
                                                <button 
                                                    onClick={() => window.showPartAnalytics && window.showPartAnalytics({ part_number: p.part_number, part_name: p.part_name || p.part_number, model: p.model, initialModel: p.model })}
                                                    className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 p-1.5 rounded-xl border border-blue-100 hover:border-blue-200 transition-all inline-flex items-center justify-center w-8 h-8 hover:scale-105 shadow-sm"
                                                    title="Lihat Analitik Part"
                                                >
                                                    <i className="fas fa-eye text-xs"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {stats?.topParts?.length === 0 && <tr><td colSpan="5" className="py-10 text-center text-slate-300 italic font-bold">Tidak ada data untuk periode ini</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pareto Chart */}
                    <div className="lg:col-span-5 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div> Global Defect Distribution
                        </h3>
                        <div className="flex-1 min-h-[300px]">
                            <canvas ref={canvasRefs.pareto}></canvas>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tombol Sakti AI Assistant Button */}
            <button 
                onClick={() => setIsChatOpen(true)}
                className="fixed bottom-6 right-6 bg-gradient-to-tr from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(124,58,237,0.4)] hover:shadow-[0_15px_30px_rgba(124,58,237,0.6)] transition-all hover:scale-110 z-50 group border border-white/10"
                title="Tanya AI Asisten Analisis"
            >
                <i className="fas fa-wand-magic-sparkles text-xl animate-pulse group-hover:rotate-12"></i>
                <span className="absolute right-16 bg-slate-900 text-white text-[10px] font-black tracking-widest px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-white/5 uppercase">TANYA AI</span>
            </button>

            {/* AI Assistant Sidebar Panel */}
            {isChatOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex justify-end animate-in fade-in duration-300">
                    <div className="absolute inset-0" onClick={() => setIsChatOpen(false)} />
                    
                    <div className={`w-full ${isChatMaximized ? 'max-w-[calc(100vw-5rem)] md:max-w-[calc(100vw-6rem)] lg:max-w-[calc(100%-6rem)]' : 'max-w-md'} bg-white h-full relative z-10 shadow-2xl border-l border-slate-100 flex flex-col transition-all duration-300 animate-in slide-in-from-right`}>
                        {/* Chat Header */}
                        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-xl flex items-center justify-center text-base shadow-lg shadow-purple-500/20 shrink-0">
                                    <i className="fas fa-wand-magic-sparkles"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-sm tracking-tight text-white leading-none">AI ASISTEN ANALISIS</h3>
                                    <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mt-1">WIS AI Engine</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleClearChatHistory} 
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                                    title="Bersihkan Riwayat Obrolan"
                                >
                                    <i className="fas fa-trash text-xs text-white"></i>
                                </button>
                                <button 
                                    onClick={() => setIsChatMaximized(!isChatMaximized)} 
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                                    title={isChatMaximized ? "Tampilan Samping (Compact View)" : "Tampilan Lebar (Full View)"}
                                >
                                    <i className={`fas ${isChatMaximized ? 'fa-compress-alt' : 'fa-expand-alt'} text-xs text-white`}></i>
                                </button>
                                <button onClick={() => { setIsChatOpen(false); setIsChatMaximized(false); }} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0">
                                    <i className="fas fa-times text-sm text-white"></i>
                                </button>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/50">
                            {chatMessages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-[1.5rem] p-4 text-xs shadow-sm border ${
                                        msg.role === 'user' 
                                            ? 'bg-blue-600 text-white rounded-br-none border-blue-500 shadow-blue-500/10' 
                                            : 'bg-white text-slate-800 rounded-bl-none border-slate-200/80'
                                    }`}>
                                        <div className="space-y-1">
                                            {msg.role === 'user' ? (
                                                <div className="leading-relaxed font-bold whitespace-pre-wrap">{msg.content}</div>
                                            ) : (
                                                parseMarkdownToReact(msg.content, stats)
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isChatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white rounded-[1.5rem] rounded-bl-none p-4 border border-slate-200/80 flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">AI sedang berpikir...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Quick Prompts Container */}
                        <div className="p-4 border-t border-slate-100 bg-white shadow-inner">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rekomendasi Analisis Cepat:</span>
                                <button 
                                    onClick={() => setShowQuickPrompts(!showQuickPrompts)} 
                                    className="text-slate-400 hover:text-slate-600 transition-colors w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-100 shrink-0"
                                    title={showQuickPrompts ? "Sembunyikan" : "Tampilkan"}
                                >
                                    <i className={`fas ${showQuickPrompts ? 'fa-chevron-down' : 'fa-chevron-up'} text-[9px]`}></i>
                                </button>
                            </div>
                            {showQuickPrompts && (
                                <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                                    {quickPrompts.map((qp, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => handleSendChatMessage(qp.prompt)}
                                            disabled={isChatLoading}
                                            className="text-left px-3 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-xl text-[10px] font-bold border border-slate-100 hover:border-blue-100 transition-all truncate"
                                        >
                                            {qp.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Chat Input Field */}
                        <div className="p-4 border-t border-slate-100 bg-white flex gap-2">
                            <input 
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSendChatMessage(); }}
                                placeholder="Ketik pertanyaan atau saran mesin..."
                                className="flex-1 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800"
                                disabled={isChatLoading}
                            />
                            <button 
                                onClick={() => handleSendChatMessage()}
                                disabled={isChatLoading || !chatInput.trim()}
                                className="w-12 h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-blue-600/10 hover:scale-105 active:scale-95 shrink-0"
                            >
                                <i className="fas fa-paper-plane text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
window.DashboardTab = DashboardTab;
