const DEFECT_CODES = {
    A: 'Welding Undercut (Memotong Part)',
    B: 'Welding Over Lap (Tembus/Berlebih)',
    C: 'Welding Pit/Blow Hole (Keropos)',
    D: 'Welding Hole (Berlubang)',
    E: 'Welding Burn-through (Meleleh)',
    F: 'Welding Bead skip (Welding Putus)',
    G: 'Welding Bead width (Pergeseran Welding)',
    H: 'Dimensi Spot bolt Tidak STD',
    I: 'Spot Bolt Pecah/Retak',
    J: 'Spot Bolt Ada GAP',
    K: 'Spot Bolt Ada Burry',
    L: 'Part Tidak Terpasang',
    M: 'Others (Defect lainnya)',
};

const SHIFT_MAP = { 1: '1', 2: '2', 3: '3' };

function getGroupLabel(part) {
    const m = part.model || '-';
    if (m === 'D26A' && (part.part_name || '').toUpperCase().includes('FRONT')) return 'D26A Front';
    return m;
}

function ManualInputSection({ api_url, onSaved }) {
    const [parts, setParts] = React.useState([]);
    const [search, setSearch] = React.useState('');
    const [expandedModel, setExpandedModel] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [selectedPart, setSelectedPart] = React.useState(null);
    const [selectedShift, setSelectedShift] = React.useState('');
    const [savedCount, setSavedCount] = React.useState(0);
    const [checksheetDate, setChecksheetDate] = React.useState(new Date().toISOString().slice(0, 10));

    React.useEffect(() => {
        fetch(`${api_url}/api/master/parts`)
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') setParts(res.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [api_url]);

    const filtered = React.useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return parts;
        return parts.filter(p =>
            (p.part_number || '').toLowerCase().includes(q) ||
            (p.part_name || '').toLowerCase().includes(q) ||
            (p.model || '').toLowerCase().includes(q) ||
            (p.line || '').toLowerCase().includes(q)
        );
    }, [search, parts]);

    const grouped = React.useMemo(() => {
        const map = {};
        filtered.forEach(p => {
            const g = getGroupLabel(p);
            if (!map[g]) map[g] = [];
            map[g].push(p);
        });
        return Object.keys(map).sort().map(g => ({ model: g, parts: map[g] }));
    }, [filtered]);

    const handleSelectPart = (part, shift) => {
        setSelectedPart(part);
        setSelectedShift(SHIFT_MAP[shift] || '');
    };

    const handleLineChange = (partNumber, model, newLine) => {
        setParts(prev => prev.map(p => {
            if (p.part_number === partNumber && p.model === model) {
                return { ...p, line: newLine };
            }
            return p;
        }));
        if (selectedPart && selectedPart.part_number === partNumber && selectedPart.model === model) {
            setSelectedPart(prev => ({ ...prev, line: newLine }));
        }
    };

    const handleFormSaved = () => {
        setSavedCount(c => c + 1);
        setSelectedPart(null);
        setSelectedShift('');
        if (onSaved) onSaved();
    };

    return (
        <div className="flex gap-4 overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
            {/* LEFT: Part List */}
            <div className="w-1/2 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 min-h-0">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
                        <i className="fas fa-pen-to-square text-white text-xs"></i>
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-800">Input Manual CS</h2>
                        <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Pilih Part & Shift</p>
                    </div>
                    {savedCount > 0 && <span className="ml-auto text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{savedCount} tersimpan</span>}
                </div>

                <div className="px-5 py-3 border-b border-slate-100 shrink-0">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input type="text" placeholder="Cari..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pt-3 custom-scrollbar min-h-0">
                    {loading ? (
                        <div className="text-center py-10 text-slate-300">
                            <i className="fas fa-spinner fa-spin text-xl mb-2"></i>
                            <p className="text-xs font-bold">Memuat...</p>
                        </div>
                    ) : grouped.length === 0 ? (
                        <div className="text-center py-10">
                            <i className="fas fa-box-open text-3xl text-slate-200 mb-3"></i>
                            <p className="text-xs font-bold text-slate-300">Part tidak ditemukan</p>
                        </div>
                    ) : grouped.map(({ model, parts }) => {
                        const open = expandedModel === model;
                        return (
                            <div key={model} className="mb-2 border border-slate-200 rounded-2xl overflow-hidden">
                                <button onClick={() => setExpandedModel(open ? null : model)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] transition-transform ${open ? 'bg-blue-600 text-white rotate-90' : 'bg-slate-200 text-slate-500'}`}>
                                        <i className="fas fa-chevron-right"></i>
                                    </div>
                                    <span className="font-bold text-slate-700 text-[11px]">{model}</span>
                                    <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-bold ml-auto">{parts.length}</span>
                                </button>
                                {open && (
                                    <div>
                                        <div className="grid grid-cols-[1fr_1.2fr_0.7fr_95px] gap-1 px-4 py-1.5 bg-slate-50 border-t border-slate-200 text-[7px] font-black text-slate-400 uppercase tracking-wider">
                                            <div>Part Number</div>
                                            <div>Part Name</div>
                                            <div>Line</div>
                                            <div className="text-center">Shift</div>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {parts.map((p, idx) => (
                                                <div key={p.part_number + p.model} className={`grid grid-cols-[1fr_1.2fr_0.7fr_95px] gap-1 px-4 py-2 items-center ${selectedPart?.part_number === p.part_number && selectedPart?.model === p.model ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors`}>
                                                    <div className="text-[11px] font-bold text-slate-800 break-words">{p.part_number}</div>
                                                    <div className="text-[11px] font-bold text-slate-800 break-words">{p.part_name || '-'}</div>
                                                    <div className="text-[11px] font-bold text-slate-500">
                                                         <input 
                                                             type="text" 
                                                             list={`lines-list-${p.part_number}-${p.model}`} 
                                                             value={p.line || ''} 
                                                             onChange={e => handleLineChange(p.part_number, p.model, e.target.value)} 
                                                             className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[10px] font-bold outline-none focus:border-blue-500" 
                                                             placeholder="Line Pos"
                                                         />
                                                         <datalist id={`lines-list-${p.part_number}-${p.model}`}>
                                                             {(window.LINE_POSITIONS || []).map(lp => (
                                                                 <option key={lp} value={lp} />
                                                             ))}
                                                         </datalist>
                                                     </div>
                                                    <div className="flex items-center gap-1 justify-center">
                                                        {[1, 2, 3].map(s => (
                                                            <button
                                                                key={s}
                                                                onClick={() => handleSelectPart(p, s)}
                                                                className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all ${
                                                                    selectedPart?.part_number === p.part_number && selectedPart?.model === p.model && selectedShift === SHIFT_MAP[s]
                                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                                        : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
                                                                }`}
                                                            >
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Checksheet Form */}
            <div className="w-1/2 h-full min-h-0 flex flex-col">
                {selectedPart ? (
                    <ChecksheetForm
                        key={selectedPart.part_number + selectedPart.model + selectedShift}
                        api_url={api_url}
                        part={selectedPart}
                        shiftDefault={selectedShift}
                        date={checksheetDate}
                        onDateChange={setChecksheetDate}
                        onSaved={handleFormSaved}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-100">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i className="fas fa-hand-pointer text-2xl text-slate-300"></i>
                            </div>
                            <p className="text-sm font-bold text-slate-400">Pilih part dan shift</p>
                            <p className="text-[10px] text-slate-300 mt-1">Klik angka 1, 2, atau 3 untuk mulai</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Checksheet Form ─── */
function ChecksheetForm({ api_url, part, shiftDefault, date, onDateChange, onSaved }) {
    const [rows, setRows] = React.useState([{ check_no: '', defect_code: '', problem: '', qty: '' }]);
    const [summary, setSummary] = React.useState({ total_prod: '', total_ok: '', total_ng: '', total_scrap: '' });
    const [nama, setNama] = React.useState('');
    const [shift, setShift] = React.useState(shiftDefault || '');
    const [linePos, setLinePos] = React.useState(part.line || '');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState(null);
    const inputRefs = React.useRef({});

    React.useEffect(() => {
        if (shiftDefault) setShift(shiftDefault);
    }, [shiftDefault]);

    React.useEffect(() => {
        setLinePos(part.line || '');
    }, [part]);

    const getProblem = (code) => {
        const c = (code || '').toUpperCase().trim();
        return DEFECT_CODES[c] || '';
    };

    const handleDefectChange = (idx, field, value) => {
        const next = [...rows];
        next[idx] = { ...next[idx], [field]: value };
        if (field === 'defect_code') {
            next[idx].problem = getProblem(value);
        }
        setRows(next);
    };

    const handleDeleteRow = (idx) => {
        if (rows.length === 1) {
            setRows([{ check_no: '', defect_code: '', problem: '', qty: '' }]);
            return;
        }
        const next = rows.filter((_, i) => i !== idx);
        setRows(next);
    };

    const handleDefectKeyDown = (idx, field, e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (idx + 1 < rows.length) {
                const ref = inputRefs.current[`${idx + 1}-${field}`];
                if (ref) ref.focus();
            } else {
                const next = [...rows];
                next.push({ check_no: '', defect_code: '', problem: '', qty: '' });
                setRows(next);
                setTimeout(() => {
                    const ref = inputRefs.current[`${idx + 1}-${field}`];
                    if (ref) ref.focus();
                }, 50);
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (field === 'check_no') {
                const ref = inputRefs.current[`${idx}-defect_code`];
                if (ref) ref.focus();
            } else if (field === 'defect_code') {
                const ref = inputRefs.current[`${idx}-qty`];
                if (ref) ref.focus();
            } else if (field === 'qty') {
                if (idx + 1 < rows.length) {
                    const ref = inputRefs.current[`${idx + 1}-check_no`];
                    if (ref) ref.focus();
                } else {
                    const next = [...rows];
                    next.push({ check_no: '', defect_code: '', problem: '', qty: '' });
                    setRows(next);
                    setTimeout(() => {
                        const ref = inputRefs.current[`${next.length - 1}-check_no`];
                        if (ref) ref.focus();
                    }, 50);
                }
            }
        }
    };

    const handleSave = async () => {
        const validRows = rows.filter(r => r.check_no.trim() || r.defect_code.trim());
        const totalProd = parseInt(summary.total_prod) || 0;
        const totalOK = parseInt(summary.total_ok) || 0;
        const totalNG = parseInt(summary.total_ng) || 0;

        if (totalNG > 0 && validRows.length === 0) {
            setError('Isi minimal satu rincian defect karena ada total NG Frame');
            return;
        }
        if (totalProd !== totalOK + totalNG) {
            setError(`Total Produksi (${totalProd}) harus sama dengan Total OK (${totalOK}) + NG Frame (${totalNG})`);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const body = {
                input_mode: 'manual',
                meta: {
                    partName: part.part_name,
                    partNumber: part.part_number,
                    model: part.model,
                    linePos: linePos,
                    nama: nama.trim() || 'Anonim',
                    shift: shift.trim(),
                    date: date,
                    side: null,
                },
                details: validRows.map(r => ({
                    pointCheck: '',
                    checkNo: r.check_no.trim(),
                    problem: r.problem || getProblem(r.defect_code),
                    defectCode: (r.defect_code || '').toUpperCase().trim(),
                    qty: parseInt(r.qty) || 1,
                })),
                summary: {
                    totalProduksi: parseInt(summary.total_prod) || 0,
                    totalOK: parseInt(summary.total_ok) || 0,
                    totalNG: parseInt(summary.total_ng) || 0,
                    totalNGPoint: validRows.reduce((sum, r) => sum + (parseInt(r.qty) || 1), 0),
                    totalScrap: parseInt(summary.total_scrap) || 0,
                },
            };
            const res = await fetch(`${api_url}/api/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status === 'success') {
                if (onSaved) onSaved();
            } else {
                setError(data.message || 'Gagal menyimpan');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
                <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                    <i className="fas fa-file-pen text-white text-xs"></i>
                </div>
                <div>
                    <h2 className="text-sm font-black text-slate-800">Checksheet</h2>
                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Shift {shift || '-'}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Tanggal</label>
                    <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="bg-blue-50/50 rounded-2xl p-4 mb-4 border border-blue-100">
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                        <div><span className="text-[7px] font-black text-slate-400 uppercase">Part Number</span><p className="text-xs font-bold text-slate-800 break-words">{part.part_number}</p></div>
                        <div>
                            <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5">Line</span>
                            <select 
                                value={linePos} 
                                onChange={e => setLinePos(e.target.value)} 
                                className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="">-</option>
                                {(window.LINE_POSITIONS || []).map(lp => (
                                    <option key={lp} value={lp}>{lp}</option>
                                ))}
                                {linePos && !(window.LINE_POSITIONS || []).includes(linePos) && (
                                    <option value={linePos}>{linePos}</option>
                                )}
                            </select>
                        </div>
                        <div><span className="text-[7px] font-black text-slate-400 uppercase">Model</span><p className="text-xs font-bold text-slate-800">{part.model || '-'}</p></div>
                        <div className="col-span-3"><span className="text-[7px] font-black text-slate-400 uppercase">Part Name</span><p className="text-sm font-black text-slate-800 break-words">{part.part_name || '-'}</p></div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 tracking-widest">Inspector</label>
                        <input type="text" value={nama} onChange={e => setNama(e.target.value)} placeholder="Kosong = Anonim" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                    <div>
                        <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 tracking-widest">Shift</label>
                        <input type="text" value={shift} onChange={e => setShift(e.target.value)} placeholder="1/2/3" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest">Rincian Defect</label>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="grid grid-cols-[80px_70px_1fr_60px_40px] gap-0 bg-slate-50 border-b border-slate-200">
                            <div className="px-3 py-2 text-[7px] font-black text-slate-400 uppercase">Check No</div>
                            <div className="px-3 py-2 text-[7px] font-black text-slate-400 uppercase">Code</div>
                            <div className="px-3 py-2 text-[7px] font-black text-slate-400 uppercase">Problem</div>
                            <div className="px-3 py-2 text-[7px] font-black text-slate-400 uppercase">Qty</div>
                            <div className="px-3 py-2 text-[7px] font-black text-slate-400 uppercase text-center">Aksi</div>
                        </div>
                        {rows.map((row, idx) => (
                            <div key={idx} className={`grid grid-cols-[80px_70px_1fr_60px_40px] gap-0 ${idx < rows.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                <input ref={el => inputRefs.current[`${idx}-check_no`] = el} value={row.check_no} onChange={e => handleDefectChange(idx, 'check_no', e.target.value)} onKeyDown={e => handleDefectKeyDown(idx, 'check_no', e)} placeholder="1" className="w-full px-3 py-2.5 text-xs font-bold text-slate-800 outline-none bg-transparent focus:bg-blue-50/30" />
                                <input ref={el => inputRefs.current[`${idx}-defect_code`] = el} value={row.defect_code} onChange={e => handleDefectChange(idx, 'defect_code', e.target.value)} onKeyDown={e => handleDefectKeyDown(idx, 'defect_code', e)} placeholder="A-M" className="w-full px-3 py-2.5 text-xs font-bold text-slate-800 outline-none bg-transparent focus:bg-blue-50/30 uppercase" />
                                <input ref={el => inputRefs.current[`${idx}-problem`] = el} value={row.problem} readOnly className="w-full px-3 py-2.5 text-xs text-slate-600 outline-none bg-transparent" placeholder="(auto)" />
                                <input ref={el => inputRefs.current[`${idx}-qty`] = el} value={row.qty} onChange={e => handleDefectChange(idx, 'qty', e.target.value)} onKeyDown={e => handleDefectKeyDown(idx, 'qty', e)} type="number" min="1" className="w-full px-3 py-2.5 text-xs font-bold text-slate-800 outline-none bg-transparent focus:bg-blue-50/30" />
                                <div className="flex items-center justify-center border-l border-slate-100">
                                    <button onClick={() => handleDeleteRow(idx)} className="text-red-500 hover:text-red-750 transition-colors w-full h-full flex items-center justify-center" title="Hapus baris ini">
                                        <i className="fas fa-trash-can text-[11px]"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[7px] text-slate-400 mt-1.5 ml-1">
                        <i className="fas fa-info-circle mr-1"></i>
                        Code → Tab → langsung ke Qty (Problem otomatis)
                    </p>
                </div>

                <div className="mb-4">
                    <label className="block text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest">Ringkasan Produksi</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { key: 'total_prod', label: 'Total Prod', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                            { key: 'total_ok', label: 'Total OK', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                            { key: 'total_ng', label: 'NG Frame', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                            { key: 'total_scrap', label: 'Scrap', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
                        ].map(({ key, label, bg, text, border }) => (
                            <div key={key} className={`${bg} rounded-xl p-3 border ${border}`}>
                                <label className={`block text-[7px] font-black uppercase tracking-wider ${text} mb-1`}>{label}</label>
                                <input type="number" min="0" value={summary[key]} onChange={e => setSummary(prev => ({ ...prev, [key]: e.target.value }))} className={`w-full bg-white p-1.5 rounded-lg border ${border} text-center text-xs font-black ${text} outline-none shadow-sm`} placeholder="0" />
                            </div>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                        <p className="text-[10px] font-bold text-red-600"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>
                    </div>
                )}

                <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200">
                    {saving ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-floppy-disk mr-1"></i>}
                    {saving ? 'Menyimpan...' : 'Simpan Checksheet'}
                </button>
            </div>
        </div>
    );
}

window.ManualInputSection = ManualInputSection;
