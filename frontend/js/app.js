const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyv806fA_vR4Y8SST78_l6i1r_UvWn40mG0-q9mK1jZ0L-J0/exec";

// Override fetch to use Capacitor native HTTP on Android (bypass WebView restrictions)
(function() {
    const __origFetch = window.fetch.bind(window);
    try {
        const cap = window.Capacitor;
        if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.CapacitorHttp) {
            const http = cap.Plugins.CapacitorHttp;
            window.fetch = async function(input, init) {
                try {
                    const url = typeof input === 'string' ? input : input.url;
                    const method = ((init && init.method) || 'GET').toUpperCase();
                    const headers = (init && init.headers) || {};
                    const data = (init && init.body) || undefined;
                    const res = await http.request({ url, method, headers, data });
                    const body = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data || '');
                    return new Response(body, {
                        status: res.status || 200,
                        headers: new Headers(res.headers || {}),
                    });
                } catch (e) {
                    return __origFetch(input, init);
                }
            };
        }
    } catch (e) { /* silently fall through to original fetch */ }
})();

const { useState, useEffect } = React;

function ServerSetup({ onSave }) {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('3001');
    const [error, setError] = useState('');
    const [testing, setTesting] = useState(false);

    const handleConnect = async () => {
        if (!ip.trim()) { setError('IP Address tidak boleh kosong'); return; }
        setError('');
        const url = `http://${ip.trim()}:${port.trim()}`;
        setTesting(true);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; }, 5000);
        try {
            const res = await fetch(`${url}/api/settings/inspectors`);
            clearTimeout(timer);
            if (timedOut) return;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            localStorage.setItem('qc_api_url', url);
            setTesting(false);
            onSave(url);
        } catch (e) {
            clearTimeout(timer);
            if (timedOut) return;
            setTesting(false);
            setError('Gagal: ' + (e.message || e.name || 'unknown'));
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-lg">
                        <img src="logo.png" className="w-full h-full object-contain p-2" alt="Logo" />
                    </div>
                </div>
                <h1 className="text-2xl font-black text-slate-800 text-center mb-1">WIS <span className="text-blue-600">FJI</span></h1>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-center mb-6">Welding Inspection System</p>
                <p className="text-sm text-slate-500 text-center mb-6">Masukkan alamat server untuk terhubung</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">IP Address</label>
                        <input
                            type="text"
                            value={ip}
                            onChange={e => setIp(e.target.value)}
                            placeholder="192.168.15.65"
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Port</label>
                        <input
                            type="text"
                            value={port}
                            onChange={e => setPort(e.target.value)}
                            placeholder="3001"
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 font-medium text-center">{error}</p>
                    )}

                    <button
                        onClick={handleConnect}
                        disabled={testing}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl transition-colors"
                    >
                        {testing ? 'Menghubungkan...' : 'Hubungkan'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function App() {
    const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('qc_api_url') || '');
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const stored = localStorage.getItem('qc_user');
            return stored ? JSON.parse(stored) : null;
        } catch (e) { return null; }
    });
    const [activeTab, setActiveTab] = useState('scan');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [draftsCount, setDraftsCount] = useState(0);
    
    // State to pass data between Database Tab and Scan Tab
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isViewingDbRecord, setIsViewingDbRecord] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // State for Global Part Analytics Modal
    const [viewingAnalyticsPart, setViewingAnalyticsPart] = useState(null);

    useEffect(() => {
        window.showPartAnalytics = (part) => {
            setViewingAnalyticsPart(part);
        };
        return () => {
            window.showPartAnalytics = null;
        };
    }, []);

    // Load voice guides & commands & abnormality categories from server on mount
    useEffect(() => {
        if (!apiUrl) return;
        if (window.loadVoiceGuidesFromServer) {
            window.loadVoiceGuidesFromServer(apiUrl);
        }
        if (window.loadVoiceCommandsFromServer) {
            window.loadVoiceCommandsFromServer(apiUrl);
        }
        if (window.loadAbnormalityCategories) {
            window.loadAbnormalityCategories(apiUrl);
        }
        if (window.loadInspectorNames) {
            window.loadInspectorNames(apiUrl);
        }
        if (window.loadLinePositions) {
            window.loadLinePositions(apiUrl);
        }
    }, [apiUrl]);

    // Guard: redirect to first allowed tab if current tab is not permitted
    useEffect(() => {
        if (currentUser && currentUser.permissions && !currentUser.permissions.includes(activeTab)) {
            const firstAllowed = currentUser.permissions[0];
            if (firstAllowed) setActiveTab(firstAllowed);
        }
    }, [currentUser, activeTab]);

    const handleOpenRecord = (record, isEdit = false) => {
        setSelectedRecord(record);
        setIsViewingDbRecord(true);
        setIsEditMode(isEdit);
        setActiveTab('scan');
    };

    const handleSaveSuccess = () => {
        setSaveSuccess(true);
        setTimeout(() => {
            setSaveSuccess(false);
            setActiveTab('database');
        }, 2000);
    };

    const handleSetActiveTab = (tab) => {
        setActiveTab(tab);
        if (tab !== 'scan') {
            setSelectedRecord(null);
            setIsViewingDbRecord(false);
        }
    };

    if (!apiUrl) {
        return <ServerSetup onSave={setApiUrl} />;
    }

    // If not logged in, show login page
    if (!currentUser) {
        return <window.LoginPage api_url={apiUrl} onLogin={(user) => {
            setCurrentUser(user);
            const firstAllowed = user.permissions?.[0] || 'scan';
            setActiveTab(firstAllowed);
        }} />;
    }

    const userPerms = currentUser.permissions || [];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            {/* Sidebar with Navigation */}
            <window.Sidebar 
                activeTab={activeTab} 
                setActiveTab={handleSetActiveTab}
                draftsCount={draftsCount}
                currentUser={currentUser}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                {activeTab !== 'voice' && activeTab !== 'live-monitoring' && activeTab !== 'asakai' && (
                    <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center z-20 shadow-sm shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200/10">
                                <img src="logo.png" className="w-full h-full object-contain p-1" alt="Logo" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">WIS <span className="text-blue-600">FJI</span></h1>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Welding Inspection System</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span className="text-[10px] font-bold text-slate-600 uppercase">System Online</span>
                            </div>
                        </div>
                    </header>
                )}

                {/* Tab Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {activeTab === 'scan' && userPerms.includes('scan') && (
                        <window.ScanTab 
                            api_url={apiUrl}
                            script_url={SCRIPT_URL}
                            initialScanResult={selectedRecord}
                            isViewingDbRecord={isViewingDbRecord}
                            dbIsEditMode={isEditMode}
                            onSaveSuccess={handleSaveSuccess}
                            onDraftsCountChange={setDraftsCount}
                            onClose={() => {
                                setSelectedRecord(null);
                                setIsViewingDbRecord(false);
                                setIsEditMode(false);
                                handleSetActiveTab('database');
                            }}
                        />
                    )}

                    {activeTab === 'voice' && userPerms.includes('voice') && (
                        <window.VoiceTab 
                            api_url={apiUrl}
                            onSaveSuccess={handleSaveSuccess}
                        />
                    )}

                    {activeTab === 'database' && userPerms.includes('database') && (
                        <window.DatabaseTab 
                            api_url={apiUrl}
                            onOpenRecord={handleOpenRecord}
                            currentUser={currentUser}
                        />
                    )}

                    {activeTab === 'dashboard' && userPerms.includes('dashboard') && (
                        <window.DashboardTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'live-monitoring' && userPerms.includes('live-monitoring') && (
                        <window.LiveMonitoringTab 
                            api_url={apiUrl}
                            currentUser={currentUser}
                        />
                    )}

                    {activeTab === 'asakai' && userPerms.includes('asakai') && (
                        <window.AsakaiTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'linestop' && userPerms.includes('linestop') && (
                        <window.LineStopTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'master' && userPerms.includes('master') && (
                        <window.MasterDataTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'ppic' && userPerms.includes('ppic') && (
                        <window.PpicTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'settings' && userPerms.includes('settings') && (
                        <window.SettingsTab 
                            api_url={apiUrl}
                        />
                    )}

                    {activeTab === 'users' && userPerms.includes('users') && (
                        <window.UsersTab 
                            api_url={apiUrl}
                        />
                    )}
                </main>
            </div>

            {/* Success Overlay */}
            {saveSuccess && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-white p-12 rounded-[3rem] text-center shadow-2xl border border-white/20 animate-in zoom-in duration-300">
                        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <i className="fas fa-check text-4xl"></i>
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 mb-2">BERHASIL!</h2>
                        <p className="text-slate-500 font-medium">Data telah tersimpan ke MySQL & Database.</p>
                    </div>
                </div>
            )}

            {/* Global Part Analytics Modal */}
            {viewingAnalyticsPart && (
                <window.PartAnalyticsModal 
                    part={viewingAnalyticsPart}
                    onClose={() => setViewingAnalyticsPart(null)}
                    api_url={apiUrl}
                />
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
