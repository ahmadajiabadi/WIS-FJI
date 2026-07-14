const { useState, useEffect, useMemo } = React;

function getGroupLabel(part) {
    const m = part.model || '-';
    if (m === 'D26A' && (part.part_name || '').toUpperCase().includes('FRONT')) return 'D26A Front';
    return m;
}

function PartTable({ data, selected, otherSelected, onSelect, expanded, setExpanded, accent, label, tag, plans }) {
    const headBg = accent === 'blue' ? 'bg-blue-50' : 'bg-amber-50';
    const badgeBg = accent === 'blue' ? 'bg-blue-100' : 'bg-amber-100';
    const badgeText = accent === 'blue' ? 'text-blue-700' : 'text-amber-700';
    const selBadgeText = accent === 'blue' ? 'text-blue-600' : 'text-amber-600';
    const selBadgeBg = accent === 'blue' ? 'bg-blue-50' : 'bg-amber-50';

    return (
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
            <div className={'flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0 ' + headBg}>
                <div className={'w-6 h-6 rounded-lg ' + badgeBg + ' ' + badgeText + ' flex items-center justify-center text-[9px] font-black'}>{tag}</div>
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">{label}</h3>
                {selected && <span className={'ml-auto text-[9px] font-bold ' + selBadgeText + ' ' + selBadgeBg + ' px-2 py-0.5 rounded-full'}>Terpilih</span>}
            </div>
            {data.length === 0 ? (
                <div className="text-center py-10">
                    <i className="fas fa-box-open text-2xl text-slate-200 mb-2"></i>
                    <p className="text-xs font-bold text-slate-300">Tidak ada part</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {data.map(({ model, parts }) => {
                        const open = expanded === model;
                        return (
                            <div key={model} className="mb-1.5 border border-slate-200 rounded-xl overflow-hidden">
                                <button onClick={() => setExpanded(open ? null : model)}
                                    className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <div className={'w-4 h-4 rounded-full flex items-center justify-center text-[7px] transition-all ' + (open ? (accent === 'blue' ? 'bg-blue-600' : 'bg-amber-600') + ' text-white rotate-90' : 'bg-slate-200 text-slate-400')}>
                                        <i className="fas fa-chevron-right"></i>
                                    </div>
                                    <span className="font-bold text-slate-700 text-xs">{model}</span>
                                    <span className="bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded text-[7px] font-bold ml-auto">{parts.length}</span>
                                </button>
                                {open && (
                                    <div className="divide-y divide-slate-100">
                                        {parts.map((part) => {
                                            const isSel = selected?.part_number === part.part_number && selected?.model === part.model;
                                            const isOther = otherSelected?.part_number === part.part_number && otherSelected?.model === part.model;
                                            const selClass = isSel ? (accent === 'blue' ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : 'bg-amber-50 ring-2 ring-inset ring-amber-400') : '';
                                            const clickClass = isOther ? 'opacity-40' : 'hover:bg-slate-50 cursor-pointer';
                                            return (
                                                <div key={part.part_number + part.model}
                                                    onClick={() => {
                                                        if (!isOther) onSelect(part);
                                                    }}
                                                    className={'flex items-center gap-3 px-4 py-3 transition-all ' + clickClass + ' ' + selClass}>
                                                    <div className={'w-5 h-5 rounded-md flex items-center justify-center shrink-0 ' + (isSel ? (accent === 'blue' ? 'bg-blue-600' : 'bg-amber-600') + ' text-white' : isOther ? 'border-2 border-slate-200 bg-slate-100' : 'border-2 border-slate-300')}>
                                                        {isSel && <i className="fas fa-check text-[8px]"></i>}
                                                        {isOther && <i className="fas fa-lock text-[6px] text-slate-300"></i>}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-slate-800 text-xs truncate">{part.part_name || '-'}</div>
                                                        <div className="text-[10px] text-slate-500 truncate">
                                                            {part.part_number} — {part.line || '-'}
                                                            {plans && plans[`${part.part_number}|${part.model}`] > 0 && (
                                                                <span className="ml-2 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[8px] font-black">Plan: {plans[`${part.part_number}|${part.model}`]}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function VoiceSetup({ api_url, onComplete }) {
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const [inspector, setInspector] = useState('');
    const [shift, setShift] = useState('1');
    const [parts, setParts] = useState([]);
    const [plans, setPlans] = useState({});
    const [loading, setLoading] = useState(true);
    const [lhPart, setLhPart] = useState(null);
    const [rhPart, setRhPart] = useState(null);
    const [activeTab, setActiveTab] = useState('plan');
    const [expandedLh, setExpandedLh] = useState(null);
    const [expandedRh, setExpandedRh] = useState(null);
    const [selectedLine, setSelectedLine] = useState('');
    const [interruptedSession, setInterruptedSession] = useState(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('qc_voice_last_interrupted_session');
            if (saved) {
                setInterruptedSession(JSON.parse(saved));
            }
        } catch (e) {}
    }, []);

    const info = useMemo(() => {
        if (!interruptedSession?.sidesData) return null;
        const left = interruptedSession.sidesData['KIRI'] || interruptedSession.sidesData['kiri'];
        const right = interruptedSession.sidesData['KANAN'] || interruptedSession.sidesData['kanan'];
        const meta = left?.metadata || right?.metadata || {};
        return {
            inspector: meta.inspector || 'Tidak dikenal',
            shift: meta.shift || '1',
            date: meta.date || '-',
            lhPart: left?.selectedPart ? `${left.selectedPart.part_name} (${left.selectedPart.part_number})` : null,
            rhPart: right?.selectedPart ? `${right.selectedPart.part_name} (${right.selectedPart.part_number})` : null,
            totalOk: (left?.totalOk || 0) + (right?.totalOk || 0),
            totalNg: (left?.totalNgFrame || 0) + (right?.totalNgFrame || 0),
        };
    }, [interruptedSession]);

    useEffect(() => {
        setSelectedLine('');
    }, [activeTab]);

    useEffect(() => {
        Promise.all([
            fetch(`${api_url}/api/master/parts`).then(r => r.json()),
            fetch(`${api_url}/api/ppic/plans?date=${date}`).then(r => r.json())
        ]).then(([partsRes, plansRes]) => {
            if (partsRes.status === 'success') setParts(partsRes.data);
            if (plansRes.status === 'success') {
                const map = {};
                plansRes.data.forEach(p => { map[`${p.part_number}|${p.model}`] = p.qty_planning; });
                setPlans(map);
            }
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, [api_url, date]);

    const plannedParts = useMemo(() => parts.filter(p => (plans[`${p.part_number}|${p.model}`] || 0) > 0), [parts, plans]);

    const lineOptions = useMemo(() => {
        const src = activeTab === 'plan' ? plannedParts : parts;
        return [...new Set(src.map(p => p.line).filter(Boolean))].sort();
    }, [activeTab, plannedParts, parts]);

    const filteredParts = useMemo(() => {
        const src = activeTab === 'plan' ? plannedParts : parts;
        if (!selectedLine) return src;
        return src.filter(p => p.line === selectedLine);
    }, [activeTab, plannedParts, parts, selectedLine]);

    const groupByModelLh = useMemo(() => {
        const map = {};
        filteredParts.filter(p => p.side_type === 'LH' || p.side_type === 'umum' || !p.side_type).forEach(p => {
            const g = getGroupLabel(p);
            if (!map[g]) map[g] = [];
            map[g].push(p);
        });
        return Object.keys(map).sort().map(g => ({ model: g, parts: map[g] }));
    }, [filteredParts]);

    const groupByModelRh = useMemo(() => {
        const map = {};
        filteredParts.filter(p => p.side_type === 'RH' || p.side_type === 'umum' || !p.side_type).forEach(p => {
            const g = getGroupLabel(p);
            if (!map[g]) map[g] = [];
            map[g].push(p);
        });
        return Object.keys(map).sort().map(g => ({ model: g, parts: map[g] }));
    }, [filteredParts]);

    const handleSelectLh = (part) => {
        if (lhPart?.part_number === part.part_number && lhPart?.model === part.model) {
            setLhPart(null);
            if (part.paired_part_number && rhPart?.part_number === part.paired_part_number && rhPart?.model === part.paired_model) {
                setRhPart(null);
            }
        } else {
            setLhPart(part);
            if (part.paired_part_number) {
                const foundPair = parts.find(p => p.part_number === part.paired_part_number && p.model === part.paired_model);
                if (foundPair) {
                    setRhPart(foundPair);
                    setExpandedRh(getGroupLabel(foundPair));
                }
            }
        }
    };

    const handleSelectRh = (part) => {
        if (rhPart?.part_number === part.part_number && rhPart?.model === part.model) {
            setRhPart(null);
            if (part.paired_part_number && lhPart?.part_number === part.paired_part_number && lhPart?.model === part.paired_model) {
                setLhPart(null);
            }
        } else {
            setRhPart(part);
            if (part.paired_part_number) {
                const foundPair = parts.find(p => p.part_number === part.paired_part_number && p.model === part.paired_model);
                if (foundPair) {
                    setLhPart(foundPair);
                    setExpandedLh(getGroupLabel(foundPair));
                }
            }
        }
    };

    const handleStart = () => {
        if (!inspector || !inspector.trim()) {
            alert('Nama Inspector wajib diisi');
            return;
        }
        if (!lhPart && !rhPart) {
            alert('Pilih minimal satu part untuk LH atau RH');
            return;
        }
        const session = {
            tanggal: date,
            inspector: inspector.trim(),
            shift: shift || '1',
            lhPart: lhPart ? { part_number: lhPart.part_number, part_name: lhPart.part_name, model: lhPart.model, line: lhPart.line, image_path: lhPart.image_path, takt_time: lhPart.takt_time } : null,
            rhPart: rhPart ? { part_number: rhPart.part_number, part_name: rhPart.part_name, model: rhPart.model, line: rhPart.line, image_path: rhPart.image_path, takt_time: rhPart.takt_time } : null,
        };
        console.log('[VS] handleStart session:', JSON.stringify(session, null, 2));
        try {
            localStorage.setItem('qc_voice_active_session', JSON.stringify(session));
        } catch (e) {}
        if (onComplete) onComplete(session);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-slate-300 mb-4"></i>
                    <p className="text-sm font-bold text-slate-400">Memuat data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen p-4 md:p-6 gap-4" style={{ background: '#f8fafc' }}>
            {interruptedSession && info && (
                <div className="bg-gradient-to-r from-red-500 to-amber-600 rounded-3xl p-5 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                            <i className="fas fa-triangle-exclamation text-xl"></i>
                        </div>
                        <div>
                            <h3 className="font-black text-sm uppercase tracking-wider">Sesi Sebelumnya Terputus Abnormal!</h3>
                            <p className="text-[10px] text-white/90 mt-1 font-bold">
                                Inspector: <span className="underline">{info.inspector}</span> (Shift {info.shift}) — Tanggal: {info.date}
                            </p>
                            <p className="text-[10px] text-white/90 font-bold">
                                {info.lhPart && <span>LH: {info.lhPart}</span>}
                                {info.lhPart && info.rhPart && <span> | </span>}
                                {info.rhPart && <span>RH: {info.rhPart}</span>}
                            </p>
                            <p className="text-[9px] text-white/80 mt-0.5">
                                Progres: {info.totalOk} OK / {info.totalNg} NG Frame terekam.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => onComplete(interruptedSession)}
                            className="bg-white hover:bg-slate-100 text-amber-800 px-5 py-2.5 rounded-2xl font-black text-xs transition-all shadow-md">
                            LANJUTKAN SESI
                        </button>
                        <button onClick={() => {
                            try { localStorage.removeItem('qc_voice_last_interrupted_session'); } catch (e) {}
                            setInterruptedSession(null);
                        }}
                            className="bg-black/20 hover:bg-black/30 text-white border border-white/30 px-4 py-2.5 rounded-2xl font-black text-xs transition-all">
                            Abaikan & Mulai Baru
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                        <i className="fas fa-microphone text-white text-sm"></i>
                    </div>
                    <div>
                        <h2 className="text-base font-black text-slate-800">Setup Voice Inspection</h2>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Pilih Part untuk LH & RH</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-slate-100">
                    <div style={{ minWidth: 130 }}>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Tanggal</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div style={{ minWidth: 150 }}>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Nama Inspector <span className="text-red-500">*</span></label>
                        <input type="text" list="inspector-list-setup" value={inspector} onChange={e => setInspector(e.target.value)}
                            placeholder="Pilih / ketik nama QC..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                        <datalist id="inspector-list-setup">
                            {(window.INSPECTOR_NAMES || []).map(n => <option key={n} value={n} />)}
                        </datalist>
                    </div>
                    <div style={{ width: 80 }}>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Shift</label>
                        <select value={shift} onChange={e => setShift(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                        </select>
                    </div>
                    <div style={{ minWidth: 120 }}>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Line</label>
                        <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="">-- Semua Line --</option>
                            {lineOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 ml-auto mb-0.5">
                        <button onClick={handleStart}
                            disabled={!inspector || !inspector.trim() || (!lhPart && !rhPart)}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-8 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-200">
                            <i className="fas fa-play-circle"></i> LANJUT PRODUKSI
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[8px] font-black">LH</span>
                        <span className="text-[11px] font-bold text-slate-700">{lhPart ? lhPart.part_number + ' - ' + lhPart.part_name : 'Belum dipilih'}</span>
                        {lhPart && <button onClick={() => setLhPart(null)} className="text-red-400 hover:text-red-600 text-[10px]"><i className="fas fa-times-circle"></i></button>}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center text-[8px] font-black">RH</span>
                        <span className="text-[11px] font-bold text-slate-700">{rhPart ? rhPart.part_number + ' - ' + rhPart.part_name : 'Belum dipilih'}</span>
                        {rhPart && <button onClick={() => setRhPart(null)} className="text-red-400 hover:text-red-600 text-[10px]"><i className="fas fa-times-circle"></i></button>}
                    </div>
                </div>
            </div>

            <div className="flex gap-2 shrink-0">
                <button onClick={() => setActiveTab('plan')}
                    className={'px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all ' + (activeTab === 'plan'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50')}>
                    <i className="fas fa-clipboard-list mr-2"></i>Dari Plan PPIC ({plannedParts.length})
                </button>
                <button onClick={() => setActiveTab('all')}
                    className={'px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all ' + (activeTab === 'all'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50')}>
                    <i className="fas fa-list mr-2"></i>Semua Part
                </button>
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
                <PartTable key="lh" data={groupByModelLh} selected={lhPart} otherSelected={rhPart}
                    onSelect={handleSelectLh}
                    expanded={expandedLh} setExpanded={setExpandedLh} accent="blue" label="LH - Part Kiri" tag="LH" plans={plans} />
                <PartTable key="rh" data={groupByModelRh} selected={rhPart} otherSelected={lhPart}
                    onSelect={handleSelectRh}
                    expanded={expandedRh} setExpanded={setExpandedRh} accent="amber" label="RH - Part Kanan" tag="RH" plans={plans} />
            </div>
        </div>
    );
}

window.VoiceSetup = VoiceSetup;
