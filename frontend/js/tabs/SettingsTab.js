function SettingsTab({ api_url }) {
    const [activeSub, setActiveSub] = React.useState('voice-guides');
    const [guides, setGuides] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [editItem, setEditItem] = React.useState(null);
    const [form, setForm] = React.useState({ code: '', name: '', keywords: '', feedback_text: '' });

    // Voice Commands state
    const [commands, setCommands] = React.useState({ ok: [], ng_frame: [], finish: [], scrap: [], undo: [], mute: [], unmute: [], batal_cycle: [] });
    const [newCmdKeyword, setNewCmdKeyword] = React.useState('');
    const [newCmdType, setNewCmdType] = React.useState('ok');
    const [newCmdFeedback, setNewCmdFeedback] = React.useState('');

    const submenus = [
        { id: 'voice-guides', label: 'Panduan Voice', icon: 'fa-microphone' },
        { id: 'voice-commands', label: 'Perintah Suara', icon: 'fa-bullhorn' },
        { id: 'timer-breaks', label: 'Timer Istirahat', icon: 'fa-clock' },
        { id: 'inspector-names', label: 'Nama Inspector', icon: 'fa-user' },
        { id: 'line-positions', label: 'Line / Pos', icon: 'fa-location-dot' },
        { id: 'abnormality', label: '4M1E Abnormality', icon: 'fa-triangle-exclamation' }
    ];

    // ===== VOICE GUIDES (existing) =====

    const loadGuides = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${api_url}/api/settings/voice-guides`);
            const result = await res.json();
            if (result.status === 'success') setGuides(result.data);
        } catch (e) {
            console.error('Load guides error:', e);
        } finally {
            setLoading(false);
        }
    }, [api_url]);

    const refreshGlobalGuidance = React.useCallback(() => {
        if (window.loadVoiceGuidesFromServer) window.loadVoiceGuidesFromServer(api_url);
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'voice-guides') loadGuides();
    }, [activeSub, loadGuides]);

    const openAdd = () => {
        setEditItem(null);
        setForm({ code: '', name: '', keywords: '', feedback_text: '' });
    };

    const openEdit = (item) => {
        setEditItem(item);
        setForm({ code: item.code, name: item.name, keywords: item.keywords, feedback_text: item.feedback_text || '' });
    };

    const handleSaveGuide = async () => {
        if (!form.code || !form.name || !form.keywords) {
            alert('Harap isi semua field (code, name, keywords)');
            return;
        }
        try {
            if (editItem) {
                const res = await fetch(`${api_url}/api/settings/voice-guides/${editItem.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    setEditItem(null);
                    setForm({ code: '', name: '', keywords: '' });
                    loadGuides();
                    refreshGlobalGuidance();
                } else {
                    alert('Gagal update: ' + result.message);
                }
            } else {
                const res = await fetch(`${api_url}/api/settings/voice-guides`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    setForm({ code: '', name: '', keywords: '' });
                    loadGuides();
                    refreshGlobalGuidance();
                } else {
                    alert('Gagal simpan: ' + result.message);
                }
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleDeleteGuide = async (id) => {
        if (!confirm('Hapus panduan voice ini?')) return;
        try {
            const res = await fetch(`${api_url}/api/settings/voice-guides/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.status === 'success') { loadGuides(); refreshGlobalGuidance(); }
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    // ===== VOICE COMMANDS (quantity) =====

    const CMD_LABELS = {
        ok: { label: 'Tambah Total OK', icon: 'fa-check', color: 'emerald' },
        ng_frame: { label: 'Tambah NG Frame', icon: 'fa-exclamation-triangle', color: 'red' },
        finish: { label: 'Selesai Cycle (Auto OK/NG)', icon: 'fa-circle-check', color: 'blue' },
        scrap: { label: 'Tambah Scrap', icon: 'fa-trash-can', color: 'slate' },
        undo: { label: 'Hapus NG Terakhir', icon: 'fa-undo', color: 'orange' },
        batal_cycle: { label: 'Batal 1 Cycle (Undo Prod)', icon: 'fa-rotate-left', color: 'red' },
        mute: { label: 'Mode Diam', icon: 'fa-microphone-slash', color: 'purple' },
        unmute: { label: 'Aktifkan Mic', icon: 'fa-microphone', color: 'blue' }
    };

    const loadCommands = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/voice-commands`);
            const result = await res.json();
            if (result.status === 'success') {
                const grouped = { ok: [], ng_frame: [], finish: [], scrap: [], undo: [], mute: [], unmute: [], batal_cycle: [] };
                result.data.forEach(cmd => {
                    if (grouped[cmd.command_type] !== undefined) grouped[cmd.command_type].push(cmd);
                });
                setCommands(grouped);
            }
        } catch (e) {
            console.error('Load commands error:', e);
        }
    }, [api_url]);

    const refreshGlobalCommands = React.useCallback(() => {
        if (window.loadVoiceCommandsFromServer) window.loadVoiceCommandsFromServer(api_url);
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'voice-commands') loadCommands();
    }, [activeSub, loadCommands]);

    // ===== TIMER BREAKS =====

    const [breaks, setBreaks] = React.useState([]);
    const [breakForm, setBreakForm] = React.useState({ break_label: '', start_time: '12:00', end_time: '13:00', active: true, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false });
    const [editingBreakId, setEditingBreakId] = React.useState(null);

    // ===== INSPECTOR NAMES =====

    const [inspectors, setInspectors] = React.useState([]);
    const [inspectorForm, setInspectorForm] = React.useState({ name: '', active: true });
    const [editingInspectorId, setEditingInspectorId] = React.useState(null);

    // ===== LINE POSITIONS =====

    const [linePositions, setLinePositions] = React.useState([]);
    const [linePosForm, setLinePosForm] = React.useState({ name: '', active: true });
    const [editingLinePosId, setEditingLinePosId] = React.useState(null);

    // ===== 4M1E ABNORMALITY CATEGORIES =====

    const [abnCategories, setAbnCategories] = React.useState([]);
    const [abnGrouped, setAbnGrouped] = React.useState({});
    const [abnForm, setAbnForm] = React.useState({ category_4m1e: 'Man', problem_name: '', keywords: '', sort_order: 0 });
    const [editingAbnId, setEditingAbnId] = React.useState(null);

    const loadAbnCategories = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/abnormality-categories`);
            const result = await res.json();
            if (result.status === 'success') {
                setAbnCategories(result.data);
                setAbnGrouped(result.grouped);
            }
        } catch (e) {
            console.error('Load abnormality categories error:', e);
        }
    }, [api_url]);

    const refreshGlobalAbn = React.useCallback(() => {
        if (window.loadAbnormalityCategories) window.loadAbnormalityCategories(api_url);
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'abnormality') loadAbnCategories();
    }, [activeSub, loadAbnCategories]);

    const handleEditAbn = (item) => {
        setAbnForm({ category_4m1e: item.category_4m1e, problem_name: item.problem_name, keywords: item.keywords || '', sort_order: item.sort_order || 0 });
        setEditingAbnId(item.id);
    };

    const handleSaveAbn = async () => {
        if (!abnForm.problem_name.trim()) { alert('Nama masalah wajib diisi'); return; }
        try {
            const isUpdate = editingAbnId !== null;
            const url = isUpdate ? `${api_url}/api/settings/abnormality-categories/${editingAbnId}` : `${api_url}/api/settings/abnormality-categories`;
            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(abnForm)
            });
            const result = await res.json();
            if (result.status === 'success') {
                setAbnForm({ category_4m1e: 'Man', problem_name: '', keywords: '', sort_order: 0 });
                setEditingAbnId(null);
                loadAbnCategories();
                refreshGlobalAbn();
            } else {
                alert('Gagal simpan: ' + result.message);
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleDeleteAbn = async (id) => {
        if (!confirm('Hapus kategori masalah ini?')) return;
        try {
            await fetch(`${api_url}/api/settings/abnormality-categories/${id}`, { method: 'DELETE' });
            loadAbnCategories();
            refreshGlobalAbn();
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    const handleToggleAbn = async (item) => {
        try {
            await fetch(`${api_url}/api/settings/abnormality-categories/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, active: item.active ? 0 : 1 })
            });
            loadAbnCategories();
            refreshGlobalAbn();
        } catch (e) {
            console.error('Toggle abnormality error:', e);
        }
    };

    const ABN_ICONS = {
        Man: 'fa-user', Mesin: 'fa-cogs', Material: 'fa-cube', Metode: 'fa-book', Environment: 'fa-tree'
    };
    const ABN_COLORS = {
        Man: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-600', header: 'text-orange-800' },
        Mesin: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', icon: 'text-blue-600', header: 'text-blue-800' },
        Material: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', icon: 'text-amber-600', header: 'text-amber-800' },
        Metode: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: 'text-purple-600', header: 'text-purple-800' },
        Environment: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600', header: 'text-emerald-800' }
    };

    const loadBreaks = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/timer-breaks`);
            const result = await res.json();
            if (result.status === 'success') setBreaks(result.data);
        } catch (e) {
            console.error('Load breaks error:', e);
        }
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'timer-breaks') loadBreaks();
    }, [activeSub, loadBreaks]);

    const handleEditBreak = (item) => {
        setBreakForm({
            break_label: item.break_label,
            start_time: item.start_time?.substring(0, 5),
            end_time: item.end_time?.substring(0, 5),
            active: !!item.active,
            monday: !!item.monday,
            tuesday: !!item.tuesday,
            wednesday: !!item.wednesday,
            thursday: !!item.thursday,
            friday: !!item.friday,
            saturday: !!item.saturday,
            sunday: !!item.sunday,
        });
        setEditingBreakId(item.id);
    };

    const handleSaveBreak = async () => {
        if (!breakForm.break_label.trim() || !breakForm.start_time || !breakForm.end_time) {
            alert('Harap isi label, jam mulai, dan jam selesai');
            return;
        }
        try {
            const isUpdate = editingBreakId !== null;
            const url = isUpdate ? `${api_url}/api/settings/timer-breaks/${editingBreakId}` : `${api_url}/api/settings/timer-breaks`;
            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(breakForm)
            });
            const result = await res.json();
            if (result.status === 'success') {
                setBreakForm({ break_label: '', start_time: '12:00', end_time: '13:00', active: true, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false });
                setEditingBreakId(null);
                loadBreaks();
            } else {
                alert('Gagal simpan: ' + result.message);
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleToggleBreak = async (item) => {
        try {
            await fetch(`${api_url}/api/settings/timer-breaks/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, active: item.active ? 0 : 1 })
            });
            loadBreaks();
        } catch (e) {
            console.error('Toggle break error:', e);
        }
    };

    const handleDeleteBreak = async (id) => {
        if (!confirm('Hapus jadwal istirahat ini?')) return;
        try {
            await fetch(`${api_url}/api/settings/timer-breaks/${id}`, { method: 'DELETE' });
            loadBreaks();
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    // ===== INSPECTOR NAMES HANDLERS =====

    const loadInspectors = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/inspectors`);
            const result = await res.json();
            if (result.status === 'success') setInspectors(result.data);
        } catch (e) {
            console.error('Load inspectors error:', e);
        }
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'inspector-names') loadInspectors();
    }, [activeSub, loadInspectors]);

    const handleEditInspector = (item) => {
        setInspectorForm({ name: item.name, active: !!item.active });
        setEditingInspectorId(item.id);
    };

    const handleSaveInspector = async () => {
        if (!inspectorForm.name.trim()) {
            alert('Nama inspector wajib diisi');
            return;
        }
        try {
            const isUpdate = editingInspectorId !== null;
            const url = isUpdate ? `${api_url}/api/settings/inspectors/${editingInspectorId}` : `${api_url}/api/settings/inspectors`;
            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inspectorForm)
            });
            const result = await res.json();
            if (result.status === 'success') {
                setInspectorForm({ name: '', active: true });
                setEditingInspectorId(null);
                loadInspectors();
                if (window.loadInspectorNames) window.loadInspectorNames(api_url);
            } else {
                alert('Gagal simpan: ' + result.message);
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleToggleInspector = async (item) => {
        try {
            await fetch(`${api_url}/api/settings/inspectors/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.name, active: item.active ? 0 : 1 })
            });
            loadInspectors();
            if (window.loadInspectorNames) window.loadInspectorNames(api_url);
        } catch (e) {
            console.error('Toggle inspector error:', e);
        }
    };

    const handleDeleteInspector = async (id) => {
        if (!confirm('Hapus nama inspector ini?')) return;
        try {
            await fetch(`${api_url}/api/settings/inspectors/${id}`, { method: 'DELETE' });
            loadInspectors();
            if (window.loadInspectorNames) window.loadInspectorNames(api_url);
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    // ===== LINE POSITIONS HANDLERS =====

    const loadLinePositions = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/line-positions`);
            const result = await res.json();
            if (result.status === 'success') setLinePositions(result.data);
        } catch (e) {
            console.error('Load line positions error:', e);
        }
    }, [api_url]);

    React.useEffect(() => {
        if (activeSub === 'line-positions') loadLinePositions();
    }, [activeSub, loadLinePositions]);

    const handleEditLinePos = (item) => {
        setLinePosForm({ name: item.name, active: !!item.active });
        setEditingLinePosId(item.id);
    };

    const handleSaveLinePos = async () => {
        if (!linePosForm.name.trim()) {
            alert('Nama line/pos wajib diisi');
            return;
        }
        try {
            const isUpdate = editingLinePosId !== null;
            const url = isUpdate ? `${api_url}/api/settings/line-positions/${editingLinePosId}` : `${api_url}/api/settings/line-positions`;
            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(linePosForm)
            });
            const result = await res.json();
            if (result.status === 'success') {
                setLinePosForm({ name: '', active: true });
                setEditingLinePosId(null);
                loadLinePositions();
                if (window.loadLinePositions) window.loadLinePositions(api_url);
            } else {
                alert('Gagal simpan: ' + result.message);
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleToggleLinePos = async (item) => {
        try {
            await fetch(`${api_url}/api/settings/line-positions/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.name, active: item.active ? 0 : 1 })
            });
            loadLinePositions();
            if (window.loadLinePositions) window.loadLinePositions(api_url);
        } catch (e) {
            console.error('Toggle line position error:', e);
        }
    };

    const handleDeleteLinePos = async (id) => {
        if (!confirm('Hapus nama line/pos ini?')) return;
        try {
            await fetch(`${api_url}/api/settings/line-positions/${id}`, { method: 'DELETE' });
            loadLinePositions();
            if (window.loadLinePositions) window.loadLinePositions(api_url);
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    const handleAddCommand = async () => {
        const keyword = newCmdKeyword.trim();
        if (!keyword) return;
        try {
            const res = await fetch(`${api_url}/api/settings/voice-commands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command_type: newCmdType, keyword, feedback_text: newCmdFeedback.trim() })
            });
            const result = await res.json();
            if (result.status === 'success') {
                setNewCmdKeyword('');
                setNewCmdFeedback('');
                loadCommands();
                refreshGlobalCommands();
            } else {
                alert('Gagal tambah: ' + result.message);
            }
        } catch (e) {
            alert('Koneksi error: ' + e.message);
        }
    };

    const handleDeleteCommand = async (id) => {
        try {
            const res = await fetch(`${api_url}/api/settings/voice-commands/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.status === 'success') { loadCommands(); refreshGlobalCommands(); }
        } catch (e) {
            alert('Gagal hapus: ' + e.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Submenu Tabs */}
            <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100 inline-flex gap-1">
                {submenus.map(sub => (
                    <button
                        key={sub.id}
                        onClick={() => { setActiveSub(sub.id); setEditItem(null); }}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                            activeSub === sub.id
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <i className={`fas ${sub.icon} text-sm`}></i>
                        {sub.label}
                    </button>
                ))}
            </div>

            {/* ===== PANDUAN VOICE SUBMENU ===== */}
            {activeSub === 'voice-guides' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 self-start">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner">
                                <i className={`fas ${editItem ? 'fa-pen' : 'fa-plus'}`}></i>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                    {editItem ? 'Edit Panduan' : 'Tambah Panduan'}
                                </h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                    {editItem ? 'Ubah data panduan yang sudah ada' : 'Buat panduan deteksi suara baru'}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Kode Defect</label>
                                <input type="text" value={form.code} onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="Contoh: A, B, M" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" maxLength={10} />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Problem</label>
                                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Contoh: Weld.Undercut (Memotong Part)" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Keywords (pisahkan dengan koma)</label>
                                <textarea value={form.keywords} onChange={(e) => setForm({...form, keywords: e.target.value})} placeholder="undercut,memotong" rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none" />
                                <p className="text-[7px] font-bold text-slate-400 mt-1 italic">Semakin banyak keyword, semakin akurat deteksi suara.</p>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Feedback Suara AI</label>
                                <input type="text" value={form.feedback_text} onChange={(e) => setForm({...form, feedback_text: e.target.value})} placeholder="Contoh: Bolong, Memotong, Keropos" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                                <p className="text-[7px] font-bold text-slate-400 mt-1 italic">Teks yang akan diucapkan AI saat defect ini terdeteksi (cth: "titik 2 Bolong").</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={handleSaveGuide} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1.5">
                                    <i className="fas fa-check text-[10px]"></i>
                                    {editItem ? 'Simpan Perubahan' : 'Tambah'}
                                </button>
                                {editItem && (
                                    <button onClick={() => { setEditItem(null); setForm({ code: '', name: '', keywords: '' }); }} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Batal</button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-list"></i></div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Daftar Panduan Voice</h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{guides.length} item terdaftar</p>
                                </div>
                            </div>
                            <button onClick={openAdd} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5">
                                <i className="fas fa-plus text-[8px]"></i> Tambah Baru
                            </button>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
                        ) : guides.length === 0 ? (
                            <div className="text-center py-16 text-slate-300"><i className="fas fa-microphone-slash text-4xl mb-3"></i><p className="text-sm font-bold">Belum ada panduan voice</p></div>
                        ) : (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto max-h-[60vh] custom-scrollbar">
                                    <table className="w-full text-left border-collapse text-[10px]">
                                        <thead className="bg-slate-900 text-white sticky top-0 font-black uppercase tracking-wider text-[9px] z-10">
                                            <tr><th className="p-3 text-center w-16">Kode</th><th className="p-3">Nama Problem</th><th className="p-3">Keywords</th><th className="p-3">Feedback Suara</th><th className="p-3 text-center w-28">Aksi</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {guides.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 text-center">
                                                        <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-[10px] ${['A','B','C','D','E','F','G'].includes(item.code) ? 'bg-red-50 text-red-700' : ['H','I','J'].includes(item.code) ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{item.code}</span>
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800 min-w-[200px]">{item.name}</td>
                                                    <td className="p-3 text-slate-500 italic max-w-[300px] truncate" title={item.keywords}>
                                                        {item.keywords.split(',').map((k, i) => <span key={i} className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-1 mb-0.5 text-[8px] font-bold">{k.trim()}</span>)}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-[9px] font-black border border-blue-200">
                                                            {item.feedback_text || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-all" title="Edit"><i className="fas fa-pen text-[9px]"></i></button>
                                                            <button onClick={() => handleDeleteGuide(item.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all" title="Hapus"><i className="fas fa-trash-can text-[9px]"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== PERINTAH SUARA SUBMENU ===== */}
            {activeSub === 'voice-commands' && (
                <div className="space-y-6">
                    {/* Add new keyword form */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-plus"></i></div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Tambah Kata Kunci Baru</h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Atur kata-kata untuk mendeteksi perintah suara kuantitas</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Jenis Perintah</label>
                                <select value={newCmdType} onChange={(e) => setNewCmdType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                                    {Object.entries(CMD_LABELS).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-[2] min-w-[200px]">
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Kata Kunci</label>
                                <input type="text" value={newCmdKeyword} onChange={(e) => setNewCmdKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddCommand(); }} placeholder="Contoh: ok, cacat, buang, batal" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div className="flex-[2] min-w-[200px]">
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Feedback Suara</label>
                                <input type="text" value={newCmdFeedback} onChange={(e) => setNewCmdFeedback(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddCommand(); }} placeholder="Contoh: Okee, Cacat, Scrap, Dihapus" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <button onClick={handleAddCommand} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20 flex items-center gap-1.5 h-[38px]">
                                <i className="fas fa-plus text-[10px]"></i> Tambah
                            </button>
                        </div>
                    </div>

                    {/* Command groups */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {Object.entries(CMD_LABELS).map(([type, meta]) => {
                            const items = commands[type] || [];
                            const colorMap = {
                                emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600', header: 'text-emerald-800' },
                                red: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', icon: 'text-red-600', header: 'text-red-800' },
                                slate: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700', icon: 'text-slate-600', header: 'text-slate-800' },
                                orange: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-600', header: 'text-orange-800' },
                                purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: 'text-purple-600', header: 'text-purple-800' },
                                blue: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', icon: 'text-blue-600', header: 'text-blue-800' }
                            };
                            const c = colorMap[meta.color];
                            return (
                                <div key={type} className={`${c.bg} rounded-3xl p-5 border ${c.border} shadow-sm`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`w-10 h-10 rounded-xl ${c.badge} flex items-center justify-center shadow-inner`}>
                                            <i className={`fas ${meta.icon} text-sm`}></i>
                                        </div>
                                        <div>
                                            <h3 className={`text-xs font-black uppercase tracking-widest ${c.header}`}>{meta.label}</h3>
                                            <p className="text-[9px] font-bold text-slate-400">{items.length} kata kunci</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 min-h-[36px]">
                                        {items.length === 0 ? (
                                            <p className="text-[9px] italic text-slate-400">Belum ada kata kunci</p>
                                        ) : items.map(item => (
                                            <span key={item.id} className={`inline-flex items-center gap-1 ${c.badge} px-2.5 py-1 rounded-lg text-[9px] font-bold border ${c.border}`}>
                                                "{item.keyword}"
                                                {item.feedback_text && (
                                                    <span className="ml-0.5 text-[7px] opacity-60 font-normal">→ {item.feedback_text}</span>
                                                )}
                                                <button onClick={() => handleDeleteCommand(item.id)} className="ml-0.5 hover:text-red-600 transition-colors" title="Hapus">
                                                    <i className="fas fa-times text-[7px]"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Info panel */}
                    <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5"><i className="fas fa-circle-info text-sm"></i></div>
                            <div>
                                <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Cara Kerja Deteksi Perintah Suara</h4>
                                <p className="text-[9px] font-bold text-blue-700/70 leading-relaxed">
                                    Saat kamu berbicara, sistem akan mencocokkan kata-katamu dengan daftar kata kunci di atas. 
                                    Jika kata yang kamu ucapkan <strong>mengandung</strong> kata kunci yang terdaftar, perintah akan dijalankan.
                                    Tambahkan variasi kata sebanyak mungkin agar deteksi lebih akurat (contoh: "ok", "oke", "bagus").
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 4M1E ABNORMALITY SUBMENU ===== */}
            {activeSub === 'abnormality' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 self-start">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shadow-inner">
                                <i className={`fas ${editingAbnId ? 'fa-pen' : 'fa-plus'}`}></i>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{editingAbnId ? 'Edit Kategori' : 'Tambah Kategori'}</h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Atur kategori masalah 4M1E + 1E</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Kategori 4M1E</label>
                                <select value={abnForm.category_4m1e} onChange={(e) => setAbnForm({...abnForm, category_4m1e: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                                    {['Man', 'Mesin', 'Material', 'Metode', 'Environment'].map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Masalah</label>
                                <input type="text" value={abnForm.problem_name} onChange={(e) => setAbnForm({...abnForm, problem_name: e.target.value})} placeholder="Contoh: Kurang Konsentrasi" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Keywords Suara (pisahkan koma)</label>
                                <input type="text" value={abnForm.keywords} onChange={(e) => setAbnForm({...abnForm, keywords: e.target.value})} placeholder="kurang konsentrasi,kurang fokus,ngantuk" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                                <p className="text-[7px] font-bold text-slate-400 mt-1 italic">Kata kunci untuk deteksi suara (voice trigger).</p>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Urutan</label>
                                <input type="number" value={abnForm.sort_order} onChange={(e) => setAbnForm({...abnForm, sort_order: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div className="flex gap-2">
                                {editingAbnId && (
                                    <button onClick={() => { setAbnForm({ category_4m1e: 'Man', problem_name: '', keywords: '', sort_order: 0 }); setEditingAbnId(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                        <i className="fas fa-times text-[10px]"></i> Batal
                                    </button>
                                )}
                                <button onClick={handleSaveAbn} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-600/20 flex items-center justify-center gap-1.5">
                                    <i className={`fas ${editingAbnId ? 'fa-pen' : 'fa-check'} text-[10px]`}></i> {editingAbnId ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-list"></i></div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Daftar 4M1E</h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{abnCategories.length} item terdaftar</p>
                                </div>
                            </div>
                        </div>
                        {abnCategories.length === 0 ? (
                            <div className="text-center py-16 text-slate-300"><i className="fas fa-triangle-exclamation text-4xl mb-3"></i><p className="text-sm font-bold">Belum ada kategori 4M1E</p></div>
                        ) : (
                            <div className="space-y-4">
                                {['Man', 'Mesin', 'Material', 'Metode', 'Environment'].map(cat => {
                                    const items = abnGrouped[cat] || [];
                                    const c = ABN_COLORS[cat];
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={cat} className={`${c.bg} rounded-2xl p-4 border ${c.border}`}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className={`w-8 h-8 rounded-xl ${c.badge} flex items-center justify-center shadow-inner`}>
                                                    <i className={`fas ${ABN_ICONS[cat]} text-sm`}></i>
                                                </div>
                                                <h4 className={`text-[10px] font-black uppercase tracking-widest ${c.header}`}>{cat} <span className="text-slate-400 font-bold">({items.length})</span></h4>
                                            </div>
                                            <div className="overflow-x-auto border border-slate-200/50 rounded-xl">
                                                <table className="w-full text-left border-collapse text-[9px]">
                                                    <thead className="bg-white/50 text-slate-500 font-black uppercase tracking-wider text-[8px]">
                                                        <tr><th className="p-2">Masalah</th><th className="p-2">Keywords</th><th className="p-2 text-center w-16">Urutan</th><th className="p-2 text-center w-16">Status</th><th className="p-2 text-center w-20">Aksi</th></tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {items.map(item => (
                                                            <tr key={item.id} className="hover:bg-white/50 transition-colors">
                                                                <td className="p-2 font-bold text-slate-800">{item.problem_name}</td>
                                                                <td className="p-2 text-slate-500 italic max-w-[200px] truncate" title={item.keywords}>
                                                                    {(item.keywords || '').split(',').filter(Boolean).map((k, i) => (
                                                                        <span key={i} className="inline-block bg-white text-slate-500 px-1.5 py-0.5 rounded mr-1 mb-0.5 text-[7px] font-bold border border-slate-200">{k.trim()}</span>
                                                                    ))}
                                                                </td>
                                                                <td className="p-2 text-center font-mono font-bold text-slate-600">{item.sort_order}</td>
                                                                <td className="p-2 text-center">
                                                                    <button onClick={() => handleToggleAbn(item)} className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-wider ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{item.active ? 'Aktif' : 'Nonaktif'}</button>
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button onClick={() => handleEditAbn(item)} className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-all" title="Edit"><i className="fas fa-pen text-[8px]"></i></button>
                                                                        <button onClick={() => handleDeleteAbn(item.id)} className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all" title="Hapus"><i className="fas fa-trash-can text-[8px]"></i></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== TIMER ISTIRAHAT SUBMENU ===== */}
            {activeSub === 'timer-breaks' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 self-start">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shadow-inner">
                                <i className="fas fa-plus"></i>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{editingBreakId ? 'Edit Jadwal Istirahat' : 'Tambah Jadwal Istirahat'}</h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Timer otomatis pause saat jam istirahat</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Istirahat</label>
                                <input type="text" value={breakForm.break_label} onChange={(e) => setBreakForm({...breakForm, break_label: e.target.value})} placeholder="Contoh: Istirahat Siang" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Jam Mulai</label>
                                    <input type="time" value={breakForm.start_time} onChange={(e) => setBreakForm({...breakForm, start_time: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                                </div>
                                <div>
                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Jam Selesai</label>
                                    <input type="time" value={breakForm.end_time} onChange={(e) => setBreakForm({...breakForm, end_time: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                                </div>
                            </div>
                            {/* Day-of-week checkboxes */}
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hari Aktif</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { key: 'monday', label: 'SN' },
                                        { key: 'tuesday', label: 'SL' },
                                        { key: 'wednesday', label: 'R' },
                                        { key: 'thursday', label: 'K' },
                                        { key: 'friday', label: 'J' },
                                        { key: 'saturday', label: 'Sb' },
                                        { key: 'sunday', label: 'M' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer text-[10px] font-bold border transition-all ${breakForm[key] ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}>
                                            <input type="checkbox" checked={breakForm[key]} onChange={(e) => setBreakForm({...breakForm, [key]: e.target.checked})} className="hidden" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={breakForm.active} onChange={(e) => setBreakForm({...breakForm, active: e.target.checked})} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                                <span className="text-[10px] font-bold text-slate-500">Aktif</span>
                            </div>
                            <div className="flex gap-2">
                                {editingBreakId && (
                                    <button onClick={() => { setBreakForm({ break_label: '', start_time: '12:00', end_time: '13:00', active: true }); setEditingBreakId(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                        <i className="fas fa-times text-[10px]"></i> Batal
                                    </button>
                                )}
                                <button onClick={handleSaveBreak} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-amber-600/20 flex items-center justify-center gap-1.5">
                                    <i className={`fas ${editingBreakId ? 'fa-pen' : 'fa-check'} text-[10px]`}></i> {editingBreakId ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-list"></i></div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Daftar Jadwal Istirahat</h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{breaks.length} jadwal</p>
                                </div>
                            </div>
                        </div>
                        {breaks.length === 0 ? (
                            <div className="text-center py-16 text-slate-300"><i className="fas fa-clock text-4xl mb-3"></i><p className="text-sm font-bold">Belum ada jadwal istirahat</p></div>
                        ) : (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-[10px]">
                                    <thead className="bg-slate-900 text-white sticky top-0 font-black uppercase tracking-wider text-[9px] z-10">
                                        <tr><th className="p-3">Label</th><th className="p-3">Mulai</th><th className="p-3">Selesai</th><th className="p-3">Hari</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-24">Aksi</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {breaks.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 font-bold text-slate-800">{item.break_label}</td>
                                                <td className="p-3 font-mono font-bold text-slate-700">{item.start_time?.substring(0, 5)}</td>
                                                <td className="p-3 font-mono font-bold text-slate-700">{item.end_time?.substring(0, 5)}</td>
                                                <td className="p-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {[
                                                            { key: 'monday', abbr: 'SN' },
                                                            { key: 'tuesday', abbr: 'SL' },
                                                            { key: 'wednesday', abbr: 'R' },
                                                            { key: 'thursday', abbr: 'K' },
                                                            { key: 'friday', abbr: 'J' },
                                                            { key: 'saturday', abbr: 'Sb' },
                                                            { key: 'sunday', abbr: 'M' },
                                                        ].filter(d => item[d.key]).map(d => (
                                                            <span key={d.key} className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[9px] font-black">{d.abbr}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button onClick={() => handleToggleBreak(item)} className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {item.active ? 'Aktif' : 'Nonaktif'}
                                                    </button>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => handleEditBreak(item)} className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-all" title="Edit">
                                                            <i className="fas fa-pen text-[9px]"></i>
                                                        </button>
                                                        <button onClick={() => handleDeleteBreak(item.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all" title="Hapus">
                                                            <i className="fas fa-trash-can text-[9px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== NAMA INSPECTOR SUBMENU ===== */}
            {activeSub === 'inspector-names' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 self-start">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center shadow-inner">
                                <i className="fas fa-user"></i>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{editingInspectorId ? 'Edit Nama Inspector' : 'Tambah Nama Inspector'}</h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Daftar inspector untuk dropdown voice</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Inspector</label>
                                <input type="text" value={inspectorForm.name} onChange={(e) => setInspectorForm({...inspectorForm, name: e.target.value})} placeholder="Contoh: Ahmad" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={inspectorForm.active} onChange={(e) => setInspectorForm({...inspectorForm, active: e.target.checked})} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                                <span className="text-[10px] font-bold text-slate-500">Aktif</span>
                            </div>
                            <div className="flex gap-2">
                                {editingInspectorId && (
                                    <button onClick={() => { setInspectorForm({ name: '', active: true }); setEditingInspectorId(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                        <i className="fas fa-times text-[10px]"></i> Batal
                                    </button>
                                )}
                                <button onClick={handleSaveInspector} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-sky-600/20 flex items-center justify-center gap-1.5">
                                    <i className={`fas ${editingInspectorId ? 'fa-pen' : 'fa-check'} text-[10px]`}></i> {editingInspectorId ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-list"></i></div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Daftar Inspector</h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{inspectors.length} nama</p>
                                </div>
                            </div>
                        </div>
                        {inspectors.length === 0 ? (
                            <div className="text-center py-16 text-slate-300"><i className="fas fa-user text-4xl mb-3"></i><p className="text-sm font-bold">Belum ada nama inspector</p></div>
                        ) : (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-[10px]">
                                    <thead className="bg-slate-900 text-white sticky top-0 font-black uppercase tracking-wider text-[9px] z-10">
                                        <tr><th className="p-3">Nama</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-24">Aksi</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {inspectors.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 font-bold text-slate-800">{item.name}</td>
                                                <td className="p-3 text-center">
                                                    <button onClick={() => handleToggleInspector(item)} className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {item.active ? 'Aktif' : 'Nonaktif'}
                                                    </button>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => handleEditInspector(item)} className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-all" title="Edit">
                                                            <i className="fas fa-pen text-[9px]"></i>
                                                        </button>
                                                        <button onClick={() => handleDeleteInspector(item.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all" title="Hapus">
                                                            <i className="fas fa-trash-can text-[9px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== LINE / POS SUBMENU ===== */}
            {activeSub === 'line-positions' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 self-start">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shadow-inner">
                                <i className="fas fa-location-dot"></i>
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{editingLinePosId ? 'Edit Line / Pos' : 'Tambah Line / Pos'}</h3>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Daftar line/pos untuk dropdown voice</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Line / Pos</label>
                                <input type="text" value={linePosForm.name} onChange={(e) => setLinePosForm({...linePosForm, name: e.target.value})} placeholder="Contoh: Line 1 / Pos 1" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={linePosForm.active} onChange={(e) => setLinePosForm({...linePosForm, active: e.target.checked})} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                                <span className="text-[10px] font-bold text-slate-500">Aktif</span>
                            </div>
                            <div className="flex gap-2">
                                {editingLinePosId && (
                                    <button onClick={() => { setLinePosForm({ name: '', active: true }); setEditingLinePosId(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                        <i className="fas fa-times text-[10px]"></i> Batal
                                    </button>
                                )}
                                <button onClick={handleSaveLinePos} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-rose-600/20 flex items-center justify-center gap-1.5">
                                    <i className={`fas ${editingLinePosId ? 'fa-pen' : 'fa-check'} text-[10px]`}></i> {editingLinePosId ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-list"></i></div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Daftar Line / Pos</h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{linePositions.length} nama</p>
                                </div>
                            </div>
                        </div>
                        {linePositions.length === 0 ? (
                            <div className="text-center py-16 text-slate-300"><i className="fas fa-location-dot text-4xl mb-3"></i><p className="text-sm font-bold">Belum ada line/pos</p></div>
                        ) : (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-[10px]">
                                    <thead className="bg-slate-900 text-white sticky top-0 font-black uppercase tracking-wider text-[9px] z-10">
                                        <tr><th className="p-3">Nama</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-24">Aksi</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {linePositions.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 font-bold text-slate-800">{item.name}</td>
                                                <td className="p-3 text-center">
                                                    <button onClick={() => handleToggleLinePos(item)} className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {item.active ? 'Aktif' : 'Nonaktif'}
                                                    </button>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => handleEditLinePos(item)} className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-all" title="Edit">
                                                            <i className="fas fa-pen text-[9px]"></i>
                                                        </button>
                                                        <button onClick={() => handleDeleteLinePos(item.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all" title="Hapus">
                                                            <i className="fas fa-trash-can text-[9px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

window.SettingsTab = SettingsTab;
