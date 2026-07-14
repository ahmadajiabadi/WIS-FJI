function LineStopTab({ api_url }) {
    const [parts, setParts] = React.useState([]);
    const [selectedPart, setSelectedPart] = React.useState('');
    const [model, setModel] = React.useState('');
    const [linePos, setLinePos] = React.useState('');
    const [date, setDate] = React.useState(new Date().toISOString().split('T')[0]);
    const [shift, setShift] = React.useState('Shift 1');
    const [lossStart, setLossStart] = React.useState('');
    const [lossEnd, setLossEnd] = React.useState('');
    const [category4m, setCategory4m] = React.useState('');
    const [stopReason, setStopReason] = React.useState('');
    const [correctiveAction, setCorrectiveAction] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [abnormalitySuggestions, setAbnormalitySuggestions] = React.useState([]);
    const [selectedAbnormality, setSelectedAbnormality] = React.useState(null);
    const [lineStops, setLineStops] = React.useState([]);
    const [categories, setCategories] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        fetch(`${api_url}/api/master/parts`).then(r => r.json()).then(res => {
            if (res.status === 'success') setParts(res.data);
        }).catch(() => {});
        fetch(`${api_url}/api/settings/abnormality-categories`).then(r => r.json()).then(res => {
            if (res.status === 'success') setCategories(res.data || []);
        }).catch(() => {});
    }, [api_url]);

    React.useEffect(() => {
        if (!date) return;
        const url = new URL(`${api_url}/api/linestops`);
        url.searchParams.append('date', date);
        if (selectedPart) url.searchParams.append('partNumber', selectedPart);
        fetch(url).then(r => r.json()).then(res => {
            if (res.status === 'success') setLineStops(res.data || []);
        }).catch(() => {});
    }, [api_url, date, selectedPart]);

    const handleFindAbnormality = async () => {
        if (!date) return;
        const url = new URL(`${api_url}/api/linestops/abnormality-suggest`);
        url.searchParams.append('date', date);
        if (linePos) url.searchParams.append('linePos', linePos);
        if (lossStart) url.searchParams.append('startTime', lossStart + ':00');
        if (lossEnd) url.searchParams.append('endTime', lossEnd + ':00');
        const res = await fetch(url);
        const result = await res.json();
        if (result.status === 'success') setAbnormalitySuggestions(result.data || []);
    };

    const handleSelectAbnormality = (abn) => {
        setSelectedAbnormality(abn.id === selectedAbnormality ? null : abn.id);
        if (abn) {
            setCategory4m(abn.category_4m1e || '');
            setStopReason(abn.problem_category || '');
        }
    };

    const handleSave = async () => {
        if (!date || !lossStart || !lossEnd) { alert('Date, Loss Start, and Loss End required'); return; }
        setIsSaving(true);
        try {
            const body = {
                id: editingId || undefined,
                part_number: selectedPart,
                model, line_pos: linePos,
                date, shift,
                loss_start: `${date} ${lossStart}:00`,
                loss_end: `${date} ${lossEnd}:00`,
                category_4m: category4m,
                stop_reason: stopReason,
                corrective_action: correctiveAction,
                notes,
                linked_abnormality_id: selectedAbnormality || undefined
            };
            const res = await fetch(`${api_url}/api/linestops/save`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.status === 'success') {
                resetForm();
                // Refresh list
                const url = new URL(`${api_url}/api/linestops`);
                url.searchParams.append('date', date);
                if (selectedPart) url.searchParams.append('partNumber', selectedPart);
                fetch(url).then(r => r.json()).then(r2 => {
                    if (r2.status === 'success') setLineStops(r2.data || []);
                });
            } else {
                alert('Error: ' + (result.message || 'Unknown'));
            }
        } catch (e) {
            console.error('Save line stop error:', e);
            alert('Save failed');
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setLossStart('');
        setLossEnd('');
        setCategory4m('');
        setStopReason('');
        setCorrectiveAction('');
        setNotes('');
        setAbnormalitySuggestions([]);
        setSelectedAbnormality(null);
    };

    const uniqueCategories = [...new Set((categories || []).map(c => c.category_4m1e).filter(Boolean))];
    const models = [...new Set(parts.filter(p => p.part_number === selectedPart).map(p => p.model).filter(Boolean))];
    const linePositions = parts.filter(p => p.part_number === selectedPart).map(p => p.line_pos).filter(Boolean);
    const uniqueLinePos = [...new Set(linePositions)];

    const durationMin = lossStart && lossEnd ? (() => {
        const [sh, sm] = lossStart.split(':').map(Number);
        const [eh, em] = lossEnd.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
    })() : 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 px-8 py-5">
                    <h2 className="text-lg font-black text-white uppercase tracking-widest"><i className="fas fa-stop mr-3"></i>Line Stop</h2>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Part Number</label>
                            <select value={selectedPart} onChange={e => { setSelectedPart(e.target.value); setModel(''); setLinePos(''); }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">— Pilih Part —</option>
                                {parts.map((p, i) => <option key={i} value={p.part_number}>{p.part_number} {p.part_name ? `- ${p.part_name}` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Model</label>
                            <select value={model} onChange={e => setModel(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">— All —</option>
                                {models.map((m, i) => <option key={i} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Line / Pos</label>
                            <select value={linePos} onChange={e => setLinePos(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">— All —</option>
                                {uniqueLinePos.map((l, i) => <option key={i} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Shift</label>
                            <select value={shift} onChange={e => setShift(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option>Shift 1</option><option>Shift 2</option><option>Shift 3</option>
                            </select>
                        </div>
                        <div></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Loss Start</label>
                            <input type="time" value={lossStart} onChange={e => setLossStart(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Loss End</label>
                            <input type="time" value={lossEnd} onChange={e => setLossEnd(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex items-end">
                            <div className="w-full px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-700">
                                {durationMin > 0 ? `Duration: ${durationMin} mnt` : 'Duration: —'}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4">
                        <button onClick={handleFindAbnormality}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md">
                            <i className="fas fa-search mr-1"></i> Cari Abnormality Inspector
                        </button>
                        {abnormalitySuggestions.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                                {abnormalitySuggestions.map((a, i) => (
                                    <div key={i} onClick={() => handleSelectAbnormality(a)}
                                        className={`p-2 rounded-xl border text-[10px] font-bold cursor-pointer transition-all ${
                                            selectedAbnormality === a.id
                                                ? 'bg-blue-100 border-blue-400 text-blue-800'
                                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-blue-50'
                                        }`}>
                                        <span className="text-blue-600">{a.time?.substring(0,5) || ''}</span>
                                        <span className="mx-2">|</span>
                                        <span className="text-slate-800">{a.category_4m1e}</span>
                                        <span className="mx-1">·</span>
                                        <span className="text-slate-500">{a.problem_category}</span>
                                        <span className="text-slate-400 ml-1">({a.inspector})</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Category 4M</label>
                            <select value={category4m} onChange={e => setCategory4m(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">— Pilih —</option>
                                {uniqueCategories.map((c, i) => <option key={i} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div></div>
                        <div className="md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Stop Reason</label>
                            <textarea value={stopReason} onChange={e => setStopReason(e.target.value)} rows={2}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Corrective Action</label>
                            <textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} rows={2}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button onClick={handleSave} disabled={isSaving}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md">
                            {isSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                            {editingId ? 'Update' : 'Simpan'}
                        </button>
                        {editingId && (
                            <button onClick={resetForm}
                                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-xs uppercase tracking-widest rounded-2xl transition-all">
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Existing Line Stops */}
            <div className="bg-white rounded-[2.5rem] shadow-lg border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <i className="fas fa-list mr-2"></i> Line Stop Records ({lineStops.length})
                    </h3>
                </div>
                <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {lineStops.length === 0 ? (
                        <div className="py-10 text-center text-slate-300 italic font-bold text-xs uppercase tracking-widest">Belum ada record line stop</div>
                    ) : lineStops.map((ls, i) => (
                        <div key={i} className="p-4 bg-red-50 rounded-2xl border border-red-100 hover:shadow-md transition-all">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-red-600">
                                            {ls.loss_start?.substring(11,16) || '??'} - {ls.loss_end?.substring(11,16) || '??'}
                                        </span>
                                        <span className="text-[8px] font-black bg-red-200 text-red-800 px-1.5 py-0.5 rounded">{ls.duration_min} mnt</span>
                                        <span className="text-[8px] font-black bg-slate-800 text-white px-1.5 py-0.5 rounded">{ls.category_4m || '-'}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-700">{ls.stop_reason || '—'}</p>
                                    {ls.corrective_action && (
                                        <p className="text-[8px] text-slate-500">Perbaikan: {ls.corrective_action}</p>
                                    )}
                                    {ls.notes && <p className="text-[8px] text-slate-400 italic">Note: {ls.notes}</p>}
                                    {ls.part_number && (
                                        <p className="text-[8px] text-slate-400">{ls.part_number} {ls.model ? `· ${ls.model}` : ''} {ls.line_pos ? `· ${ls.line_pos}` : ''} {ls.shift ? `· ${ls.shift}` : ''}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
window.LineStopTab = LineStopTab;
