const { useState, useEffect } = React;

function LoginPage({ api_url, onLogin }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetch(`${api_url}/api/auth/users`)
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') setUsers(res.data);
                else setError('Gagal memuat data user');
            })
            .catch(() => setError('Koneksi ke server gagal'))
            .finally(() => setLoading(false));
    }, [api_url]);

    const handleLogin = async () => {
        if (!selectedUser) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch(`${api_url}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: selectedUser.username,
                    password: selectedUser.has_password ? password : undefined
                })
            });
            const result = await res.json();
            if (result.status === 'success') {
                localStorage.setItem('qc_token', result.data.token);
                localStorage.setItem('qc_user', JSON.stringify(result.data.user));
                if (onLogin) onLogin(result.data.user);
            } else {
                setError(result.message || 'Login gagal');
            }
        } catch (e) {
            setError('Koneksi error: ' + e.message);
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-blue-400 mb-4"></i>
                    <p className="text-sm font-bold text-slate-400">Memuat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-blue-600/10">
                        <img src="logo.png" className="w-full h-full object-contain p-2" alt="Logo" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">WIS <span className="text-blue-400">FJI</span></h1>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Welding Inspection System</p>
                </div>

                <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
                    {!selectedUser ? (
                        <>
                            <h2 className="text-sm font-black text-white mb-4 uppercase tracking-wider">Pilih User</h2>
                            {error && <p className="text-red-400 text-xs font-bold mb-3">{error}</p>}
                            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                                {users.map(u => (
                                    <button key={u.id} onClick={() => setSelectedUser(u)}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 transition-all text-left group">
                                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black text-sm group-hover:bg-blue-600/30 transition-colors">
                                            {u.full_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{u.full_name}</div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{u.role}</div>
                                        </div>
                                        {u.has_password ? (
                                            <i className="fas fa-lock text-[10px] text-slate-600"></i>
                                        ) : (
                                            <i className="fas fa-arrow-right text-[10px] text-slate-600 group-hover:text-blue-400 transition-colors"></i>
                                        )}
                                    </button>
                                ))}
                                {users.length === 0 && (
                                    <p className="text-center text-slate-500 text-xs font-bold py-8">Belum ada user</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <button onClick={() => { setSelectedUser(null); setPassword(''); setError(''); }}
                                className="text-slate-500 hover:text-white text-xs font-bold mb-4 flex items-center gap-1 transition-colors">
                                <i className="fas fa-arrow-left"></i> Kembali
                            </button>
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto font-black text-xl mb-3">
                                    {selectedUser.full_name.charAt(0).toUpperCase()}
                                </div>
                                <h2 className="text-lg font-black text-white">{selectedUser.full_name}</h2>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{selectedUser.role}</p>
                            </div>

                            {selectedUser.has_password && (
                                <div className="mb-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Password</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                        placeholder="Masukkan password..."
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600" />
                                </div>
                            )}

                            {error && <p className="text-red-400 text-xs font-bold mb-3 text-center">{error}</p>}

                            <button onClick={handleLogin} disabled={submitting || (selectedUser.has_password && !password)}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-sm py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                                {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-arrow-right"></i>}
                                {submitting ? 'Memproses...' : 'Masuk'}
                            </button>
                        </>
                    )}
                </div>

                <p className="text-center text-[10px] text-slate-600 font-bold mt-6">Welding Inspection System FJI</p>
            </div>
        </div>
    );
}

window.LoginPage = LoginPage;
