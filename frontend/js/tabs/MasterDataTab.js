function MasterDataTab({ api_url }) {
    const [masterParts, setMasterParts] = React.useState([]);
    const [isMasterLoading, setIsMasterLoading] = React.useState(false);
    const [selectedMasterPart, setSelectedMasterPart] = React.useState(null);
    const [masterPoints, setMasterPoints] = React.useState([]);
    const [isSavingMaster, setIsSavingMaster] = React.useState(false);
    const [masterImagePreview, setMasterImagePreview] = React.useState(null);
    const [masterZoom, setMasterZoom] = React.useState(100);
    const [masterSearch, setMasterSearch] = React.useState('');
    const [masterModelFilter, setMasterModelFilter] = React.useState('');
    const [masterLineFilter, setMasterLineFilter] = React.useState('');
    const [isDragging, setIsDragging] = React.useState(false);
    const [movingPointIndex, setMovingPointIndex] = React.useState(null);
    const [expandedModels, setExpandedModels] = React.useState({});
    const [showPairingModal, setShowPairingModal] = React.useState(false);
    const [pairingSearch, setPairingSearch] = React.useState('');
    const [expandedPairingModels, setExpandedPairingModels] = React.useState({});

    const dragStart = React.useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0, moved: false });
    const masterMapperRef = React.useRef(null);

    React.useEffect(() => {
        fetchMasterParts();
    }, []);

    React.useEffect(() => {
        if (selectedMasterPart && selectedMasterPart.part_number && !selectedMasterPart.isNew) {
            fetchMasterPoints(selectedMasterPart.part_number, null, selectedMasterPart.model);
        }
    }, [selectedMasterPart]);

    React.useEffect(() => {
        const mapper = masterMapperRef.current;
        if (mapper) {
            const handleWheel = (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    setMasterZoom(prev => Math.min(Math.max(10, prev + (e.deltaY < 0 ? 10 : -10)), 500));
                }
            };
            mapper.addEventListener('wheel', handleWheel, { passive: false });
            return () => mapper.removeEventListener('wheel', handleWheel);
        }
    }, [selectedMasterPart]);

    const fetchMasterParts = async () => {
        setIsMasterLoading(true);
        try {
            const res = await fetch(`${api_url}/api/master/parts`);
            const result = await res.json();
            if (result.status === 'success') setMasterParts(result.data);
        } catch (error) {
            console.error("Fetch master parts error:", error);
        } finally {
            setIsMasterLoading(false);
        }
    };

    const handleSaveMasterPart = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        setIsSavingMaster(true);
        try {
            const res = await fetch(`${api_url}/api/master/parts`, {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Master Data Part Berhasil Disimpan!");
                fetchMasterParts();
                setSelectedMasterPart(null);
                setMasterImagePreview(null);
            }
        } catch (error) {
            alert("Gagal simpan master part: " + error.message);
        } finally {
            setIsSavingMaster(false);
        }
    };

    const handleDeleteMasterPart = async (partNumber, model) => {
        if (!confirm(`Hapus Master Part ${partNumber} (Model: ${model || '-'})?`)) return;
        try {
            let url = `${api_url}/api/master/parts/${encodeURIComponent(partNumber)}`;
            if (model) url += `?model=${encodeURIComponent(model)}`;
            await fetch(url, { method: 'DELETE' });
            fetchMasterParts();
            if (selectedMasterPart?.part_number === partNumber && selectedMasterPart?.model === model) {
                setSelectedMasterPart(null);
                setMasterPoints([]);
            }
        } catch (error) {
            console.error("Delete master part error:", error);
        }
    };

    const handlePairPart = async (targetPart) => {
        try {
            const res = await fetch(`${api_url}/api/master/parts/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    part_number: selectedMasterPart.part_number,
                    model: selectedMasterPart.model,
                    paired_part_number: targetPart.part_number,
                    paired_model: targetPart.model
                })
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`Berhasil memasangkan dengan ${targetPart.part_number}!`);
                setShowPairingModal(false);
                fetchMasterParts();
                setSelectedMasterPart(prev => ({
                    ...prev,
                    paired_part_number: targetPart.part_number,
                    paired_model: targetPart.model
                }));
            }
        } catch (error) {
            alert("Gagal memasangkan part: " + error.message);
        }
    };

    const handleUnpairPart = async () => {
        if (!confirm("Hapus hubungan pasangan untuk part ini?")) return;
        try {
            const res = await fetch(`${api_url}/api/master/parts/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    part_number: selectedMasterPart.part_number,
                    model: selectedMasterPart.model,
                    paired_part_number: null,
                    paired_model: null
                })
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`Berhasil menghapus pasangan!`);
                fetchMasterParts();
                setSelectedMasterPart(prev => ({
                    ...prev,
                    paired_part_number: null,
                    paired_model: null
                }));
            }
        } catch (error) {
            alert("Gagal menghapus pasangan: " + error.message);
        }
    };

    const fetchMasterPoints = async (partNumber, side, model) => {
        try {
            let url = `${api_url}/api/master/points/${encodeURIComponent(partNumber)}`;
            const params = [];
            if (side) params.push(`side=${side}`);
            if (model) params.push(`model=${encodeURIComponent(model)}`);
            if (params.length > 0) url += `?${params.join('&')}`;
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') setMasterPoints(result.data);
        } catch (error) {
            console.error("Fetch points error:", error);
        }
    };

    const handleImageClick = (e) => {
        if (!selectedMasterPart) return;
        
        const rect = e.target.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const nextNo = masterPoints.length > 0 
            ? Math.max(...masterPoints.map(p => parseInt(p.check_no) || 0)) + 1 
            : 1;

        const newPoint = {
            check_no: nextNo.toString(),
            x_coord: x,
            y_coord: y
        };

        setMasterPoints([...masterPoints, newPoint]);
    };

    const handleSavePoints = async () => {
        if (!selectedMasterPart) return;
        setIsSavingMaster(true);
        try {
            const res = await fetch(`${api_url}/api/master/points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    part_number: selectedMasterPart.part_number,
                    model: selectedMasterPart.model || '-',
                    points: masterPoints
                })
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Titik koordinat berhasil disimpan!");
                fetchMasterPoints(selectedMasterPart.part_number, null, selectedMasterPart.model);
            }
        } catch (error) {
            alert("Gagal simpan titik: " + error.message);
        } finally {
            setIsSavingMaster(false);
        }
    };

    const removePoint = (index) => {
        setMasterPoints(masterPoints.filter((_, i) => i !== index));
    };

    const handlePointDragStart = (e, index) => {
        e.stopPropagation();
        e.preventDefault();
        setMovingPointIndex(index);
    };

    // Rendering UI (OMITTED for brevity in thought, but full implementation in TargetFile)
    // ... (logic from app.js lines 2089-2503) ...
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <i className="fas fa-database text-blue-600"></i> Master Data Part
                    </h2>
                    <p className="text-sm text-slate-500">Kelola katalog part dan pemetaan titik pengecekan (Heatmap).</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                    <div className="relative flex-1 md:min-w-[300px]">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input 
                            type="text" placeholder="Cari Part Number / Nama..." 
                            value={masterSearch} onChange={(e) => setMasterSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <select 
                        value={masterModelFilter} onChange={(e) => setMasterModelFilter(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">Semua Model</option>
                        {[...new Set(masterParts.map(p => p.model))].filter(m => m).map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    {!selectedMasterPart && (
                        <button 
                            onClick={() => {
                                setSelectedMasterPart({ part_number: '', part_name: '', model: '', line: '', marker_size: 32, total_points: 0, takt_time: 60, isNew: true });
                                setMasterPoints([]);
                                setMasterZoom(100);
                            }}
                            className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg"
                        >
                            <i className="fas fa-plus text-xs"></i> Tambah Part
                        </button>
                    )}
                </div>
            </div>

            {/* Content Switcher */}
            {!selectedMasterPart ? (
                /* Part Table UI with Model Grouping */
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => {
                            const filtered = masterParts
                                .filter(p => (p.part_number + (p.part_name || '')).toLowerCase().includes(masterSearch.toLowerCase()))
                                .filter(p => masterModelFilter ? p.model === masterModelFilter : true)
                                .filter(p => masterLineFilter ? p.line === masterLineFilter : true);
                            const models = [...new Set(filtered.map(p => p.model))];
                            const allExpanded = {};
                            models.forEach(m => { allExpanded[m] = true; });
                            setExpandedModels(allExpanded);
                        }} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-200 flex items-center gap-1.5">
                            <i className="fas fa-expand-alt text-[8px]"></i> Expand All
                        </button>
                        <button onClick={() => setExpandedModels({})} className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-colors border border-slate-200 flex items-center gap-1.5">
                            <i className="fas fa-compress-alt text-[8px]"></i> Collapse All
                        </button>
                        <span className="text-[10px] text-slate-400 ml-2">
                            {masterParts.filter(p => (p.part_number + (p.part_name || '')).toLowerCase().includes(masterSearch.toLowerCase()))
                                .filter(p => masterModelFilter ? p.model === masterModelFilter : true)
                                .filter(p => masterLineFilter ? p.line === masterLineFilter : true).length} parts
                        </span>
                    </div>
                    {(() => {
                        const filtered = masterParts
                            .filter(p => (p.part_number + (p.part_name || '')).toLowerCase().includes(masterSearch.toLowerCase()))
                            .filter(p => masterModelFilter ? p.model === masterModelFilter : true)
                            .filter(p => masterLineFilter ? p.line === masterLineFilter : true);
                        const grouped = {};
                        filtered.forEach(p => {
                            const m = p.model || '-';
                            if (!grouped[m]) grouped[m] = [];
                            grouped[m].push(p);
                        });
                        const sortedModels = Object.keys(grouped).sort();
                        return sortedModels.map(model => {
                            const parts = grouped[model];
                            const isOpen = expandedModels[model] === true;
                            const totalPoints = parts.reduce((sum, p) => sum + (p.total_points || 0), 0);
                            return (
                                <div key={model} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-3">
                                    <button onClick={() => setExpandedModels(prev => ({...prev, [model]: !prev[model]}))} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-transform ${isOpen ? 'bg-blue-600 text-white rotate-90' : 'bg-slate-200 text-slate-500'}`}>
                                                <i className="fas fa-chevron-right"></i>
                                            </div>
                                            <span className="font-bold text-slate-700 text-sm">{model}</span>
                                            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{parts.length} parts</span>
                                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">{totalPoints} points</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-400">{isOpen ? 'Click to collapse' : 'Click to expand'}</span>
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                                                    <tr>
                                                        <th className="p-4">Part Info</th>
                                                        <th className="p-4">
                                                            <div className="flex flex-col gap-1 w-24">
                                                                <span>Line</span>
                                                                <select 
                                                                    value={masterLineFilter} 
                                                                    onChange={(e) => setMasterLineFilter(e.target.value)}
                                                                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-[9px] font-black text-slate-500 outline-none cursor-pointer w-full normal-case"
                                                                >
                                                                    <option value="">Semua</option>
                                                                    {[...new Set(masterParts.map(p => p.line))].filter(Boolean).sort().map(l => (
                                                                        <option key={l} value={l}>{l}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </th>
                                                        <th className="p-4">Sisi</th>
                                                        <th className="p-4">Points Check</th>
                                                        <th className="p-4">Takt Time</th>
                                                        <th className="p-4">Image</th>
                                                        <th className="p-4 text-center">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {parts.map((part) => (
                                                    <tr key={part.part_number} className="hover:bg-blue-50/30 transition-colors">
                                                        <td className="p-4">
                                                            <div className="font-bold text-slate-800 text-sm">{part.part_number}</div>
                                                            <div className="text-xs text-slate-500">{part.part_name || '-'}</div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">{part.line || '-'}</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${part.side_type === 'LH' ? 'bg-blue-50 text-blue-700' : part.side_type === 'RH' ? 'bg-purple-50 text-purple-700' : 'bg-slate-50 text-slate-600'}`}>{part.side_type || 'umum'}</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">{part.total_points || 0} Points</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black">{part.takt_time || 60}s</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                                {part.image_path ? <img src={`${api_url}/${part.image_path}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><i className="fas fa-image text-slate-300"></i></div>}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex justify-center gap-2">
                                                                <button 
                                                                    onClick={() => window.showPartAnalytics && window.showPartAnalytics({ ...part, initialModel: part.model })}
                                                                    className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-indigo-100"
                                                                >
                                                                    <i className="fas fa-chart-line"></i> Analytics
                                                                </button>
                                                                <button 
                                                                    onClick={async () => {
                                                                        setSelectedMasterPart(part);
                                                                        await fetchMasterPoints(part.part_number, null, part.model);
                                                                    }}
                                                                    className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-blue-100"
                                                                >
                                                                    <i className="fas fa-map-marker-alt"></i> Mapper
                                                                </button>
                                                                <button onClick={() => handleDeleteMasterPart(part.part_number, part.model)} className="text-red-400 hover:text-red-600 p-2"><i className="fas fa-trash"></i></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>
            ) : (
                /* Mapper View */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="lg:col-span-4 space-y-6">
                        {/* Part Info Form */}
                        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200">
                            <form onSubmit={handleSaveMasterPart} className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Informasi Part</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Part Number</label>
                                        <input name="part_number" type="text" defaultValue={selectedMasterPart.part_number} required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Model</label>
                                        <input name="model" type="text" defaultValue={selectedMasterPart.model} required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Part</label>
                                        <input name="part_name" type="text" defaultValue={selectedMasterPart.part_name} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Line</label>
                                        <input name="line" type="text" defaultValue={selectedMasterPart.line || ''} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="-" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marker Size (px)</label>
                                        <input name="marker_size" type="number" value={selectedMasterPart.marker_size ?? 32} onChange={(e) => setSelectedMasterPart({...selectedMasterPart, marker_size: parseInt(e.target.value) || 32})} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total Points</label>
                                        <input name="total_points" type="number" defaultValue={selectedMasterPart.total_points || 0} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Takt Time (detik)</label>
                                        <input name="takt_time" type="number" defaultValue={selectedMasterPart.takt_time || 60} min={1} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Sisi Part</label>
                                        <select name="side_type" defaultValue={selectedMasterPart.side_type || 'umum'} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="umum">Umum</option>
                                            <option value="LH">LH</option>
                                            <option value="RH">RH</option>
                                        </select>
                                    </div>
                                </div>
                                {!selectedMasterPart.isNew && (
                                    <div className="border-t border-slate-100 pt-4 space-y-2">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Pasangan Part</label>
                                        {selectedMasterPart.paired_part_number ? (
                                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                                                <div>
                                                    <div className="text-xs font-bold text-slate-800">{selectedMasterPart.paired_part_number}</div>
                                                    <div className="text-[10px] text-slate-500">Model: {selectedMasterPart.paired_model || '-'}</div>
                                                </div>
                                                <button type="button" onClick={() => handleUnpairPart()} className="text-red-500 hover:bg-red-50 p-2 rounded-lg text-xs font-bold transition-colors">
                                                    Hapus
                                                </button>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => setShowPairingModal(true)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2">
                                                <i className="fas fa-link"></i> Pilih Pasangan Part
                                            </button>
                                        )}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Foto Master Part</label>
                                    <input name="image" type="file" accept="image/*" onChange={(e) => { if (e.target.files[0]) setMasterImagePreview(URL.createObjectURL(e.target.files[0])); }} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-700" />
                                </div>
                                <div className="pt-4 flex gap-2">
                                    <button type="submit" disabled={isSavingMaster} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg disabled:bg-slate-400">
                                        {isSavingMaster ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-save mr-2"></i>}
                                        Simpan Part
                                    </button>
                                    <button type="button" onClick={() => { setSelectedMasterPart(null); setMasterImagePreview(null); }} className="px-6 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">Batal</button>
                                </div>
                            </form>
                        </div>
                        {/* Points List */}
                        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Titik Koordinat ({masterPoints.length})</h3>
                                <button onClick={handleSavePoints} disabled={isSavingMaster || masterPoints.length === 0} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold hover:bg-emerald-700 shadow-md">Simpan Titik</button>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto space-y-2">
                                {masterPoints.map((p, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                                        <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">{p.check_no}</div>
                                        <div className="flex-1 text-[10px] text-slate-500 font-mono">X: {p.x_coord.toFixed(1)}% | Y: {p.y_coord.toFixed(1)}%</div>
                                        <button onClick={() => removePoint(idx)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Image Mapper UI */}
                    <div className="lg:col-span-8 bg-slate-900 rounded-[2rem] shadow-2xl border-4 border-slate-700 overflow-hidden relative flex flex-col">
                        <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
                            <button onClick={() => setMasterZoom(prev => Math.min(500, prev + 25))} className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white flex items-center justify-center border border-white/20"><i className="fas fa-plus"></i></button>
                            <div className="bg-black/60 backdrop-blur-md text-white text-[9px] font-bold py-1 px-2 rounded-md text-center border border-white/10">{masterZoom}%</div>
                            <button onClick={() => setMasterZoom(prev => Math.max(10, prev - 25))} className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white flex items-center justify-center border border-white/20"><i className="fas fa-minus"></i></button>
                        </div>
                        <div ref={masterMapperRef} className={`relative flex-1 overflow-auto bg-slate-950 custom-scrollbar-dark ${isDragging ? 'cursor-grabbing' : (movingPointIndex !== null ? 'cursor-crosshair' : 'cursor-grab')}`}
                            onMouseDown={(e) => { 
                                if (movingPointIndex !== null) return;
                                if (masterZoom <= 100) return; 
                                e.preventDefault(); 
                                setIsDragging(true); 
                                const container = masterMapperRef.current; 
                                dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop, moved: false }; 
                            }}
                            onMouseMove={(e) => { 
                                if (movingPointIndex !== null) {
                                    // Handle Point Dragging
                                    const img = masterMapperRef.current.querySelector('img');
                                    const rect = img.getBoundingClientRect();
                                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                                    
                                    const newPoints = [...masterPoints];
                                    newPoints[movingPointIndex] = { ...newPoints[movingPointIndex], x_coord: x, y_coord: y };
                                    setMasterPoints(newPoints);
                                    return;
                                }

                                if (!isDragging) return; 
                                e.preventDefault(); 
                                const container = masterMapperRef.current; 
                                const dx = e.clientX - dragStart.current.x; 
                                const dy = e.clientY - dragStart.current.y; 
                                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragStart.current.moved = true; 
                                container.scrollLeft = dragStart.current.scrollLeft - dx; 
                                container.scrollTop = dragStart.current.scrollTop - dy; 
                            }}
                            onMouseUp={() => { setIsDragging(false); setMovingPointIndex(null); }} 
                            onMouseLeave={() => { setIsDragging(false); setMovingPointIndex(null); }}
                        >
                            <div className="relative inline-block w-fit min-w-full transition-all duration-300 ease-in-out origin-top-left" style={{ width: `${masterZoom}%` }}>
                                <img src={masterImagePreview || (selectedMasterPart.image_path ? `${api_url}/${selectedMasterPart.image_path}` : '')} className="w-full block select-none" onClick={(e) => { if (!dragStart.current.moved) handleImageClick(e); }} style={{ pointerEvents: (selectedMasterPart.part_number ? 'auto' : 'none'), cursor: 'crosshair' }} onDragStart={(e) => e.preventDefault()} />
                                {masterPoints.map((p, idx) => {
                                    const baseSize = selectedMasterPart.marker_size || 32;
                                    const scaledSize = baseSize * (masterZoom / 100);
                                    const isMoving = movingPointIndex === idx;
                                    return (
                                        <div key={idx} 
                                            onMouseDown={(e) => handlePointDragStart(e, idx)}
                                            className={`absolute rounded-full flex items-center justify-center text-white font-black shadow-lg cursor-move select-none ${isMoving ? 'bg-orange-500 ring-4 ring-orange-300 z-30 scale-125' : 'bg-blue-500/80 border-2 border-blue-300 z-20'} transition-all duration-75`}
                                            style={{ 
                                                left: `${p.x_coord}%`, 
                                                top: `${p.y_coord}%`, 
                                                width: `${scaledSize}px`, 
                                                height: `${scaledSize}px`, 
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: `${Math.max(6, scaledSize/2.5)}px`
                                            }}>
                                            {p.check_no}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showPairingModal && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Pilih Pasangan Part</h3>
                                <p className="text-xs text-slate-500">Pasangkan dengan part number lain untuk model {selectedMasterPart.model}</p>
                            </div>
                            <button onClick={() => setShowPairingModal(false)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div className="p-4 border-b border-slate-100 shrink-0">
                            <div className="relative">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                                <input 
                                    type="text" placeholder="Cari Part Number / Nama Pasangan..." 
                                    value={pairingSearch} onChange={(e) => setPairingSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {(() => {
                                const filtered = masterParts
                                    .filter(p => p.part_number !== selectedMasterPart.part_number || p.model !== selectedMasterPart.model)
                                    .filter(p => (p.part_number + (p.part_name || '')).toLowerCase().includes(pairingSearch.toLowerCase()));
                                
                                const grouped = {};
                                filtered.forEach(p => {
                                    const m = p.model || '-';
                                    if (!grouped[m]) grouped[m] = [];
                                    grouped[m].push(p);
                                });
                                
                                const sortedModels = Object.keys(grouped).sort();
                                if (sortedModels.length === 0) {
                                    return (
                                        <div className="text-center py-12">
                                            <i className="fas fa-box-open text-4xl text-slate-200 mb-3"></i>
                                            <p className="text-sm font-bold text-slate-400">Tidak ada part lain ditemukan</p>
                                        </div>
                                    );
                                }
                                
                                return sortedModels.map(model => {
                                    const parts = grouped[model];
                                    const isOpen = expandedPairingModels[model] !== false;
                                    return (
                                        <div key={model} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                            <button type="button" onClick={() => setExpandedPairingModels(prev => ({...prev, [model]: !isOpen}))} className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-transform ${isOpen ? 'bg-blue-600 text-white rotate-90' : 'bg-slate-200 text-slate-500'}`}>
                                                        <i className="fas fa-chevron-right"></i>
                                                    </div>
                                                    <span className="font-bold text-slate-700 text-xs">{model}</span>
                                                    <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-bold">{parts.length} parts</span>
                                                </div>
                                            </button>
                                            {isOpen && (
                                                <div className="divide-y divide-slate-100">
                                                    {parts.map((p) => (
                                                        <div key={p.part_number + p.model} onClick={() => handlePairPart(p)} className="flex items-center justify-between p-3 hover:bg-blue-50/40 transition-colors cursor-pointer">
                                                            <div>
                                                                <div className="font-bold text-slate-800 text-xs">{p.part_number}</div>
                                                                <div className="text-[10px] text-slate-500">{p.part_name || '-'} {p.side_type ? `(${p.side_type})` : ''}</div>
                                                            </div>
                                                            <div className="text-blue-600 font-bold text-xs flex items-center gap-1.5">
                                                                Pilih <i className="fas fa-chevron-right text-[10px]"></i>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
window.MasterDataTab = MasterDataTab;
