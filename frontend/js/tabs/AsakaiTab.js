function AsakaiTab({ api_url }) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = React.useState(todayStr);
    const [data, setData] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [expandedLine, setExpandedLine] = React.useState(null);
    const [expandedModels, setExpandedModels] = React.useState({});
    const [abnormalityStats, setAbnormalityStats] = React.useState([]);

    const fetchData = React.useCallback(async (date) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${api_url}/api/dashboard/asakai?date=${date}`);
            const result = await res.json();
            if (result.status === 'success') setData(result.data);
        } catch (err) {
            console.error('Asakai fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [api_url]);

    const fetchAbnormalityStats = React.useCallback(async (date) => {
        try {
            const res = await fetch(`${api_url}/api/abnormality/stats?date=${date}`);
            const result = await res.json();
            if (result.status === 'success') setAbnormalityStats(result.data);
            else setAbnormalityStats([]);
        } catch (e) {
            console.error('Fetch abnormality stats error:', e);
            setAbnormalityStats([]);
        }
    }, [api_url]);

    React.useEffect(() => { fetchData(selectedDate); fetchAbnormalityStats(selectedDate); }, [selectedDate, fetchData, fetchAbnormalityStats]);

    const toggleLine = (linePos) => {
        setExpandedLine(prev => prev === linePos ? null : linePos);
        setExpandedModels({});
    };

    const toggleModel = (linePos, model) => {
        setExpandedModels(prev => {
            const key = `${linePos}|${model}`;
            const next = { ...prev };
            if (next[key]) delete next[key];
            else next[key] = true;
            return next;
        });
    };

    const calcDelta = (current, previous) => {
        if (!previous || previous === 0) return { value: 0, direction: 'same' };
        const diff = ((current - previous) / previous) * 100;
        if (Math.abs(diff) < 0.05) return { value: 0, direction: 'same' };
        return { value: diff, direction: diff > 0 ? 'up' : 'down' };
    };

    const fmtDelta = (delta, invert) => {
        if (delta.direction === 'same') return null;
        const dir = invert ? (delta.direction === 'up' ? 'down' : 'up') : delta.direction;
        const icon = dir === 'up' ? '▲' : '▼';
        const color = dir === 'up' ? 'text-emerald-500' : 'text-red-500';
        const sign = delta.value > 0 ? '+' : '';
        return { html: `<span class="${color} font-black text-xs">${icon} ${sign}${delta.value.toFixed(1)}%</span>`, color };
    };

    const ratioInfo = (val) => {
        if (val >= 98) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-50 text-emerald-600' };
        if (val >= 95) return { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-50 text-amber-500' };
        return { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-50 text-red-500' };
    };

    const prevDate = data?.previous_date || '';
    const todaySummary = data?.today?.summary;
    const prevSummary = data?.previous?.summary;
    const lines = data?.today?.lines || [];
    const prevLines = data?.previous?.lines || [];

    const summaryCards = [
        { label: 'Produksi', key: 'total_prod', valColor: 'text-slate-800', icon: 'fa-boxes', iconBg: 'bg-blue-50 text-blue-600', borderColor: 'border-slate-200/60', invertDelta: false },
        { label: 'Total OK', key: 'total_ok', valColor: 'text-emerald-600', icon: 'fa-circle-check', iconBg: 'bg-emerald-50 text-emerald-600', borderColor: 'border-slate-200/60', invertDelta: false },
        { label: 'Total NG', key: 'total_ng', valColor: 'text-red-600', icon: 'fa-circle-exclamation', iconBg: 'bg-red-50 text-red-600', borderColor: 'border-red-200/60', invertDelta: true },
        { label: 'OK Ratio', key: 'frame_ok_ratio', valColor: 'text-violet-600', icon: 'fa-percent', iconBg: 'bg-violet-50 text-violet-600', borderColor: 'border-slate-200/60', invertDelta: false, suffix: '%' },
        { label: 'Efisiensi', key: 'avg_efficiency', valColor: 'text-blue-600', icon: 'fa-gauge-high', iconBg: 'bg-blue-50 text-blue-600', borderColor: 'border-slate-200/60', invertDelta: false, suffix: '%' },
    ];

    return (
        <div className="space-y-3 flex flex-col min-h-screen p-3">

            {/* HEADER */}
            <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-sm shadow-inner shrink-0">
                        <i className="fas fa-sun"></i>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-800 tracking-tight leading-none uppercase">Asakai QC Meeting</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Rangkuman Pencapaian Harian</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                    <button onClick={() => fetchData(selectedDate)} className="bg-amber-500 hover:bg-amber-600 text-white w-9 h-9 rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all shrink-0" title="Refresh">
                        <i className="fas fa-sync-alt text-xs"></i>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-bold">
                    <i className="fas fa-spinner animate-spin mr-2"></i> Memuat data...
                </div>
            ) : todaySummary ? (
                <>

                    {/* SUMMARY KPI CARDS + DELTA */}
                    <div className="grid grid-cols-5 gap-3 shrink-0">
                        {summaryCards.map(card => {
                            const val = todaySummary[card.key];
                            const prevVal = prevSummary ? prevSummary[card.key] : undefined;
                            const delta = prevVal !== undefined ? calcDelta(val, prevVal) : { value: 0, direction: 'same' };
                            const deltaInfo = fmtDelta(delta, card.invertDelta);
                            return (
                                <div key={card.key} className={`bg-white p-4 rounded-[1.2rem] border shadow-sm flex items-center gap-3 ${card.borderColor}`}>
                                    <div className={`w-11 h-11 ${card.iconBg} rounded-xl flex items-center justify-center text-base shadow-inner shrink-0`}>
                                        <i className={`fas ${card.icon}`}></i>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{card.label}</div>
                                        <div className={`text-xl font-black leading-tight ${card.valColor}`}>
                                            {val}{card.suffix || ''}
                                        </div>
                                        {deltaInfo && <div className="text-xs font-black leading-tight -mt-0.5" dangerouslySetInnerHTML={{ __html: deltaInfo.html }} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* TOP ABNORMALITY */}
                    {abnormalityStats.length > 0 && (
                        <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-red-100 shrink-0 flex items-center gap-3">
                            <div className="w-9 h-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-sm shadow-inner shrink-0">
                                <i className="fas fa-triangle-exclamation"></i>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest shrink-0">Top Abnormality:</span>
                                {abnormalityStats.slice(0, 5).map((a, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg text-xs font-black text-red-700">
                                        <i className="fas fa-circle-exclamation text-[8px]"></i>
                                        {a.category_4m1e}: {a.problem_category}
                                        <span className="bg-red-200 text-red-800 px-1 rounded text-[8px] ml-0.5">x{a.qty}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* DATE LABEL */}
                    <div className="text-xs font-bold text-slate-400 flex items-center gap-2 shrink-0">
                        <span>Tgl: <strong className="text-slate-600">{selectedDate}</strong></span>
                        {prevDate && <span className="text-slate-300">| vs <strong className="text-slate-500">{prevDate}</strong></span>}
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">{todaySummary.session_count} sesi</span>
                    </div>

                    {/* POS / LINE CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                        {lines.map(line => {
                            const ri = ratioInfo(line.frame_ok_ratio);
                            const prevLine = prevLines.find(p => p.line_pos === line.line_pos);
                            const delta = prevLine ? calcDelta(line.frame_ok_ratio, prevLine.frame_ok_ratio) : { value: 0, direction: 'same' };
                            const deltaInfo = fmtDelta(delta, false);
                            const isExpanded = expandedLine === line.line_pos;
                            return (
                                <div key={line.line_pos} className="flex flex-col">
                                    {/* CARD */}
                                    <div
                                        onClick={() => toggleLine(line.line_pos)}
                                        className={`cursor-pointer bg-white p-4 rounded-xl border shadow-sm flex items-center gap-3 transition-all hover:shadow-md active:scale-[0.98] ${isExpanded ? 'ring-2 ring-amber-400 border-amber-300' : ri.border + ' ' + ri.bg}`}
                                    >
                                        <div className={`w-11 h-11 ${ri.iconBg} rounded-xl flex items-center justify-center text-base shadow-inner shrink-0`}>
                                            <i className="fas fa-microchip"></i>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="text-base font-black text-slate-800 uppercase">{line.line_pos}</span>
                                                <span className={`text-base font-black ${ri.text}`}>{line.frame_ok_ratio}%</span>
                                            </div>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-xs font-bold text-slate-500">{line.total_prod} prod</span>
                                                {deltaInfo && <span className="text-xs font-black" dangerouslySetInnerHTML={{ __html: deltaInfo.html }} />}
                                            </div>
                                        </div>
                                        <div className={`text-[10px] text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                            <i className="fas fa-chevron-down"></i>
                                        </div>
                                    </div>

                                    {/* ACCORDION DETAIL */}
                                    {isExpanded && (
                                        <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl px-4 pb-4 pt-2 space-y-3">
                                            {line.models.map(m => {
                                                const mKey = `${line.line_pos}|${m.model}`;
                                                const isModelExpanded = !!expandedModels[mKey];
                                                return (
                                                    <div key={m.model} className="border border-slate-100 rounded-xl overflow-hidden">
                                                        <div
                                                            onClick={() => toggleModel(line.line_pos, m.model)}
                                                            className="flex items-center justify-between px-4 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                                                        >
                                                            <span className="text-sm font-black text-slate-700 uppercase">{m.model}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-slate-400">{m.parts.length} part(s)</span>
                                                                <i className={`fas fa-chevron-down text-[10px] text-slate-400 transition-transform ${isModelExpanded ? 'rotate-180' : ''}`}></i>
                                                            </div>
                                                        </div>
                                                        {isModelExpanded && (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left border-collapse">
                                                                    <thead>
                                    <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                                                                        <th className="p-2">Part No</th>
                                                                        <th className="p-2">Name</th>
                                                                        <th className="p-2 text-center">Prod</th>
                                                                        <th className="p-2 text-center text-emerald-600">OK</th>
                                                                        <th className="p-2 text-center text-red-500">NG</th>
                                                                        <th className="p-2 text-center">OK Ratio</th>
                                                                        <th className="p-2 text-center">Point OK</th>
                                                                        <th className="p-2 text-center text-blue-500">Eff</th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-50">
                                                                        {m.parts.map(p => {
                                                                            const pri = ratioInfo(p.frame_ok_ratio);
                                                                            const ppi = ratioInfo(p.point_ok_ratio);
                                                                            return (
                <tr key={p.part_number} onClick={() => window.showPartAnalytics && window.showPartAnalytics({ part_number: p.part_number, part_name: p.part_name, model: p.model, initialDate: selectedDate, initialLines: [line.line_pos], initialModel: p.model })} className="hover:bg-slate-50/50 cursor-pointer transition-colors">
                    <td className="p-2 text-xs font-black text-slate-700 whitespace-nowrap">{p.part_number}</td>
                    <td className="p-2 text-xs font-bold text-slate-500 max-w-[160px] truncate">{p.part_name}</td>
                    <td className="p-2 text-center text-sm font-black text-slate-800">{p.total_prod}</td>
                    <td className="p-2 text-center text-sm font-black text-emerald-600">{p.total_ok}</td>
                    <td className="p-2 text-center text-sm font-black text-red-500">{p.total_ng}</td>
                    <td className={`p-2 text-center text-sm font-black ${pri.text}`}>{p.frame_ok_ratio}%</td>
                    <td className={`p-2 text-center text-sm font-black ${ppi.text}`}>{p.point_ok_ratio}%</td>
                    <td className="p-2 text-center text-sm font-black text-blue-500">{p.avg_efficiency}%</td>
                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Top Defects */}
                                            {line.top_defects.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Top Defects</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {line.top_defects.map((d, i) => (
                                                            <span key={i} className="bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 shadow-sm">
                                                                <i className="fas fa-triangle-exclamation text-[8px]"></i>
                                                                {d.defect_code} {d.problem.split('(')[0].trim()} <span className="bg-red-200 text-red-800 px-1.5 rounded text-[8px]">x{d.qty}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 font-bold text-xs gap-2">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200">
                        <i className="fas fa-calendar-xmark text-lg"></i>
                    </div>
                    <span>Tidak ada data untuk tanggal {selectedDate}.</span>
                </div>
            )}

        </div>
    );
}

window.AsakaiTab = AsakaiTab;
