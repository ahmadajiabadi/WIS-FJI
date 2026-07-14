const { useState, useEffect, useMemo } = React;

function getGroupLabel(part) {
    const m = part.model || '-';
    if (m === 'D26A' && (part.part_name || '').toUpperCase().includes('FRONT')) return 'D26A Front';
    return m;
}

function PpicTab({ api_url }) {
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const [parts, setParts] = useState([]);
    const [plans, setPlans] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetch(`${api_url}/api/master/parts`)
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') setParts(res.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [api_url]);

    const fetchPlans = () => {
        setSavedMsg('');
        setPlans({});
        fetch(`${api_url}/api/ppic/plans?date=${date}`)
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') {
                    const map = {};
                    res.data.forEach(p => { map[`${p.part_number}|${p.model}`] = p.qty_planning; });
                    setPlans(map);
                }
            })
            .catch(console.error);
    };

    useEffect(() => {
        fetchPlans();
    }, [date, api_url]);

    const filteredParts = useMemo(() => {
        return parts.filter(p => 
            (p.part_number + ' ' + (p.part_name || '')).toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [parts, searchQuery]);

    const grouped = useMemo(() => {
        const map = {};
        const src = searchQuery ? filteredParts : parts;
        src.forEach(p => {
            const g = getGroupLabel(p);
            if (!map[g]) map[g] = [];
            map[g].push(p);
        });
        return Object.keys(map).sort().map(g => ({ model: g, parts: map[g] }));
    }, [parts, filteredParts, searchQuery]);

    const [expandedModel, setExpandedModel] = useState(null);

    useEffect(() => {
        if (grouped.length > 0 && !expandedModel) {
            setExpandedModel(grouped[0].model);
        }
    }, [grouped]);

    const handleQtyChange = (partNumber, model, val) => {
        const key = `${partNumber}|${model}`;
        setPlans(prev => ({ ...prev, [key]: parseInt(val) || 0 }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSavedMsg('');
        try {
            const plansArray = parts
                .filter(p => (plans[`${p.part_number}|${p.model}`] || 0) > 0)
                .map(p => ({
                    part_number: p.part_number,
                    part_name: p.part_name || '',
                    model: p.model || '',
                    line: p.line || '',
                    qty_planning: plans[`${p.part_number}|${p.model}`] || 0
                }));
            const res = await fetch(`${api_url}/api/ppic/plans`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tanggal: date, plans: plansArray })
            });
            const result = await res.json();
            if (result.status === 'success') {
                setSavedMsg(`Tersimpan (${result.saved} part)`);
                setTimeout(() => setSavedMsg(''), 3000);
            } else throw new Error(result.message);
        } catch (e) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadExcel = () => {
        window.open(`${api_url}/api/ppic/plans/download?date=${date}`);
    };

    const handleDownloadTemplate = () => {
        window.open(`${api_url}/api/ppic/plans/template`);
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadFile) {
            alert('Silakan pilih file excel terlebih dahulu.');
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('date', date);
            formData.append('file', uploadFile);

            const res = await fetch(`${api_url}/api/ppic/plans/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`Berhasil mengunggah ${result.saved} planning!`);
                setShowUploadModal(false);
                setUploadFile(null);
                fetchPlans();
            } else {
                alert('Gagal unggah: ' + result.message);
            }
        } catch (err) {
            alert('Gagal mengunggah file: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 140px)' }}>
            {/* Header filter */}
            <div className="flex flex-wrap items-center gap-4 bg-white rounded-3xl shadow-sm border border-slate-100 p-5 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center shadow-md">
                        <i className="fas fa-calendar-days text-white text-sm"></i>
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-800">PPIC — Production Planning</h2>
                        <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Perencanaan Produksi Harian</p>
                    </div>
                </div>
                
                <div className="flex-1 md:max-w-xs min-w-[200px]">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input type="text" placeholder="Cari Part Number / Nama..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-3">
                    <div>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Tanggal</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="flex items-center gap-2 mt-4 md:mt-0">
                        {savedMsg && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">{savedMsg}</span>}
                        <button onClick={handleSave} disabled={saving}
                            className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white px-5 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-200">
                            {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} SIMPAN
                        </button>
                        <button onClick={handleDownloadExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-200">
                            <i className="fas fa-file-excel"></i> DOWNLOAD EXCEL
                        </button>
                        <button onClick={() => setShowUploadModal(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-200">
                            <i className="fas fa-file-upload"></i> UPLOAD PLAN
                        </button>
                    </div>
                </div>
            </div>

            {/* Part list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="text-center py-20">
                        <i className="fas fa-spinner fa-spin text-2xl text-slate-300 mb-3"></i>
                        <p className="text-sm font-bold text-slate-400">Memuat part master...</p>
                    </div>
                ) : grouped.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <i className="fas fa-search text-3xl text-slate-300 mb-3"></i>
                        <p className="text-sm font-bold text-slate-400">Tidak ada part cocok ditemukan</p>
                    </div>
                ) : grouped.map(({ model, parts: modelParts }) => {
                    const open = expandedModel === model;
                    return (
                        <div key={model} className="mb-2 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                            <button onClick={() => setExpandedModel(open ? null : model)}
                                className="w-full flex items-center gap-3 px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] transition-all ${open ? 'bg-amber-600 text-white rotate-90' : 'bg-slate-200 text-slate-500'}`}>
                                    <i className="fas fa-chevron-right"></i>
                                </div>
                                <span className="font-bold text-slate-700 text-sm">{model}</span>
                                <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold ml-auto">{modelParts.length}</span>
                            </button>
                            {open && (
                                <div>
                                    <div className="grid grid-cols-[1.2fr_1.8fr_0.8fr_0.8fr_1fr] gap-2 px-5 py-2 bg-slate-50 border-t border-slate-200 text-[8px] font-black text-slate-400 uppercase tracking-wider">
                                        <div>Part Number</div>
                                        <div>Part Name</div>
                                        <div>Line</div>
                                        <div>Sisi</div>
                                        <div className="text-center">Qty Planning</div>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {modelParts.map((p, idx) => {
                                            const pKey = `${p.part_number}|${p.model}`;
                                            return (
                                                <div key={pKey}
                                                    className="grid grid-cols-[1.2fr_1.8fr_0.8fr_0.8fr_1fr] gap-2 px-5 py-2.5 items-center hover:bg-slate-50 transition-colors">
                                                    <div className="text-[12px] font-bold text-slate-800 break-words">{p.part_number}</div>
                                                    <div className="text-[12px] font-bold text-slate-800 break-words">{p.part_name || '-'}</div>
                                                    <div className="text-[12px] font-bold text-slate-500">{p.line || '-'}</div>
                                                    <div className="text-[12px]">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${p.side_type === 'LH' ? 'bg-blue-50 text-blue-700' : p.side_type === 'RH' ? 'bg-purple-50 text-purple-700' : 'bg-slate-50 text-slate-600'}`}>{p.side_type || 'umum'}</span>
                                                    </div>
                                                    <div className="text-center">
                                                        <input type="number" min="0" value={plans[pKey] || ''}
                                                            onChange={e => handleQtyChange(p.part_number, p.model, e.target.value)}
                                                            placeholder=""
                                                            className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all" />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Upload modal popup */}
            {showUploadModal && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-100 p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                <i className="fas fa-file-import text-blue-600"></i> Upload PPIC Plan
                            </h3>
                            <button onClick={() => { setShowUploadModal(false); setUploadFile(null); }} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Opsi 1: Unduh Template Excel</label>
                            <button type="button" onClick={handleDownloadTemplate} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-slate-200">
                                <i className="fas fa-file-download text-amber-600"></i> Download Template Excel
                            </button>
                        </div>

                        <form onSubmit={handleUploadSubmit} className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Opsi 2: Unggah Template yang Diisi</label>
                                <input type="file" accept=".xlsx, .xls" required onChange={e => setUploadFile(e.target.files[0])}
                                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-700" />
                            </div>
                            <button type="submit" disabled={uploading || !uploadFile}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                                {uploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-upload"></i>} UPLOAD SEKARANG
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

window.PpicTab = PpicTab;
