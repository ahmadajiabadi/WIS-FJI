const { useState, useEffect } = React;

const ROLE_DEFAULTS = {
    admin: ['scan','voice','database','dashboard','live-monitoring','asakai','linestop','master','ppic','settings','users'],
    qa: ['scan','database','dashboard','live-monitoring','asakai'],
    qc_welding: ['scan','voice','database','dashboard','live-monitoring','linestop'],
    welding: ['scan','database','dashboard','linestop'],
    ppic: ['ppic','database','dashboard'],
    operator_admin: ['scan','database'],
};

const ALL_MENUS = [
    { id: 'scan', label: 'Input CS', icon: 'fa-pen-to-square' },
    { id: 'voice', label: 'Voice QC', icon: 'fa-microphone' },
    { id: 'database', label: 'Database', icon: 'fa-database' },
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie' },
    { id: 'live-monitoring', label: 'Live QC Monitoring', icon: 'fa-desktop' },
    { id: 'asakai', label: 'Asakai QC Meeting', icon: 'fa-sun' },
    { id: 'linestop', label: 'Line Stop', icon: 'fa-circle-stop' },
    { id: 'master', label: 'Master Data', icon: 'fa-folder-open' },
    { id: 'ppic', label: 'PPIC', icon: 'fa-calendar-days' },
    { id: 'settings', label: 'Settings', icon: 'fa-gear' },
    { id: 'users', label: 'Management User', icon: 'fa-users-gear' },
];

function UsersTab({ api_url }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'operator_admin', permissions: [] });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const token = localStorage.getItem('qc_token');
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    const loadUsers = () => {
        setLoading(true);
        fetch(`${api_url}/api/users`, { headers })
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') setUsers(res.data);
                else setError(res.message);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadUsers(); }, []);

    useEffect(() => {
        if (!showForm && editUser) {
            setShowForm(true);
        }
    }, [editUser]);

    const openCreate = () => {
        setEditUser(null);
        const defaults = ROLE_DEFAULTS['operator_admin'] || [];
        setForm({ username: '', password: '', full_name: '', role: 'operator_admin', permissions: defaults });
        setError('');
        setShowForm(true);
    };

    const openEdit = (u) => {
        let perms = null;
        if (u.permissions !== null && u.permissions !== undefined) {
            try { perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions; } catch (e) {}
        }
        if (!Array.isArray(perms) || perms.length === 0) {
            perms = ROLE_DEFAULTS[u.role] || [];
        }
        setEditUser(u);
        setForm({ username: u.username, password: '', full_name: u.full_name, role: u.role, permissions: perms, is_active: u.is_active });
        setError('');
        setShowForm(true);
    };

    const handleRoleChange = (role) => {
        setForm(prev => ({ ...prev, role }));
    };

    const togglePerm = (menuId) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(menuId)
                ? prev.permissions.filter(p => p !== menuId)
                : [...prev.permissions, menuId]
        }));
    };

    const handleSave = async () => {
        if (!form.username || !form.full_name) {
            setError('Username dan Nama Lengkap harus diisi');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                username: form.username,
                full_name: form.full_name,
                role: form.role,
                permissions: form.permissions,
                is_active: form.is_active !== undefined ? form.is_active : 1,
            };
            if (form.password) payload.password = form.password;

            const url = editUser
                ? `${api_url}/api/users/${editUser.id}`
                : `${api_url}/api/users`;
            const method = editUser ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
            const result = await res.json();
            if (result.status === 'success') {
                setSuccessMsg(editUser ? 'User diupdate' : 'User dibuat');
                setShowForm(false);
                setEditUser(null);
                loadUsers();
                setTimeout(() => setSuccessMsg(''), 2000);
            } else {
                setError(result.message);
            }
        } catch (e) {
            setError(e.message);
        }
        setSaving(false);
    };

    const handleDelete = async (u) => {
        if (!confirm(`Hapus permanen user "${u.full_name}"?`)) return;
        try {
            const res = await fetch(`${api_url}/api/users/${u.id}`, { method: 'DELETE', headers });
            const result = await res.json();
            if (result.status === 'success') {
                setSuccessMsg('User berhasil dihapus');
                loadUsers();
                setTimeout(() => setSuccessMsg(''), 2000);
            } else {
                alert(result.message);
            }
        } catch (e) {
            alert(e.message);
        }
    };

    const roleLabel = (r) => {
        const map = { admin: 'Admin', qa: 'QA', qc_welding: 'QC Welding', welding: 'Welding', ppic: 'PPIC', operator_admin: 'Operator Admin' };
        return map[r] || r;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-slate-300 mb-4"></i>
                    <p className="text-sm font-bold text-slate-400">Memuat data user...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-800">Management User</h2>
                    <p className="text-xs font-bold text-slate-400 mt-1">{users.length} user terdaftar</p>
                </div>
                <button onClick={openCreate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-200 transition-all">
                    <i className="fas fa-plus"></i> Tambah User
                </button>
            </div>

            {successMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                    <i className="fas fa-check-circle"></i> {successMsg}
                </div>
            )}

            {showForm ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-base font-black text-slate-800 mb-5">{editUser ? 'Edit User' : 'Buat User Baru'}</h3>
                    {error && <p className="text-red-500 text-xs font-bold mb-4">{error}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Username *</label>
                            <input type="text" value={form.username}
                                onChange={e => setForm({...form, username: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">
                                Password {editUser ? '(kosongkan jika tidak diubah)' : ''}
                            </label>
                            <input type="password" value={form.password}
                                onChange={e => setForm({...form, password: e.target.value})}
                                placeholder={editUser ? 'Biarkan kosong jika tidak diubah' : 'Kosongkan jika tanpa password'}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Nama Lengkap *</label>
                            <input type="text" value={form.full_name}
                                onChange={e => setForm({...form, full_name: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Role</label>
                            <select value={form.role} onChange={e => handleRoleChange(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="admin">Admin</option>
                                <option value="qa">QA</option>
                                <option value="qc_welding">QC Welding</option>
                                <option value="welding">Welding</option>
                                <option value="ppic">PPIC</option>
                                <option value="operator_admin">Operator Admin</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-5">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase">Akses Menu</label>
                            <button onClick={() => {
                                const defaults = ROLE_DEFAULTS[form.role] || [];
                                setForm(prev => ({ ...prev, permissions: defaults }));
                            }} className="text-[9px] font-bold text-blue-600 hover:text-blue-800 transition-colors">
                                <i className="fas fa-rotate mr-1"></i>Reset ke Default {form.role}
                            </button>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                            <p className="text-[10px] text-slate-500 mb-3 font-bold">Centang menu yang boleh diakses user ini</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {ALL_MENUS.map(m => (
                                    <label key={m.id} onClick={() => togglePerm(m.id)}
                                        className={'flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all ' +
                                            (form.permissions.includes(m.id)
                                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}>
                                        <div className={'w-5 h-5 rounded flex items-center justify-center text-[8px] ' +
                                            (form.permissions.includes(m.id) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-transparent')}>
                                            {form.permissions.includes(m.id) && <i className="fas fa-check"></i>}
                                        </div>
                                        <span className="text-xs font-bold">{m.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-200 transition-all">
                            {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                            {saving ? 'Menyimpan...' : 'Simpan'}
                        </button>
                        <button onClick={() => { setShowForm(false); setEditUser(null); setError(''); }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-2xl font-black text-xs transition-all">
                            Batal
                        </button>
                        {editUser && (
                            <span className="ml-auto text-[10px] text-slate-400 font-bold">
                                Status: {editUser.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama</th>
                                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Username</th>
                                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Role</th>
                                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Akses Menu</th>
                                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                                    <th className="text-right px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map(u => {
                                    let perms = [];
                                    try { perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || []); } catch (e) {}
                                    if (!Array.isArray(perms) || perms.length === 0) perms = ROLE_DEFAULTS[u.role] || [];
                                    return (
                                        <tr key={u.id} className={'hover:bg-slate-50 transition-colors ' + (!u.is_active ? 'opacity-50' : '')}>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">
                                                        {u.full_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{u.full_name}</div>
                                                        <div className="text-[10px] text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleDateString('id') : '-'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 font-mono text-sm font-bold text-slate-600">{u.username}</td>
                                            <td className="px-5 py-4">
                                                <span className={'inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ' + (
                                                    u.role === 'admin' ? 'bg-red-100 text-red-700' :
                                                    u.role === 'qa' ? 'bg-purple-100 text-purple-700' :
                                                    u.role === 'qc_welding' ? 'bg-blue-100 text-blue-700' :
                                                    u.role === 'welding' ? 'bg-amber-100 text-amber-700' :
                                                    u.role === 'ppic' ? 'bg-emerald-100 text-emerald-700' :
                                                    'bg-slate-100 text-slate-700'
                                                )}>{roleLabel(u.role)}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {perms.slice(0, 4).map(p => {
                                                        const menu = ALL_MENUS.find(m => m.id === p);
                                                        return menu ? (
                                                            <span key={p} className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[8px] font-bold">{menu.label}</span>
                                                        ) : null;
                                                    })}
                                                    {perms.length > 4 && (
                                                        <span className="text-[8px] text-slate-400 font-bold px-1">+{perms.length - 4}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={'inline-flex items-center gap-1 text-[10px] font-bold ' + (u.is_active ? 'text-emerald-600' : 'text-red-400')}>
                                                    <div className={'w-1.5 h-1.5 rounded-full ' + (u.is_active ? 'bg-emerald-500' : 'bg-red-400')}></div>
                                                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => openEdit(u)}
                                                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-blue-600 transition-all">
                                                        <i className="fas fa-pen text-xs"></i>
                                                    </button>
                                                    <button onClick={() => handleDelete(u)}
                                                        className="p-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 transition-all">
                                                        <i className="fas fa-trash-can text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {users.length === 0 && (
                        <div className="text-center py-16">
                            <i className="fas fa-users-slash text-3xl text-slate-200 mb-3"></i>
                            <p className="text-sm font-bold text-slate-300">Belum ada user</p>
                            <button onClick={openCreate} className="mt-4 text-blue-600 text-xs font-bold hover:underline">Buat user pertama</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

window.UsersTab = UsersTab;
