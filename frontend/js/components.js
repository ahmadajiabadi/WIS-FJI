const { useState, useRef, useEffect } = React;

Chart.register({
    id: 'paretoLineStart',
    afterDraw: function(chart) {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const y1Scale = chart.scales.y1;
        if (!y1Scale) return;
        
        const lineMeta = chart.getDatasetMeta(1);
        if (!lineMeta || !lineMeta.data || lineMeta.data.length === 0) return;
        
        const firstPoint = lineMeta.data[0];
        const y0 = y1Scale.getPixelForValue(0);
        
        if (firstPoint.y >= y0 - 0.5) return;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        const ds = chart.data.datasets[1];
        ctx.strokeStyle = ds.borderColor || '#ef4444';
        ctx.lineWidth = ds.borderWidth || 2.5;
        ctx.stroke();
        ctx.restore();
    }
});

const DEFECT_GUIDANCE = [
    { code: 'A', name: 'Weld.Undercut (Memotong Part)', keywords: ['undercut', 'memotong'], feedbackText: 'Memotong' },
    { code: 'B', name: 'Weld.Over Lap (Tembus / Berlebih)', keywords: ['overlap', 'tembus', 'berlebih'], feedbackText: 'Berlebih' },
    { code: 'C', name: 'Weld.Pit/Blow Hole (Keropos)', keywords: ['pit', 'blow hole', 'keropos'], feedbackText: 'Keropos' },
    { code: 'D', name: 'Weld.Hole (Berlubang)', keywords: ['hole', 'berlubang', 'bolong'], feedbackText: 'Bolong' },
    { code: 'E', name: 'Weld.Burn-trough (Meleleh)', keywords: ['burn-through', 'burn-trough', 'meleleh'], feedbackText: 'Meleleh' },
    { code: 'F', name: 'Weld.Bead skip (Welding Putus)', keywords: ['bead skip', 'putus'], feedbackText: 'Putus' },
    { code: 'G', name: 'Weld.Bead witdh (Pergeseran Welding)', keywords: ['bead width', 'bead witdh', 'pergeseran'], feedbackText: 'Bergeser' },
    { code: 'H', name: 'Hole Tidak Ada', keywords: ['tidak ada', 'hole hilang', 'hole kosong'], feedbackText: 'Hole tidak ada' },
    { code: 'H', name: 'Hole Tidak Centre', keywords: ['tidak centre', 'tidak senter', 'tidak tengah'], feedbackText: 'Tidak senter' },
    { code: 'H', name: 'Hole Ada Sparter', keywords: ['sparter', 'percikan', 'terpercik'], feedbackText: 'Percikan' },
    { code: 'H', name: 'Hole Terlalu Besar', keywords: ['terlalu besar', 'besar'], feedbackText: 'Terlalu besar' },
    { code: 'H', name: 'Hole Oval', keywords: ['oval', 'hole oval', 'hall over'], feedbackText: 'Oval' },
    { code: 'I', name: 'Headrest Miring', keywords: ['miring', 'headrest miring'], feedbackText: 'Miring' },
    { code: 'I', name: 'Headrest Timplang', keywords: ['timplang', 'headrest timplang'], feedbackText: 'Timplang' },
    { code: 'I', name: 'Pitch Headrest NG', keywords: ['pitch', 'pitch ng', 'jarak headrest', 'headrest pitch', 'jarak ng', 'lubang headrest'], feedbackText: 'Pitch NG' },
    { code: 'J', name: 'Pemasangan Miring', keywords: ['pemasangan miring'], feedbackText: 'Miring' },
    { code: 'K', name: 'Bolt T/A', keywords: ['bolt', 'baut', 'baut tidak ada'], feedbackText: 'Baut T/A' },
    { code: 'L', name: 'Tidak Flat', keywords: ['tidak flat', 'bengkok', 'tidak rata'], feedbackText: 'Tidak flat' },
    { code: 'M', name: 'Spiner GAP dengan adjuster', keywords: ['spiner gap', 'gap adjuster', 'spiner get'], feedbackText: 'Spiner GAP' },
    { code: 'M', name: 'Spiner Kecil', keywords: ['spiner kecil'], feedbackText: 'Spiner kecil' },
    { code: 'M', name: 'Spring T/A', keywords: ['spring', 'per tidak ada'], feedbackText: 'Spring T/A' },
    { code: 'M', name: 'Silincer T/A', keywords: ['silincer'], feedbackText: 'Silincer T/A' },
    { code: 'M', name: 'Others', keywords: ['lainnya', 'others', 'baret', 'kotor'], feedbackText: 'Lainnya' }
];

const DEFECT_MAP = {
    'undercut': 'A', 'memotong': 'A',
    'overlap': 'B', 'tembus': 'B', 'berlebih': 'B',
    'pit': 'C', 'blow hole': 'C', 'keropos': 'C',
    'hole': 'D', 'berlubang': 'D', 'bolong': 'D',
    'burn-through': 'E', 'burn-trough': 'E', 'meleleh': 'E',
    'bead skip': 'F', 'putus': 'F',
    'bead width': 'G', 'bead witdh': 'G', 'pergeseran': 'G',
    'tidak ada': 'H', 'hole hilang': 'H', 'hole kosong': 'H',
    'tidak centre': 'H', 'tidak senter': 'H', 'tidak tengah': 'H',
    'sparter': 'H', 'percikan': 'H', 'terpercik': 'H',
    'terlalu besar': 'H', 'besar': 'H',
    'oval': 'H',
    'miring': 'I', 'headrest miring': 'I',
    'timplang': 'I', 'headrest timplang': 'I',
    'pitch': 'I', 'pitch ng': 'I',
    'pemasangan miring': 'J',
    'bolt': 'K', 'baut': 'K', 'baut tidak ada': 'K',
    'tidak flat': 'L', 'bengkok': 'L', 'tidak rata': 'L',
    'spiner gap': 'M', 'gap adjuster': 'M',
    'spiner kecil': 'M',
    'spring': 'M', 'per tidak ada': 'M',
    'silincer': 'M',
    'lainnya': 'M', 'others': 'M', 'baret': 'M', 'kotor': 'M'
};

window.DEFECT_GUIDANCE = DEFECT_GUIDANCE;
window.DEFECT_MAP = DEFECT_MAP;

// Load voice guides from server & update window.DEFECT_GUIDANCE dynamically
async function loadVoiceGuidesFromServer(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/settings/voice-guides`);
        const result = await res.json();
        if (result.status === 'success' && result.data.length > 0) {
            const dynamicGuides = result.data.map(g => ({
                code: g.code,
                name: g.name,
                keywords: g.keywords.split(',').map(k => k.trim()).filter(Boolean),
                feedbackText: g.feedback_text || ''
            }));
            window.DEFECT_GUIDANCE = dynamicGuides;

            // Also rebuild DEFECT_MAP
            const newMap = {};
            dynamicGuides.forEach(g => {
                g.keywords.forEach(k => {
                    newMap[k.toLowerCase()] = g.code;
                });
            });
            window.DEFECT_MAP = newMap;
        }
    } catch (e) {
        console.warn('Gagal load voice guides dari server, pakai default:', e.message);
    }
}
window.loadVoiceGuidesFromServer = loadVoiceGuidesFromServer;

// Default voice commands fallback
const DEFAULT_VOICE_COMMANDS = {
    ok: [
        { keyword: 'ok', feedback_text: 'Okee' }, { keyword: 'oke', feedback_text: 'Okee' },
        { keyword: 'bagus', feedback_text: 'Okee' }, { keyword: 'frame ok', feedback_text: 'Okee' },
        { keyword: 'frame oke', feedback_text: 'Okee' }, { keyword: 'frame bagus', feedback_text: 'Okee' }
    ],
    ng_frame: [
        { keyword: 'cacat', feedback_text: 'Cacat' }, { keyword: 'reject', feedback_text: 'Cacat' },
        { keyword: 'rijek', feedback_text: 'Cacat' }, { keyword: 'gagal', feedback_text: 'Cacat' },
        { keyword: 'defect', feedback_text: 'Cacat' }, { keyword: 'ng', feedback_text: 'Cacat' },
        { keyword: 'enji', feedback_text: 'Cacat' }, { keyword: 'nji', feedback_text: 'Cacat' },
        { keyword: 'anji', feedback_text: 'Cacat' }
    ],
    scrap: [
        { keyword: 'buang', feedback_text: 'Scrap' }, { keyword: 'scrap', feedback_text: 'Scrap' },
        { keyword: 'dibuang', feedback_text: 'Scrap' }
    ],
    undo: [
        { keyword: 'batal', feedback_text: 'Dihapus' }, { keyword: 'hapus', feedback_text: 'Dihapus' },
        { keyword: 'undo', feedback_text: 'Dihapus' }
    ],
    mute: [
        { keyword: 'jangan dengarkan', feedback_text: 'Mikrofon dibisukan' },
        { keyword: 'jangan dengerin', feedback_text: 'Mikrofon dibisukan' },
        { keyword: 'diam', feedback_text: 'Mikrofon dibisukan' }
    ],
    unmute: [
        { keyword: 'lanjut dengarkan', feedback_text: 'Mendengarkan kembali' },
        { keyword: 'lanjut dengerin', feedback_text: 'Mendengarkan kembali' },
        { keyword: 'lanjut', feedback_text: 'Mendengarkan kembali' }
    ]
};
window.VOICE_COMMANDS = DEFAULT_VOICE_COMMANDS;

// Load voice commands from server & update window.VOICE_COMMANDS
async function loadVoiceCommandsFromServer(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/settings/voice-commands`);
        const result = await res.json();
        if (result.status === 'success') {
            const grouped = { ok: [], ng_frame: [], finish: [], scrap: [], undo: [], mute: [], unmute: [], batal_cycle: [] };
            result.data.forEach(cmd => {
                if (grouped[cmd.command_type]) {
                    grouped[cmd.command_type].push({ keyword: cmd.keyword, feedback_text: cmd.feedback_text || '' });
                }
            });
            window.VOICE_COMMANDS = grouped;
        }
    } catch (e) {
        console.warn('Gagal load voice commands dari server, pakai default:', e.message);
    }
}
window.loadVoiceCommandsFromServer = loadVoiceCommandsFromServer;

// Helper: check if text matches any keyword in a command category
// Short keywords (1-2 chars) use word boundary to avoid false matches (e.g. "ng" in "bengkok")
// Long keywords (3+ chars) use substring match for flexibility
window.matchesVoiceCommand = (text, commandType) => {
    const commands = window.VOICE_COMMANDS?.[commandType] || [];
    return commands.some(cmd => {
        const lower = cmd.keyword.toLowerCase();
        if (lower.length <= 2) {
            const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Word boundary at start only, so "ok" matches "oke", "okay" etc.
            return new RegExp('(?:^|\\s)' + escaped + '(?!\\w)', 'i').test(text);
        }
        return text.includes(lower);
    });
};

// Find matched voice command and return its feedback_text
window.findVoiceCommand = (text, commandType) => {
    const commands = window.VOICE_COMMANDS?.[commandType] || [];
    for (const cmd of commands) {
        const lower = cmd.keyword.toLowerCase();
        let match = false;
        if (lower.length <= 2) {
            const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            match = new RegExp('(?:^|\\s)' + escaped + '(?!\\w)', 'i').test(text);
        } else {
            match = text.includes(lower);
        }
        if (match) return cmd;
    }
    return null;
};

// Pareto Chart Component using Chart.js
function ParetoChart({ data }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (chartRef.current) chartRef.current.destroy();
        const ctx = canvasRef.current.getContext('2d');

        const labels = data.map(d => d.problem);
        const values = data.map(d => d.total_qty);
        const total = values.reduce((a, b) => a + b, 0);

        let cumSum = 0;
        const cumPercentages = values.map(v => {
            cumSum += v;
            return (cumSum / total) * 100;
        });

        chartRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Quantity NG',
                        data: values,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderRadius: 8,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Persentase Kumulatif',
                        data: cumPercentages,
                        type: 'line',
                        borderColor: '#ef4444',
                        backgroundColor: '#ef4444',
                        borderWidth: 3,
                        pointRadius: 4,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Defect Qty' } },
                    y1: { beginAtZero: true, max: 100, position: 'right', grid: { display: false }, title: { display: true, text: 'Kumulatif %' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }, [data]);

    return <canvas ref={canvasRef}></canvas>;
}

// ========== ABNORMALITY CATEGORIES (4M1E) ==========

// Load abnormality categories from server
async function loadAbnormalityCategories(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/settings/abnormality-categories`);
        const result = await res.json();
        if (result.status === 'success') {
            window.ABNORMALITY_CATEGORIES = result.grouped;
            window.ABNORMALITY_CATEGORIES_FLAT = result.data;
        }
    } catch (e) {
        console.warn('Gagal load abnormality categories:', e.message);
    }
}
window.loadAbnormalityCategories = loadAbnormalityCategories;

// Load inspector names from server & store in window.INSPECTOR_NAMES
async function loadInspectorNames(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/settings/inspectors`);
        const result = await res.json();
        if (result.status === 'success') {
            window.INSPECTOR_NAMES = result.data.filter(i => i.active).map(i => i.name);
        }
    } catch (e) {
        console.warn('Gagal load inspector names:', e.message);
    }
}
window.loadInspectorNames = loadInspectorNames;

// Load line positions from server & store in window.LINE_POSITIONS
async function loadLinePositions(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/settings/line-positions`);
        const result = await res.json();
        if (result.status === 'success') {
            window.LINE_POSITIONS = result.data.filter(p => p.active).map(p => p.name);
        }
    } catch (e) {
        console.warn('Gagal load line positions:', e.message);
    }
}
window.loadLinePositions = loadLinePositions;

const DEFAULT_ABNORMALITY_CATEGORIES = {
    Man: [],
    Mesin: [],
    Material: [],
    Metode: [],
    Environment: []
};
if (!window.ABNORMALITY_CATEGORIES) {
    window.ABNORMALITY_CATEGORIES = DEFAULT_ABNORMALITY_CATEGORIES;
    window.ABNORMALITY_CATEGORIES_FLAT = [];
}

// Global Export to use in other scripts if needed
window.ParetoChart = ParetoChart;

// Sidebar Component
function Sidebar({ activeTab, setActiveTab, draftsCount, currentUser }) {
    const [isCollapsed, setIsCollapsed] = React.useState(true);

    const allMenus = [
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

    const userPerms = (currentUser && currentUser.permissions) || [];
    const menus = allMenus.filter(m => userPerms.includes(m.id));

    return (
        <div className={`${isCollapsed ? 'md:w-20' : 'md:w-64'} w-full h-auto bg-slate-900 flex flex-row md:flex-col md:h-screen shadow-2xl z-50 transition-all duration-300 relative`}>
            <div className="p-4 md:p-6 flex items-center justify-between overflow-hidden">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                        <img src="logo.png" className="w-full h-full object-contain p-1" alt="Logo" />
                    </div>
                    {!isCollapsed && <h1 className="text-white font-black tracking-tighter text-lg uppercase whitespace-nowrap animate-in fade-in duration-300">WIS <span className="text-blue-500">FJI</span></h1>}
                </div>
            </div>

            <nav className="flex-1 px-2 md:px-3 flex flex-row md:flex-col items-center md:items-stretch gap-1 md:gap-2 md:mt-4">
                {menus.map(menu => (
                    <button
                        key={menu.id}
                        onClick={() => setActiveTab(menu.id)}
                        className={`w-full flex items-center p-4 rounded-2xl transition-all group relative ${
                            activeTab === menu.id 
                            ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        } ${isCollapsed ? 'justify-center' : ''}`}
                    >
                        <i className={`fas ${menu.icon} text-base md:text-lg shrink-0 ${isCollapsed ? '' : 'lg:w-6'}`}></i>
                        {!isCollapsed && <span className="ml-3 font-bold text-sm whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">{menu.label}</span>}
                        
                        {menu.id === 'scan' && draftsCount > 0 && (
                            <span className={`${isCollapsed ? 'absolute top-2 right-2' : 'ml-auto'} bg-red-500 text-white text-[9px] md:text-[10px] w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-red-500/20`}>
                                {draftsCount}
                            </span>
                        )}
                        
                        {isCollapsed && (
                            <div className="absolute left-full ml-4 px-3 py-1 bg-slate-800 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] hidden md:block">
                                {menu.label}
                            </div>
                        )}
                    </button>
                ))}
            </nav>

            <div className="p-4 mt-auto hidden md:block">
                {currentUser && (
                    <div className={'mb-4 animate-in fade-in duration-300 ' + (isCollapsed ? '' : 'bg-slate-800/50 rounded-2xl p-4 border border-white/5')}>
                        {!isCollapsed && (
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                                    <span className="text-xs font-black text-blue-400">{currentUser.full_name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{currentUser.role}</div>
                                </div>
                            </div>
                        )}
                        <button onClick={() => {
                            localStorage.removeItem('qc_token');
                            localStorage.removeItem('qc_user');
                            window.location.reload();
                        }}
                            className={'w-full bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all tracking-wider ' + (isCollapsed ? 'py-3' : 'py-2')}>
                            <i className="fas fa-sign-out-alt"></i>
                            {!isCollapsed && 'Logout'}
                        </button>
                    </div>
                )}
                
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all flex items-center justify-center"
                >
                    <i className={`fas ${isCollapsed ? 'fa-angle-double-right' : 'fa-angle-double-left'}`}></i>
                </button>
            </div>
        </div>
    );
}
window.Sidebar = Sidebar;

// Guidance Modal Component
function GuidanceModal({ onClose }) {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight">KODE DEFECT</h2>
                        <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mt-1">Panduan Pengisian NG</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
                    {DEFECT_GUIDANCE.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all group">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-lg group-hover:scale-110 transition-transform">
                                {item.code}
                            </div>
                            <span className="text-xs font-bold text-slate-700 leading-tight">{item.name}</span>
                        </div>
                    ))}
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-sm font-black hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/20">
                        MENGERTI
                    </button>
                </div>
            </div>
        </div>
    );
}
window.GuidanceModal = GuidanceModal;

// Global Part Analytics Modal Component
function PartAnalyticsModal({ part, onClose, api_url }) {
    if (!part) return null;

    const [partDetails, setPartDetails] = React.useState(part);
    const [partAnalyticsData, setPartAnalyticsData] = React.useState({ points: [], history: [], details: [] });
    const [partPoints, setPartPoints] = React.useState([]);
    const [isAnalyticsLoading, setIsAnalyticsLoading] = React.useState(false);
    const [historySearch, setHistorySearch] = React.useState('');
    const [selectedPoint, setSelectedPoint] = React.useState(null); // { check_no, problems: [{problem, defect_code, total_qty}] }
    const [selectedLines, setSelectedLines] = React.useState(part.initialLines || []);
    const [availableLines, setAvailableLines] = React.useState([]);
    const [filterModel, setFilterModel] = React.useState(part.initialModel || null);
    const [availableModels, setAvailableModels] = React.useState([]);
    const [effHourly, setEffHourly] = React.useState(null);
    const [effBySheets, setEffBySheets] = React.useState(null);
    const [effLineStops, setEffLineStops] = React.useState([]);
    const [showEffDetail, setShowEffDetail] = React.useState(false);
    const [expandedSessionId, setExpandedSessionId] = React.useState(null);
    const [expandedSide, setExpandedSide] = React.useState('all');
    const [sessionHourly, setSessionHourly] = React.useState({});
    const [filterShift, setFilterShift] = React.useState(null);
    const [availableShifts, setAvailableShifts] = React.useState([]);
    const [stoplineTarget, setStoplineTarget] = React.useState(null);
    const [stoplineForm, setStoplineForm] = React.useState({ lossStart: '', lossEnd: '', category4m: '', stopReason: '', correctiveAction: '', notes: '' });
    const [stoplineAbnormalities, setStoplineAbnormalities] = React.useState([]);
    const [stoplineAbnCategories, setStoplineAbnCategories] = React.useState([]);
    const [stoplineSelectedAbnormality, setStoplineSelectedAbnormality] = React.useState(null);
    const [stoplineSaving, setStoplineSaving] = React.useState(false);
    
    // Date Filtering (default 3 Months, or single day from Asakai)
    const [dateRange, setDateRange] = React.useState({
        start: part.initialDate || (() => {
            const d = new Date();
            d.setMonth(d.getMonth() - 2);
            d.setDate(1);
            return d.toISOString().split('T')[0];
        })(),
        end: part.initialDate || new Date().toISOString().split('T')[0]
    });
    const [activeFilter, setActiveFilter] = React.useState(part.initialDate ? 'custom' : '3 Bulan');

    const chartRefs = React.useRef({ paretoProblem: null, paretoPoint: null });
    const sessionChartRef = React.useRef(null);
    const sessionChartInstance = React.useRef(null);
    const [chartMaxY, setChartMaxY] = React.useState('100');
    const canvasRefs = { 
        paretoProblem: React.useRef(null), 
        paretoPoint: React.useRef(null) 
    };
    const heatmapRef = React.useRef(null);
    const [markerSize, setMarkerSize] = React.useState(32);

    // Resolve full part details (image_path, part_name, etc.) if they are missing
    React.useEffect(() => {
        if (part.image_path && part.part_name) {
            setPartDetails(part);
        } else {
            fetch(`${api_url}/api/master/parts`)
                .then(res => res.json())
                .then(res => {
                    if (res.status === 'success') {
                        const targetModel = part.initialModel || part.model;
                        let found = targetModel ? res.data.find(p => p.part_number === part.part_number && p.model === targetModel) : null;
                        if (!found) found = res.data.find(p => p.part_number === part.part_number);
                        if (found) {
                            setPartDetails(found);
                        }
                    }
                })
                .catch(err => console.error("Error fetching master parts details:", err));
        }
        
        fetchMasterPoints(part.part_number);
        fetchPartAnalytics(part.part_number, dateRange.start, dateRange.end, part.initialLines, filterModel, filterShift);

        return () => {
            if (chartRefs.current.paretoProblem) chartRefs.current.paretoProblem.destroy();
            if (chartRefs.current.paretoPoint) chartRefs.current.paretoPoint.destroy();
        };
    }, [part, api_url]);

    React.useEffect(() => {
        const el = heatmapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                setMarkerSize(Math.max(16, Math.min(64, Math.round(w * 0.045))));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [partDetails, partPoints]);

    // Render session duration bar chart when expanded session data loads
    React.useEffect(() => {
        if (sessionChartInstance.current) {
            sessionChartInstance.current.destroy();
            sessionChartInstance.current = null;
        }
        if (!expandedSessionId) return;
        const key = `${expandedSessionId}|${expandedSide}`;
        const hourlyData = sessionHourly[key];
        if (!hourlyData?.items || hourlyData.items.length === 0) return;
        const canvas = sessionChartRef.current;
        if (!canvas) return;

        const items = hourlyData.items;
        const taktLine = items[0]?.takt_time_sec || 60;
        const labels = items.map((_, i) => i + 1);
        const durations = items.map(it => it.duration_sec);
        const colors = items.map(it => it.judgment === 'OK' ? '#22c55e' : '#ef4444');

        sessionChartInstance.current = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Durasi (dtk)',
                    data: durations,
                    backgroundColor: colors,
                    borderRadius: 3,
                    barPercentage: 0.7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 14 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => `Check #${ctx[0].label}`,
                            label: (ctx) => {
                                const item = items[ctx.dataIndex];
                                return [
                                    `Durasi: ${item.duration_sec}s`,
                                    `Takt: ${item.takt_time_sec}s`,
                                    `Hasil: ${item.judgment}`,
                                    `Jam: ${item.time}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Check Ke-', font: { size: 10 } },
                        ticks: { font: { size: 9 } }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Durasi (detik)', font: { size: 10 } },
                        ticks: { font: { size: 9 } },
                        max: chartMaxY && !isNaN(chartMaxY) ? Number(chartMaxY) : undefined
                    }
                }
            },
            plugins: [{
                id: 'hourlyGroup',
                beforeDraw(chart) {
                    const ctx = chart.ctx;
                    const ca = chart.chartArea;
                    const meta = chart.getDatasetMeta(0);
                    if (!meta?.data?.length || !items.length) return;
                    const groups = [];
                    let cur = null, si = 0;
                    items.forEach((it, i) => {
                        const h = it.time ? it.time.substring(0, 2) : '??';
                        if (h !== cur) {
                            if (cur !== null) groups.push({ hour: cur, start: si, end: i - 1 });
                            cur = h; si = i;
                        }
                    });
                    if (cur !== null) groups.push({ hour: cur, start: si, end: items.length - 1 });
                    ctx.save();
                    groups.forEach((g, gi) => {
                        const fx = meta.data[g.start].x, lx = meta.data[g.end].x;
                        const gap = meta.data.length > 1 ? (meta.data[1].x - meta.data[0].x) : 20;
                        const hg = gap / 2;
                        ctx.fillStyle = gi % 2 === 0 ? 'rgba(0,20,40,0.035)' : 'rgba(0,0,0,0)';
                        ctx.fillRect(fx - hg, ca.top, lx - fx + gap, ca.bottom - ca.top);
                        if (gi > 0) {
                            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(fx - hg, ca.top);
                            ctx.lineTo(fx - hg, ca.bottom);
                            ctx.stroke();
                        }
                        const next = String(Number(g.hour) + 1).padStart(2, '0');
                        ctx.fillStyle = '#94a3b8';
                        ctx.font = '8px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(g.hour + ':00-' + next + ':00', (fx + lx) / 2, ca.top - 1);
                    });
                    ctx.restore();
                }
            }, {
                id: 'taktLine',
                afterDraw(chart) {
                    const yScale = chart.scales.y;
                    const y = yScale.getPixelForValue(taktLine);
                    if (y === undefined) return;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(chart.chartArea.left, y);
                    ctx.lineTo(chart.chartArea.right, y);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`Takt ${taktLine}s`, chart.chartArea.right - 4, y - 4);
                    ctx.restore();
                }
            }]
        });

        return () => {
            if (sessionChartInstance.current) {
                sessionChartInstance.current.destroy();
                sessionChartInstance.current = null;
            }
        };
    }, [expandedSessionId, sessionHourly, chartMaxY, expandedSide]);

    const fetchMasterPoints = async (partNum, side) => {
        try {
            let url = `${api_url}/api/master/points/${encodeURIComponent(partNum)}`;
            if (side) url += `?side=${side}`;
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') setPartPoints(result.data);
        } catch (error) {
            console.error("Fetch points error:", error);
        }
    };

    const fetchPartAnalytics = async (partNum, start = dateRange.start, end = dateRange.end, lineList, modelVal, shiftVal) => {
        setIsAnalyticsLoading(true);

        // Declare outside try blocks so they're accessible in the hourly/fetchEfficiencyBySheets block
        let effectiveLines, effectiveModel, effectiveShift;
        
        try {
            const url = new URL(`${api_url}/api/master/analytics/${encodeURIComponent(partNum)}`);
            if (start) url.searchParams.append('startDate', start);
            if (end) url.searchParams.append('endDate', end);
            
            effectiveLines = lineList !== undefined ? lineList : selectedLines;
            if (effectiveLines && effectiveLines.length > 0) {
                if (availableLines.length === 0 || effectiveLines.length < availableLines.length) {
                    url.searchParams.append('lines', effectiveLines.join(','));
                }
            }
            
            effectiveModel = modelVal !== undefined ? modelVal : filterModel;
            if (effectiveModel) url.searchParams.append('model', effectiveModel);
            
            effectiveShift = shiftVal !== undefined ? shiftVal : filterShift;
            if (effectiveShift) url.searchParams.append('shift', effectiveShift);

            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') {
                setPartAnalyticsData(result);
                if (result.availableLines) {
                    setAvailableLines(result.availableLines);
                    if (selectedLines.length === 0 && result.availableLines.length > 0) {
                        setSelectedLines(result.availableLines);
                    }
                }
                if (result.availableModels) {
                    setAvailableModels(result.availableModels);
                }
                if (result.availableShifts) {
                    setAvailableShifts(result.availableShifts);
                }
                renderCharts(result);
            }
        } catch (error) {
            console.error("Fetch analytics error:", error);
        }

        // Fetch hourly efficiency and line stops
        try {
            const effUrl = new URL(`${api_url}/api/efficiency/hourly`);
            effUrl.searchParams.append('date', end);
            effUrl.searchParams.append('partNumber', partNum);
            if (lineList && lineList.length > 0) effUrl.searchParams.append('linePos', lineList.join(','));
            const effRes = await fetch(effUrl);
            const effResult = await effRes.json();
            if (effResult.status === 'success') {
                setEffHourly(effResult);
            }

            const lsUrl = new URL(`${api_url}/api/linestops`);
            lsUrl.searchParams.append('date', end);
            if (partNum) lsUrl.searchParams.append('partNumber', partNum);
            const lsRes = await fetch(lsUrl);
            const lsResult = await lsRes.json();
            if (lsResult.status === 'success') setEffLineStops(lsResult.data);

            // Fetch session-based efficiency from check_sheets (for the card)
            fetchEfficiencyBySheets(partNum, start, end, effectiveLines, effectiveModel, effectiveShift);
        } catch (e) {
            console.error("Fetch efficiency error:", e);
        } finally {
            setIsAnalyticsLoading(false);
        }
    };

    const fetchEfficiencyBySheets = async (partNum, start, end, lineList, mdl, shiftVal) => {
        try {
            const url = new URL(`${api_url}/api/efficiency/by-sheets`);
            url.searchParams.append('partNumber', partNum);
            if (start) url.searchParams.append('startDate', start);
            if (end) url.searchParams.append('endDate', end);
            if (lineList && lineList.length > 0) url.searchParams.append('lines', lineList.join(','));
            if (mdl) url.searchParams.append('model', mdl);
            if (shiftVal) url.searchParams.append('shift', shiftVal);

            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') setEffBySheets(result.data);
        } catch (e) {
            console.error("Fetch by-sheets efficiency error:", e);
        }
    };

    const fetchSessionHourly = async (checkSheetId, dateStr, partNum, sideStr) => {
        try {
            const url = new URL(`${api_url}/api/efficiency/hourly`);
            url.searchParams.append('checkSheetId', checkSheetId);
            url.searchParams.append('date', dateStr);
            if (partNum) url.searchParams.append('partNumber', partNum);
            if (sideStr) url.searchParams.append('side', sideStr);
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') {
                const key = `${checkSheetId}|${sideStr || 'all'}`;
                setSessionHourly(prev => ({ ...prev, [key]: result }));
            }
        } catch (e) {
            console.error("Fetch session hourly error:", e);
        }
    };

    const handleSessionClick = (s) => {
        if (expandedSessionId === s.id) {
            setExpandedSessionId(null);
        } else {
            setExpandedSessionId(s.id);
            const isDual = !!partDetails?.paired_part_number;
            const side = isDual ? 'KIRI' : 'all';
            setExpandedSide(side);
            if (isDual) {
                if (!sessionHourly[`${s.id}|KIRI`]) {
                    fetchSessionHourly(s.id, s.date, partDetails.part_number, 'KIRI');
                }
                if (!sessionHourly[`${s.id}|KANAN`]) {
                    fetchSessionHourly(s.id, s.date, partDetails.part_number, 'KANAN');
                }
            } else {
                const key = `${s.id}|all`;
                if (!sessionHourly[key]) {
                    fetchSessionHourly(s.id, s.date, partDetails.part_number, null);
                }
            }
        }
    };

    const handleSideChange = (s, side) => {
        setExpandedSide(side);
        const key = `${s.id}|${side}`;
        if (!sessionHourly[key]) {
            fetchSessionHourly(s.id, s.date, partDetails.part_number, side);
        }
    };

    const openStoplineModal = async (s) => {
        setStoplineTarget(s);
        setStoplineForm({
            lossStart: s.timestart || '',
            lossEnd: new Date().toTimeString().substring(0, 5),
            category4m: '',
            stopReason: '',
            correctiveAction: '',
            notes: ''
        });
        setStoplineSelectedAbnormality(null);
        setStoplineAbnormalities([]);
        fetch(`${api_url}/api/settings/abnormality-categories`).then(r => r.json()).then(res => {
            if (res.status === 'success') setStoplineAbnCategories(res.data || []);
        }).catch(() => {});
        try {
            const url = new URL(`${api_url}/api/abnormality`);
            url.searchParams.append('date', s.date);
            if (s.line_pos) url.searchParams.append('linePos', s.line_pos);
            if (partDetails.part_number) url.searchParams.append('partNumber', partDetails.part_number);
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') setStoplineAbnormalities(result.data || []);
        } catch (e) {
            console.error('Fetch abnormalities error:', e);
        }
    };

    const closeStoplineModal = () => {
        setStoplineTarget(null);
    };

    const handleStoplineSave = async () => {
        const s = stoplineTarget;
        if (!s || !stoplineForm.lossStart || !stoplineForm.lossEnd) {
            alert('Loss Start dan Loss End harus diisi!');
            return;
        }
        setStoplineSaving(true);
        try {
            const body = {
                part_number: partDetails.part_number,
                model: partDetails.model || '',
                line_pos: s.line_pos,
                date: s.date,
                shift: s.shift,
                loss_start: s.date + ' ' + stoplineForm.lossStart + ':00',
                loss_end: s.date + ' ' + stoplineForm.lossEnd + ':00',
                category_4m: stoplineForm.category4m,
                stop_reason: stoplineForm.stopReason,
                corrective_action: stoplineForm.correctiveAction,
                notes: stoplineForm.notes,
                linked_abnormality_id: stoplineSelectedAbnormality || undefined
            };
            const res = await fetch(api_url + '/api/linestops/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.status === 'success') {
                setStoplineTarget(null);
                fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines, filterModel, filterShift);
            } else {
                alert('Error: ' + (result.message || 'Gagal simpan'));
            }
        } catch (e) {
            console.error('Save stopline error:', e);
            alert('Gagal menyimpan stopline');
        } finally {
            setStoplineSaving(false);
        }
    };

    const getFullDefectName = (code) => {
        const guidance = window.DEFECT_GUIDANCE?.find(g => g.code === code);
        return guidance ? `${code} - ${guidance.name}` : code;
    };

    const renderCharts = (data) => {
        setTimeout(() => {
            // Helper to compute cumulative percentage
            const getParetoData = (items, labelKey, qtyKey) => {
                const sorted = [...(items || [])]
                    .map(item => ({ ...item, qty: Number(item[qtyKey] || 0) }))
                    .filter(item => item.qty > 0)
                    .sort((a, b) => b.qty - a.qty);
                
                const total = sorted.reduce((sum, item) => sum + item.qty, 0);
                
                let cumulativeSum = 0;
                const labels = [];
                const qtyValues = [];
                const pctValues = [];
                
                sorted.forEach(item => {
                    labels.push(item[labelKey]);
                    qtyValues.push(item.qty);
                    
                    cumulativeSum += item.qty;
                    const cumulativePercentage = total > 0 ? (cumulativeSum / total) * 100 : 0;
                    pctValues.push(Number(cumulativePercentage.toFixed(1)));
                });
                
                return { labels, qtyValues, pctValues, total };
            };

            // 1. Pareto Problem Chart
            if (chartRefs.current.paretoProblem) chartRefs.current.paretoProblem.destroy();
            if (canvasRefs.paretoProblem.current) {
                const { labels, qtyValues, pctValues } = getParetoData(data.problems, 'problem', 'total_qty');
                
                chartRefs.current.paretoProblem = new Chart(canvasRefs.paretoProblem.current, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Defect Qty',
                                data: qtyValues,
                                backgroundColor: '#f59e0b', // Amber/Orange
                                borderRadius: 6,
                                yAxisID: 'y',
                                order: 1
                            },
                            {
                                type: 'line',
                                label: 'Kumulatif %',
                                data: pctValues,
                                borderColor: '#ef4444', // Red
                                backgroundColor: '#ef4444',
                                borderWidth: 2.5,
                                tension: 0.1,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                pointBackgroundColor: '#ef4444',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                fill: false,
                                yAxisID: 'y1',
                                order: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Jumlah Defect (Qty)',
                                    font: { size: 9, weight: 'bold' }
                                },
                                grid: {
                                    drawOnChartArea: true,
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                beginAtZero: true,
                                min: 0,
                                max: 100,
                                title: {
                                    display: true,
                                    text: 'Persentase Kumulatif (%)',
                                    font: { size: 9, weight: 'bold' }
                                },
                                ticks: {
                                    callback: v => v + '%'
                                },
                                grid: {
                                    drawOnChartArea: false
                                }
                            }
                        },
                        plugins: {
                            datalabels: {
                                display: false
                            },
                            legend: {
                                position: 'top',
                                labels: { boxWidth: 12, font: { size: 9, weight: 'bold' } }
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        }
                    }
                });
            }

            // 2. Pareto Point Chart
            if (chartRefs.current.paretoPoint) chartRefs.current.paretoPoint.destroy();
            if (canvasRefs.paretoPoint.current) {
                const { labels, qtyValues, pctValues } = getParetoData(data.points, 'check_no', 'total_qty');
                const pointLabels = labels.map(c => `#${c}`);
                
                chartRefs.current.paretoPoint = new Chart(canvasRefs.paretoPoint.current, {
                    type: 'bar',
                    data: {
                        labels: pointLabels,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Defect Qty',
                                data: qtyValues,
                                backgroundColor: '#3b82f6', // Blue
                                borderRadius: 6,
                                yAxisID: 'y',
                                order: 1
                            },
                            {
                                type: 'line',
                                label: 'Kumulatif %',
                                data: pctValues,
                                borderColor: '#10b981', // Emerald
                                backgroundColor: '#10b981',
                                borderWidth: 2.5,
                                tension: 0.1,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                pointBackgroundColor: '#ef4444',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                fill: false,
                                yAxisID: 'y1',
                                order: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                ticks: {
                                    autoSkip: false,
                                    maxRotation: 45,
                                    minRotation: 45,
                                    font: {
                                        size: 8,
                                        weight: 'bold'
                                    }
                                },
                                grid: {
                                    display: false
                                }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Jumlah Defect (Qty)',
                                    font: { size: 9, weight: 'bold' }
                                },
                                grid: {
                                    drawOnChartArea: true,
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                beginAtZero: true,
                                min: 0,
                                max: 100,
                                title: {
                                    display: true,
                                    text: 'Persentase Kumulatif (%)',
                                    font: { size: 9, weight: 'bold' }
                                },
                                ticks: {
                                    callback: v => v + '%'
                                },
                                grid: {
                                    drawOnChartArea: false
                                }
                            }
                        },
                        plugins: {
                            datalabels: {
                                display: false
                            },
                            legend: {
                                position: 'top',
                                labels: { boxWidth: 12, font: { size: 9, weight: 'bold' } }
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        }
                    }
                });
            }
        }, 100);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8 overflow-hidden animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-[98vw] max-h-[90vh] overflow-y-auto shadow-2xl border border-white/20 custom-scrollbar animate-in zoom-in-95 duration-300 flex flex-col">
                
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-100 px-8 py-5 flex justify-between items-center z-50 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-lg shadow-inner">
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-lg md:text-xl tracking-tight">Analytics: {partDetails.part_number}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                {partDetails.part_name || 'MASTER PART'} • {filterModel || (availableModels.length > 0 ? 'All Models' : (partDetails.model || '-'))}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-inner">
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Date Filter & Control Bar + Line Filter */}
                <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                    <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
                        <div className="flex items-center gap-2 px-3 border-r border-slate-200">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Filter</span>
                            <input type="date" value={dateRange.start} onChange={(e) => { const v = e.target.value; setDateRange(prev => ({...prev, start: v})); setActiveFilter('custom'); fetchPartAnalytics(partDetails.part_number, v, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, filterModel, filterShift); }} className="bg-transparent text-[10px] font-bold outline-none focus:text-blue-600 border-0 p-0" />
                            <span className="text-slate-300">-</span>
                            <input type="date" value={dateRange.end} onChange={(e) => { const v = e.target.value; setDateRange(prev => ({...prev, end: v})); setActiveFilter('custom'); fetchPartAnalytics(partDetails.part_number, dateRange.start, v, selectedLines.length > 0 ? selectedLines : undefined, filterModel, filterShift); }} className="bg-transparent text-[10px] font-bold outline-none focus:text-blue-600 border-0 p-0" />
                        </div>
                        <div className="flex gap-1">
                            {[
                                {label: 'Bulan Ini', start: (() => { const d = new Date(); d.setDate(1); return d; })()},
                                {label: '3 Bulan', start: (() => { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d; })()},
                                {label: '6 Bulan', start: (() => { const d = new Date(); d.setMonth(d.getMonth() - 5); d.setDate(1); return d; })()},
                                {label: 'Semua', start: null},
                            ].map(btn => (
                                <button 
                                    key={btn.label}
                                    onClick={() => {
                                        const startStr = btn.start ? btn.start.toISOString().split('T')[0] : '';
                                        const endStr = btn.start ? new Date().toISOString().split('T')[0] : '';
                                        setDateRange({ start: startStr, end: endStr });
                                        setActiveFilter(btn.label);
                                        fetchPartAnalytics(partDetails.part_number, startStr, endStr, selectedLines.length > 0 ? selectedLines : undefined, filterModel, filterShift);
                                    }}
                                    className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${activeFilter === btn.label ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, filterModel, filterShift)}
                            className="bg-slate-800 text-white px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 shadow-sm ml-1"
                        >
                            <i className="fas fa-sync-alt"></i>
                        </button>

                        {availableLines.length > 0 && (
                            <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-slate-200">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">Line:</span>
                                {availableLines.map(l => (
                                    <button
                                        key={l}
                                        onClick={() => {
                                            const next = selectedLines.includes(l)
                                                ? selectedLines.filter(x => x !== l)
                                                : [...selectedLines, l];
                                            setSelectedLines(next);
                                            fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, next.length > 0 ? next : undefined, filterModel, filterShift);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                            selectedLines.includes(l)
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {l}
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        setSelectedLines([...availableLines]);
                                        fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, undefined, filterModel, filterShift);
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                        selectedLines.length === availableLines.length
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedLines([]);
                                        fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, undefined, filterModel, filterShift);
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                        selectedLines.length === 0
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    Clear
                                </button>
                            </div>
                        )}

                        {availableModels.length > 1 && (
                            <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-slate-200">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">Model:</span>
                                {availableModels.map(m => (
                                    <button
                                        key={m}
                                        onClick={() => {
                                            setFilterModel(m);
                                            fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, m, filterShift);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                            filterModel === m
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        setFilterModel(null);
                                        fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, null, filterShift);
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                        !filterModel
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    All
                                </button>
                            </div>
                        )}

                        {availableShifts.length > 0 && (
                            <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-slate-200">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">Shift:</span>
                                {availableShifts.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            setFilterShift(s);
                                            fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, filterModel, s);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                            filterShift === s
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        setFilterShift(null);
                                        fetchPartAnalytics(partDetails.part_number, dateRange.start, dateRange.end, selectedLines.length > 0 ? selectedLines : undefined, filterModel, null);
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all ${
                                        !filterShift
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    All
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
                    {isAnalyticsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500 font-bold animate-pulse">Menghimpun Analitik Part...</p>
                        </div>
                    ) : (
                        <React.Fragment>
                            {/* KPI Cards */}
                            {(() => {
                                const s = partAnalyticsData.summary || {};
                                const prod = Number(s.total_prod || 0);
                                const ngQty = Number(s.total_ng_qty || 0);
                                const ngPoint = Number(s.total_ng_point || 0);
                                const maxPts = Number(s.max_points || 0);

                                // Frame OK Ratio = ((prod - ngQty) / prod) * 100
                                const frameOK = prod > 0 ? (((prod - ngQty) / prod) * 100).toFixed(2) : null;
                                // Point OK Ratio = ((maxPts - ngPoint) / maxPts) * 100
                                const pointOK = maxPts > 0 ? (((maxPts - ngPoint) / maxPts) * 100).toFixed(2) : (prod > 0 ? frameOK : null);

                                const frameOKNum = frameOK !== null ? Number(frameOK) : null;
                                const pointOKNum = pointOK !== null ? Number(pointOK) : null;

                                return (
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                        {/* 1. Total Produksi */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-boxes"></i></div>
                                            <div className="min-w-0">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Produksi</div>
                                                <div className="text-lg font-black text-slate-800">{prod > 0 ? prod.toLocaleString('id-ID') : 0}</div>
                                            </div>
                                        </div>

                                        {/* 2. Total NG Frame */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                                            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-cube"></i></div>
                                            <div className="min-w-0">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total NG Frame</div>
                                                <div className="text-lg font-black text-red-650">{ngQty.toLocaleString('id-ID')}</div>
                                            </div>
                                        </div>

                                        {/* 3. Total NG Point */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-exclamation-triangle"></i></div>
                                            <div className="min-w-0">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total NG Point</div>
                                                <div className="text-lg font-black text-purple-650">{ngPoint.toLocaleString('id-ID')}</div>
                                            </div>
                                        </div>

                                        {/* 4. Frame OK Ratio (Chokoritsu) */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner ${frameOKNum !== null && frameOKNum < 98 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}><i className="fas fa-percent"></i></div>
                                            <div className="min-w-0">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Frame OK Ratio (Chokoritsu)</div>
                                                <div className={`text-lg font-black ${frameOKNum !== null && frameOKNum < 98 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {frameOK !== null ? frameOK + '%' : '-'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 5. Point OK Ratio */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner ${pointOKNum !== null && pointOKNum < 99.5 ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-600'}`}><i className="fas fa-bullseye"></i></div>
                                            <div className="min-w-0">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Point OK Ratio</div>
                                                <div className={`text-lg font-black ${pointOKNum !== null && pointOKNum < 99.5 ? 'text-red-600' : 'text-teal-600'}`}>
                                                    {pointOK !== null ? pointOK + '%' : '-'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 6. Efisiensi */}
                                        <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setShowEffDetail(true); setExpandedSessionId(null); }}>
                                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-inner"><i className="fas fa-chart-line"></i></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Efisiensi</div>
                                                <div className="text-lg font-black tabular-nums" style={{color: !effBySheets ? '#94a3b8' : (effBySheets.efficiency || 0) >= 80 ? '#059669' : (effBySheets.efficiency || 0) >= 50 ? '#d97706' : '#dc2626'}}>
                                                    {effBySheets ? effBySheets.efficiency + '%' : '-'}
                                                </div>
                                                <div className="text-[8px] font-bold leading-tight mt-0.5">
                                                    {effBySheets ? (
                                                        <div>
                                                            <div className="text-slate-400">{effBySheets.sessions} sesi · {effBySheets.active_min} mnt aktif</div>
                                                            {(effBySheets.lost_time_min || effBySheets.lost_products) ? (
                                                                <div className="text-red-400">Loss: {effBySheets.lost_time_min} mnt · {effBySheets.lost_products} pcs</div>
                                                            ) : null}
                                                        </div>
                                                    ) : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}


                            {/* Charts Section */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col h-[340px]">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div> Pareto Analisis: Problem Terbanyak
                                    </h3>
                                    <div className="flex-1 relative">
                                        <canvas ref={canvasRefs.paretoProblem}></canvas>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col h-[340px]">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Pareto Analisis: Point Check Terbanyak
                                    </h3>
                                    <div className="flex-1 relative">
                                        <canvas ref={canvasRefs.paretoPoint}></canvas>
                                    </div>
                                </div>
                            </div>

                            {/* Heatmap full-width */}
                            <div className="bg-slate-900 rounded-[2rem] border-4 border-slate-800 overflow-hidden relative shadow-xl flex flex-col min-h-[450px]">
                                 <div className="flex justify-between items-center bg-slate-800 px-5 py-3 text-white">
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Intensity Heatmap</span>
                                    <div className="flex items-center gap-1.5 text-[8px] font-black tracking-normal uppercase bg-slate-900/60 px-3 py-1 rounded-xl">
                                        <span className="text-slate-400">Low</span>
                                        <span className="w-2 h-2 rounded-full bg-blue-500/80 border border-blue-400/40 inline-block" title="Aman (0 NG)"></span>
                                        <span className="w-2 h-2 rounded-full bg-yellow-500 border border-yellow-600 inline-block" title="Rendah (1-2 NG)"></span>
                                        <span className="w-2 h-2 rounded-full bg-orange-500 border border-orange-600 inline-block" title="Sedang (>=3 NG)"></span>
                                        <span className="w-2 h-2 rounded-full bg-red-650 border border-red-800 inline-block" title="Tinggi (Top 3 NG)"></span>
                                        <span className="text-slate-400">High</span>
                                    </div>
                                 </div>
                                 <div className="relative flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4 custom-scrollbar-dark">
                                    {partDetails.image_path ? (
                                        <div ref={heatmapRef} className="relative w-full shadow-2xl rounded-2xl overflow-hidden border-4 border-slate-800 max-w-full">
                                            <img src={`${api_url}/${partDetails.image_path}`} className="w-full block" />
                                            {/* Click-outside overlay to close popup */}
                                            {selectedPoint && (
                                                <div className="absolute inset-0 z-20" onClick={() => setSelectedPoint(null)} />
                                            )}
                                            {partPoints.map((p, idx) => {
                                                const ana = partAnalyticsData.points?.find(ap => ap.check_no == p.check_no);
                                                const qty = ana ? Number(ana.total_qty) : 0;
                                                const size = markerSize;
                                                const top3Set = new Set(
                                                    [...(partAnalyticsData.points || [])]
                                                        .filter(pt => Number(pt.total_qty || 0) > 0)
                                                        .sort((a, b) => b.total_qty - a.total_qty)
                                                        .slice(0, 3)
                                                        .map(pt => String(pt.check_no))
                                                );
                                                const isTop3 = top3Set.has(String(p.check_no)) && qty > 0;
                                                let colorClass = 'bg-blue-500/20 border-blue-400/40 text-blue-800/40';
                                                if (isTop3) {
                                                    colorClass = 'bg-red-600/90 border-red-800 text-white scale-110 z-20 shadow-[0_0_20px_rgba(220,38,38,0.8)]';
                                                } else if (qty > 0 && qty < 3) {
                                                    colorClass = 'bg-yellow-500/40 border-yellow-600 text-white shadow-[0_0_15px_rgba(234,179,8,0.4)]';
                                                } else if (qty >= 3) {
                                                    colorClass = 'bg-orange-500/50 border-orange-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.5)]';
                                                }

                                                const isSelected = selectedPoint?.check_no == p.check_no;

                                                // Build pareto problem list for this point from history
                                                const handlePointClick = (e) => {
                                                    e.stopPropagation();
                                                    if (isSelected) { setSelectedPoint(null); return; }
                                                    const pointHistory = (partAnalyticsData.history || []).filter(h => h.check_no == p.check_no);
                                                    // Group by problem
                                                    const grouped = {};
                                                    pointHistory.forEach(h => {
                                                        const key = h.problem || '-';
                                                        if (!grouped[key]) grouped[key] = { problem: key, defect_code: h.defect_code, total_qty: 0 };
                                                        grouped[key].total_qty += Number(h.qty || 0);
                                                    });
                                                    const problems = Object.values(grouped).sort((a, b) => b.total_qty - a.total_qty);
                                                    setSelectedPoint({ check_no: p.check_no, qty, problems, x: p.x_coord, y: p.y_coord });
                                                };

                                                return (
                                                    <div key={idx} style={{ left: `${p.x_coord}%`, top: `${p.y_coord}%`, width: `${size}px`, height: `${size}px`, transform: 'translate(-50%, -50%)', position: 'absolute', zIndex: isSelected ? 30 : undefined }}>
                                                        <div
                                                            className={`w-full h-full rounded-full flex items-center justify-center font-black transition-all cursor-pointer border-2 ${colorClass} ${isSelected ? 'ring-4 ring-white ring-offset-1 scale-125' : 'hover:scale-110'}`}
                                                            onClick={handlePointClick}
                                                            title={`Point #${p.check_no}: ${qty} Defect — Klik untuk detail`}>
                                                            <span style={{ fontSize: `${Math.max(8, size/3.2)}px` }}>{p.check_no}</span>
                                                        </div>

                                                        {/* Popup Problem List */}
                                                        {isSelected && (
                                                            <div
                                                                className="absolute z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                                                                style={{
                                                                    width: '200px',
                                                                    maxHeight: '260px',
                                                                    left: p.x_coord > 65 ? 'auto' : '110%',
                                                                    right: p.x_coord > 65 ? '110%' : 'auto',
                                                                    top: p.y_coord > 60 ? 'auto' : '0',
                                                                    bottom: p.y_coord > 60 ? '0' : 'auto',
                                                                }}
                                                                onClick={e => e.stopPropagation()}>
                                                                {/* Popup Header */}
                                                                <div className="bg-slate-900 px-4 py-2.5 flex justify-between items-center">
                                                                    <div>
                                                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Point #{p.check_no}</div>
                                                                        <div className="text-[11px] font-black text-white">{qty} Total NG</div>
                                                                    </div>
                                                                    <button onClick={() => setSelectedPoint(null)} className="text-slate-400 hover:text-white transition-colors w-5 h-5 flex items-center justify-center">
                                                                        <i className="fas fa-times text-[10px]"></i>
                                                                    </button>
                                                                </div>
                                                                {/* Problem List */}
                                                                <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                                                                    {selectedPoint.problems.length === 0 ? (
                                                                        <div className="py-6 text-center text-slate-300 text-[10px] italic font-bold uppercase tracking-widest">No Problem Data</div>
                                                                    ) : (
                                                                        selectedPoint.problems.map((prob, pi) => {
                                                                            const maxQty = selectedPoint.problems[0]?.total_qty || 1;
                                                                            const barPct = Math.round((prob.total_qty / maxQty) * 100);
                                                                            return (
                                                                                <div key={pi} className={`px-3 py-2 border-b border-slate-50 ${pi === 0 ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                                                                                    <div className="flex justify-between items-center mb-1">
                                                                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                                            <span className="text-[8px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded shrink-0">{pi + 1}</span>
                                                                                            <span className="text-[9px] font-bold text-slate-700 truncate">{prob.problem}</span>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-black ml-1 shrink-0 ${pi === 0 ? 'text-red-600' : 'text-slate-500'}`}>{prob.total_qty}</span>
                                                                                    </div>
                                                                                    <div className="w-full bg-slate-100 rounded-full h-1">
                                                                                        <div className={`h-1 rounded-full ${pi === 0 ? 'bg-red-500' : 'bg-slate-400'}`} style={{ width: `${barPct}%` }}></div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-slate-400 text-center py-20 font-bold italic">Gambar master part belum diunggah</div>
                                    )}
                                 </div>
                            </div>

                            {/* 3 cards below heatmap in one row */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[320px]">
                                {/* Top 3 hotspots */}
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col min-h-0">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0"><div className="w-1 h-3 bg-red-600 rounded-full"></div> Top 3 Hotspots</h3>
                                    <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                                        {partAnalyticsData.points?.sort((a, b) => b.total_qty - a.total_qty).slice(0, 3).map((p, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-blue-50/50 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs group-hover:bg-blue-600 transition-colors">#{p.check_no}</div>
                                                    <div>
                                                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Occurrences</div>
                                                        <div className="text-[10px] font-bold text-slate-700">{p.total_qty} Defects</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-red-600">{p.total_qty} NG</div>
                                                </div>
                                            </div>
                                        ))}
                                        {(!partAnalyticsData.points || partAnalyticsData.points.length === 0) && (
                                            <div className="py-8 text-center text-slate-300 italic font-bold text-xs uppercase tracking-widest">Belum ada data NG</div>
                                        )}
                                    </div>
                                </div>

                                {/* Distribusi Defect per Line / Pos */}
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col min-h-0">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0">
                                        <div className="w-1 h-3 bg-purple-600 rounded-full"></div> Distribusi Defect per Line / Pos
                                    </h3>
                                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar">
                                        {partAnalyticsData.lines?.map((item, idx) => {
                                            const maxQty = partAnalyticsData.lines[0]?.total_qty || 1;
                                            const barPct = Math.round((item.total_qty / maxQty) * 100);
                                            return (
                                                <div key={idx} className="space-y-1">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="font-bold text-slate-700">{item.line_pos || 'Belum Terisi'}</span>
                                                        <span className="font-black text-red-600">{item.total_qty} NG</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" style={{ width: `${barPct}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(!partAnalyticsData.lines || partAnalyticsData.lines.length === 0) && (
                                            <div className="py-6 text-center text-slate-300 italic font-bold text-xs uppercase tracking-widest">Tidak ada data stasiun kerja</div>
                                        )}
                                    </div>
                                </div>

                                {/* History Problem */}
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col min-h-0">
                                    <div className="flex justify-between items-center mb-4 shrink-0">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-3 bg-slate-900 rounded-full"></div> History Problem</h3>
                                        <div className="relative">
                                            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-[9px]"></i>
                                            <input 
                                                type="text" 
                                                placeholder="Cari masalah..." 
                                                value={historySearch}
                                                onChange={(e) => setHistorySearch(e.target.value)}
                                                className="pl-7 pr-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-bold outline-none focus:ring-1 focus:ring-blue-500 w-28"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                        <div className="space-y-2">
                                            {partAnalyticsData.history?.filter(h => h.problem.toLowerCase().includes(historySearch.toLowerCase())).map((h, i) => (
                                                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">{new Date(h.date).toLocaleDateString('id-ID')}</span>
                                                        <span className="text-[8px] font-black text-slate-400 uppercase">POINT {h.check_no}</span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-700 mb-1.5">{h.problem}</p>
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="bg-slate-950 text-white px-1.5 py-0.5 rounded text-[8px] font-black">{h.defect_code}</span>
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[100px]">
                                                                {getFullDefectName(h.defect_code).split(' - ')[1] || h.defect_code}
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Qty: {h.qty}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!partAnalyticsData.history || partAnalyticsData.history.length === 0) && (
                                                <div className="py-10 text-center text-slate-300 italic font-bold text-xs uppercase tracking-widest">Tidak ada riwayat</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Efficiency Detail Popup */}
                            {showEffDetail && effBySheets && effBySheets.session_details && (
                                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEffDetail(false)}>
                                    <div className="bg-white rounded-[2rem] w-full max-w-[95vw] lg:max-w-[85vw] xl:max-w-7xl mx-4 max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">⏱ Efisiensi per Sesi Produksi</h3>
                                            <button onClick={() => setShowEffDetail(false)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400">
                                                <i className="fas fa-times text-sm"></i>
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                                        <th className="pb-2">#</th>
                                                        <th className="pb-2">Jam</th>
                                                        <th className="pb-2 text-right">Durasi</th>
                                                        <th className="pb-2 text-right">Checks</th>
                                                        <th className="pb-2 text-right">Takt</th>
                                                        <th className="pb-2 text-right">Expected</th>
<th className="pb-2 text-right">Loss (time|Pcs)</th>
                                                        <th className="pb-2 text-right">Eff%</th>
                                                        <th className="pb-2 text-right w-20">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {effBySheets.session_details.map((s, i) => {
                                                        const isDual = !!partDetails?.paired_part_number;
                                                        const hourlyKiri = sessionHourly[`${s.id}|KIRI`]?.daily;
                                                        const hourlyKanan = sessionHourly[`${s.id}|KANAN`]?.daily;
                                                        const hasBothLoaded = isDual && hourlyKiri && hourlyKanan;

                                                        const displayExpected = hasBothLoaded 
                                                            ? (hourlyKiri.total_expected + hourlyKanan.total_expected) 
                                                            : s.expected;
                                                        const displayChecks = hasBothLoaded 
                                                            ? (hourlyKiri.total_checks + hourlyKanan.total_checks) 
                                                            : s.total_checks;
                                                        const displayEff = displayExpected > 0 
                                                            ? Math.round((displayChecks / displayExpected) * 100) 
                                                            : s.efficiency;
                                                        const displayLostPcs = Math.max(0, displayExpected - displayChecks);
                                                        const displayLostMin = displayLostPcs > 0 
                                                            ? Math.round(displayLostPcs * 36 / 60 * 10) / 10 
                                                            : 0;

                                                        return (
                                                            <React.Fragment key={s.id}>
                                                                <tr className={`border-b text-[12px] font-bold cursor-pointer transition-colors ${expandedSessionId === s.id ? 'bg-blue-50 border-blue-200' : 'border-slate-50 hover:bg-slate-50'}`} onClick={() => handleSessionClick(s)}>
                                                                    <td className="py-2 pl-2 text-slate-400">
                                                                        <i className={`fas fa-chevron-right text-[8px] transition-transform mr-1 ${expandedSessionId === s.id ? 'rotate-90' : ''}`}></i>
                                                                        {i + 1}
                                                                    </td>
                                                                    <td className="py-2 text-slate-600">{s.timestart}-{s.timeend}</td>
                                                                    <td className="py-2 text-right tabular-nums text-slate-500">{s.active_min} mnt</td>
                                                                    <td className="py-2 text-right tabular-nums">{displayChecks}</td>
                                                                    <td className="py-2 text-right tabular-nums text-slate-500">{s.avg_takt}s</td>
                                                                    <td className="py-2 text-right tabular-nums text-slate-500">{displayExpected}</td>
                                                                    <td className="py-2 text-right tabular-nums text-red-500">{displayLostMin} mnt | {displayLostPcs} pcs</td>
                                                                    <td className="py-2 pr-2 text-right tabular-nums" style={{color: displayEff >= 80 ? '#059669' : displayEff >= 50 ? '#d97706' : '#dc2626'}}>{displayEff}%</td>
                                                                    <td className="py-2 pr-2 text-right">
                                                                        <button onClick={e => { e.stopPropagation(); openStoplineModal(s); }} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[9px] font-black transition-all active:scale-95">
                                                                            <i className="fas fa-circle-stop mr-1"></i>Stop
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            {expandedSessionId === s.id && (() => {
                                                                const isDual = !!partDetails?.paired_part_number;
                                                                const hourlyKey = `${s.id}|${expandedSide}`;
                                                                const hourlyData = sessionHourly[hourlyKey];
                                                                return (
                                                                    <tr>
                                                                        <td colSpan={9} className="p-0">
                                                                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 animate-in slide-in-from-top-1 duration-150">
                                                                                {isDual && (
                                                                                    <div className="flex gap-2 border-b border-slate-200 pb-2 mb-3">
                                                                                        <button 
                                                                                            onClick={() => handleSideChange(s, 'KIRI')} 
                                                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${expandedSide === 'KIRI' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                                                        >
                                                                                            👈 Sisi KIRI / LH ({s.lh_checks || 0} Checks)
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={() => handleSideChange(s, 'KANAN')} 
                                                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${expandedSide === 'KANAN' ? 'bg-purple-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                                                        >
                                                                                            👉 Sisi KANAN / RH ({s.rh_checks || 0} Checks)
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                                {hourlyData ? (
                                                                                    <div className="space-y-3">
                                                                                        {hourlyData.items?.length > 0 && (
                                                                                            <div className="space-y-2">
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Durasi per Check ({expandedSide === 'KIRI' ? 'KIRI/LH' : expandedSide === 'KANAN' ? 'KANAN/RH' : 'Total'})</span>
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Batas Sumbu Y (detik):</span>
                                                                                                        <input 
                                                                                                            type="number" 
                                                                                                            value={chartMaxY} 
                                                                                                            onChange={(e) => setChartMaxY(e.target.value)} 
                                                                                                            placeholder="Auto" 
                                                                                                            className="w-16 px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="h-48">
                                                                                                    <canvas ref={sessionChartRef} className="w-full h-full"></canvas>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {hourlyData.data?.length > 0 ? (
                                                                                        <table className="w-full text-left">
                                                                                            <thead>
                                                                                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                                                                                                    <th className="pb-1.5">Jam</th>
                                                                                                    <th className="pb-1.5 text-right">Checks</th>
                                                                                                    <th className="pb-1.5 text-right">Durasi</th>
                                                                                                    <th className="pb-1.5 text-right">Takt</th>
                                                                                                    <th className="pb-1.5 text-right">Expected</th>
                                                                                                    <th className="pb-1.5 text-right">Loss (time|Prod)</th>
                                                                                                    <th className="pb-1.5 text-right">Eff%</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {hourlyData.data.map((h, hi) => (
                                                                                                    <tr key={hi} className="text-[11px] font-bold border-b border-slate-100">
                                                                                                        <td className="py-1 text-slate-500">{h.hour}</td>
                                                                                                        <td className="py-1 text-right tabular-nums">{h.checks}</td>
                                                                                                        <td className="py-1 text-right tabular-nums text-slate-400">{h.active_min} mnt</td>
                                                                                                        <td className="py-1 text-right tabular-nums text-slate-500">{h.avg_takt}s</td>
                                                                                                        <td className="py-1 text-right tabular-nums text-slate-500">{h.expected}</td>
                                                                                                        <td className="py-1 text-right tabular-nums text-red-500">{h.lost_time_min} mnt | {h.lost_products} pcs</td>
                                                                                                        <td className="py-1 text-right tabular-nums" style={{color: h.efficiency >= 80 ? '#059669' : h.efficiency >= 50 ? '#d97706' : '#dc2626'}}>{h.efficiency}%</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                                {hourlyData.daily && (
                                                                                                    <tr className="text-[11px] font-black border-t border-slate-300">
                                                                                                        <td className="py-1.5 text-slate-800">Total Sisi</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums">{hourlyData.daily.total_checks}</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums text-slate-500">{hourlyData.daily.active_min} mnt</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums text-slate-500">{hourlyData.avg_takt}s</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums text-slate-500">{hourlyData.daily.total_expected}</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums text-red-600">{hourlyData.daily.lost_time_min} mnt | {hourlyData.daily.lost_products} pcs</td>
                                                                                                        <td className="py-1.5 text-right tabular-nums" style={{color: hourlyData.daily.efficiency >= 80 ? '#059669' : hourlyData.daily.efficiency >= 50 ? '#d97706' : '#dc2626'}}>{hourlyData.daily.efficiency}%</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        ) : (
                                                                                            <div className="text-[11px] text-slate-400 italic font-bold text-center py-2">Tidak ada data per jam</div>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex items-center justify-center gap-2 py-2">
                                                                                        <i className="fas fa-spinner fa-spin text-blue-600"></i>
                                                                                        <span className="text-[11px] font-bold text-slate-400">Memuat data per jam...</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })()}
                                                        </React.Fragment>
                                                    );
                                                     })}
                                                     {(() => {
                                                         const isDual = !!partDetails?.paired_part_number;
                                                         let totalExpected = 0;
                                                         let totalChecks = 0;
                                                         let activeMin = 0;

                                                         effBySheets.session_details.forEach(s => {
                                                             const hourlyKiri = sessionHourly[`${s.id}|KIRI`]?.daily;
                                                             const hourlyKanan = sessionHourly[`${s.id}|KANAN`]?.daily;
                                                             if (isDual && hourlyKiri && hourlyKanan) {
                                                                 totalExpected += (hourlyKiri.total_expected + hourlyKanan.total_expected);
                                                                 totalChecks += (hourlyKiri.total_checks + hourlyKanan.total_checks);
                                                             } else {
                                                                 totalExpected += s.expected;
                                                                 totalChecks += s.total_checks;
                                                             }
                                                             activeMin += s.active_min;
                                                         });

                                                         if (effBySheets.total_checks <= 0) return null;

                                                         const displayEff = totalExpected > 0 ? Math.round((totalChecks / totalExpected) * 100) : 0;
                                                         const displayLostPcs = Math.max(0, totalExpected - totalChecks);
                                                         const displayLostMin = displayLostPcs > 0 ? Math.round(displayLostPcs * 36 / 60 * 10) / 10 : 0;

                                                         return (
                                                             <tr className="text-[13px] font-black border-t-2 border-slate-200">
                                                                 <td className="py-3 text-slate-900" colSpan={2}>Total ({effBySheets.sessions} sesi)</td>
                                                                 <td className="py-3 text-right tabular-nums text-slate-500">{activeMin.toFixed(1)} mnt</td>
                                                                 <td className="py-3 text-right tabular-nums">{totalChecks}</td>
                                                                 <td className="py-3 text-right tabular-nums text-slate-500">{effBySheets.avg_takt}s</td>
                                                                 <td className="py-3 text-right tabular-nums text-slate-500">{totalExpected}</td>
                                                                 <td className="py-3 text-right tabular-nums text-red-600">{displayLostMin} mnt | {displayLostPcs} pcs</td>
                                                                 <td className="py-3 text-right tabular-nums" style={{color: displayEff >= 80 ? '#059669' : displayEff >= 50 ? '#d97706' : '#dc2626'}}>{displayEff}%</td>
                                                             </tr>
                                                         );
                                                     })()}
                                                </tbody>
                                            </table>

                                            {effLineStops.length > 0 && (
                                                <div>
                                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">📋 Line Stop ({effLineStops.length})</h4>
                                                    <div className="space-y-2">
                                                        {effLineStops.map((ls, i) => (
                                                            <div key={i} className="p-3 bg-red-50 rounded-xl border border-red-100">
                                                                <div className="flex justify-between items-start">
                                                                    <span className="text-[9px] font-black text-red-600">{ls.loss_start?.substring(11,16) || ''} - {ls.loss_end?.substring(11,16) || ''} · {ls.duration_min} mnt</span>
                                                                    <span className="text-[8px] font-black bg-red-200 text-red-800 px-1.5 py-0.5 rounded">{ls.category_4m}</span>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-700 mt-1">{ls.stop_reason}</p>
                                                                {ls.corrective_action && (
                                                                    <p className="text-[8px] text-slate-500 mt-0.5">Perbaikan: {ls.corrective_action}</p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stopline Form Modal */}
                            {stoplineTarget && (
                                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeStoplineModal}>
                                    <div className="bg-white rounded-[2rem] w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                                        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-4">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xs font-black text-white uppercase tracking-widest"><i className="fas fa-circle-stop mr-2"></i>Stopline</h3>
                                                <button onClick={closeStoplineModal} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
                                                    <i className="fas fa-times text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="overflow-y-auto p-5 custom-scrollbar space-y-3 max-h-[calc(90vh-80px)]">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Part Number</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800">{partDetails.part_number}</div>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Part Name</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 truncate">{partDetails.part_name || part.part_name || '-'}</div>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Model</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800">{partDetails.model || '-'}</div>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Line / Pos</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800">{stoplineTarget.line_pos}</div>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Date</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800">{stoplineTarget.date}</div>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Shift</label>
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800">{stoplineTarget.shift}</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Loss Start</label>
                                                    <input type="time" value={stoplineForm.lossStart} onChange={e => setStoplineForm({ ...stoplineForm, lossStart: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                                </div>
                                                <div>
                                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Loss End</label>
                                                    <input type="time" value={stoplineForm.lossEnd} onChange={e => setStoplineForm({ ...stoplineForm, lossEnd: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Category 4M</label>
                                                <select value={stoplineForm.category4m} onChange={e => setStoplineForm({ ...stoplineForm, category4m: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                                    <option value="">— Pilih —</option>
                                                    {[...new Set((stoplineAbnCategories || []).map(c => c.category_4m1e).filter(Boolean))].map((cat, i) => (
                                                        <option key={i} value={cat}>{cat}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                                    <i className="fas fa-exclamation-triangle text-yellow-500 mr-1"></i>
                                                    Abnormality Terkait
                                                    {stoplineAbnormalities.length > 0 && (
                                                        <span className="ml-1 text-[8px] text-slate-400 font-bold">({stoplineAbnormalities.length})</span>
                                                    )}
                                                </label>
                                                {stoplineAbnormalities.length > 0 ? (
                                                    <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
                                                        {stoplineAbnormalities.map((a, i) => (
                                                            <div key={i} onClick={() => {
                                                                const isSelected = stoplineSelectedAbnormality === a.id;
                                                                setStoplineSelectedAbnormality(isSelected ? null : a.id);
                                                                if (!isSelected) {
                                                                    setStoplineForm(f => ({ ...f, category4m: a.category_4m1e || '' }));
                                                                }
                                                            }}
                                                                className={'p-2 rounded-xl border text-[9px] font-bold cursor-pointer transition-all ' + (stoplineSelectedAbnormality === a.id ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-blue-50')}>
                                                                {a.time && <span className="text-blue-600">{a.time.substring(0, 5)}</span>}
                                                                {a.time && <span className="mx-1">|</span>}
                                                                <span className="text-slate-800">{a.category_4m1e}</span>
                                                                <span className="mx-1">·</span>
                                                                <span className="text-slate-500">{a.problem_category}</span>
                                                                {a.inspector && <span className="text-slate-400 ml-1">({a.inspector})</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-bold text-slate-400 italic">Tidak ada abnormality record</div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Stop Reason</label>
                                                <textarea value={stoplineForm.stopReason} onChange={e => setStoplineForm({ ...stoplineForm, stopReason: e.target.value })} rows={2}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Corrective Action</label>
                                                <textarea value={stoplineForm.correctiveAction} onChange={e => setStoplineForm({ ...stoplineForm, correctiveAction: e.target.value })} rows={2}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Notes</label>
                                                <textarea value={stoplineForm.notes} onChange={e => setStoplineForm({ ...stoplineForm, notes: e.target.value })} rows={2}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                            </div>
                                            <div className="flex gap-3 pt-2">
                                                <button onClick={handleStoplineSave} disabled={stoplineSaving}
                                                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-md">
                                                    {stoplineSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                                                    Simpan Stopline
                                                </button>
                                                <button onClick={closeStoplineModal}
                                                    className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all">
                                                    Batal
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    )}
                </div>
            </div>
        </div>
    );
}
window.PartAnalyticsModal = PartAnalyticsModal;

