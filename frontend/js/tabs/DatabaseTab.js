const getGroupedDetails = (details) => {
    if (!details) return [];
    const map = {};
    details.forEach(d => {
        const key = `${d.checkNo || '-'}|${d.problem || '-'}|${d.defectCode || '-'}`;
        if (!map[key]) {
            map[key] = { ...d, qty: 0 };
        }
        map[key].qty += Number(d.qty || 0);
    });
    return Object.values(map);
};

function DatabaseTab({ api_url, onOpenRecord, currentUser }) {
    const [dbRecords, setDbRecords] = React.useState([]);
    const [isLoadingDb, setIsLoadingDb] = React.useState(false);
    const [dbLineFilter, setDbLineFilter] = React.useState('');
    const currentMonth = String(new Date().getMonth() + 1);

    const [recapFilter, setRecapFilter] = React.useState({
        month: currentMonth,
        year: "",
        partNumber: "",
        model: "",
        startDate: "",
        endDate: ""
    });

    const [availableModels, setAvailableModels] = React.useState([]);
    const [availableLines, setAvailableLines] = React.useState([]);

    // Pagination States
    const [currentPage, setCurrentPage] = React.useState(1);
    const [totalPages, setTotalPages] = React.useState(1);
    const [totalRecords, setTotalRecords] = React.useState(0);

    // Abnormality tab state
    const [dbViewMode, setDbViewMode] = React.useState('inspection'); // 'inspection' | 'abnormality'
    const [abnRecords, setAbnRecords] = React.useState([]);
    const [abnFilter, setAbnFilter] = React.useState({ date: '', partNumber: '', inspector: '' });

    const [detailModal, setDetailModal] = React.useState({ open: false, mode: 'view', loading: false, record: null, data: null });
    const [modalEditData, setModalEditData] = React.useState(null);

    React.useEffect(() => {
        fetchDatabaseRecords(1);
        fetchModels();
    }, []);

    React.useEffect(() => {
        if (dbViewMode === 'abnormality') fetchAbnormalityRecords();
    }, [dbViewMode]);

    React.useEffect(() => {
        fetchDatabaseRecords(1);
    }, [dbLineFilter]);

    const fetchModels = async () => {
        try {
            const response = await fetch(`${api_url}/api/master/parts`);
            const result = await response.json();
            if (result.status === 'success') {
                const uniqueModels = [...new Set(result.data.map(p => p.model))].filter(m => m);
                setAvailableModels(uniqueModels);
            }
        } catch (error) {
            console.error("Fetch models error:", error);
        }
    };

    const fetchDatabaseRecords = async (page = 1) => {
        setIsLoadingDb(true);
        try {
            const { month, year, partNumber, model, startDate, endDate } = recapFilter;
            let url = `${api_url}/api/records?page=${page}&limit=15`;
            if (month && month !== 'all') url += `&month=${month}`;
            if (year) url += `&year=${year}`;
            if (partNumber) url += `&partNumber=${partNumber}`;
            if (model) url += `&model=${model}`;
            if (startDate) url += `&startDate=${startDate}`;
            if (endDate) url += `&endDate=${endDate}`;
            if (dbLineFilter) url += `&linePos=${encodeURIComponent(dbLineFilter)}`;

            const response = await fetch(url);
            const result = await response.json();

            if (result.status === 'success') {
                const formattedData = result.data.map(row => ({
                    id: row.id,
                    confidence_score: row.confidence_score !== undefined && row.confidence_score !== null ? row.confidence_score : 100,
                    meta: {
                        partName: row.part_name || "",
                        partNumber: row.part_number || "",
                        model: row.model || "",
                        nama: row.inspector || "",
                        shift: row.shift || "",
                        linePos: row.line_pos || "",
                        date: row.date ? row.date.split('T')[0] : ""
                    },
                    created_at: row.created_at,
                    summary: {
                        totalProduksi: row.total_prod || 0,
                        totalOK: row.total_ok || 0,
                        totalNG: row.total_ng || 0,
                        totalNGPoint: row.total_ng_point || 0,
                        totalScrap: row.total_scrap || 0,
                        confidenceScore: row.confidence_score !== undefined && row.confidence_score !== null ? row.confidence_score : 100,
                        efficiency: row.efficiency || 0,
                        totalCheckTime: row.total_check_time || 0,
                        totalChecks: row.total_checks || 0
                    },
                    image_path: row.image_path
                }));
                setDbRecords(formattedData);
                if (result.availableLines) {
                    setAvailableLines(result.availableLines);
                }
                if (result.pagination) {
                    setCurrentPage(result.pagination.page);
                    setTotalPages(result.pagination.totalPages);
                    setTotalRecords(result.pagination.total);
                }
            }
        } catch (error) {
            console.error("Fetch DB error:", error);
        } finally {
            setIsLoadingDb(false);
        }
    };

    const fetchAbnormalityRecords = async () => {
        setIsLoadingDb(true);
        try {
            let url = `${api_url}/api/abnormality?`;
            const params = [];
            if (abnFilter.date) { url += `&date=${abnFilter.date}`; }
            if (abnFilter.partNumber) { url += `&partNumber=${abnFilter.partNumber}`; }
            if (abnFilter.inspector) { url += `&inspector=${abnFilter.inspector}`; }
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success') setAbnRecords(result.data);
        } catch (e) {
            console.error('Fetch abnormality records error:', e);
        } finally {
            setIsLoadingDb(false);
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return '-';
        const dateObj = new Date(ts);
        if (isNaN(dateObj.getTime())) return ts;
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    };

    const handleDeleteRecord = async (id) => {
        if (!confirm("Apakah Anda yakin ingin menghapus data ini secara permanen?")) return;
        try {
            const response = await fetch(`${api_url}/api/delete/${id}`);
            const result = await response.json();
            if (result.status === 'success') {
                fetchDatabaseRecords(currentPage);
            } else {
                alert("Gagal menghapus: " + result.message);
            }
        } catch (error) {
            alert("Error saat menghapus: " + error.message);
        }
    };

    const handleClearFilter = () => {
        const resetFilter = { month: "all", year: "", partNumber: "", model: "", startDate: "", endDate: "" };
        setRecapFilter(resetFilter);
        setTimeout(() => fetchDatabaseRecords(1), 100);
    };

    const handleDownloadMonthlyRecap = async () => {
        try {
            const { month, year, partNumber, model, startDate, endDate } = recapFilter;
            let url = `${api_url}/api/reports/monthly?1=1`;
            if (month && month !== 'all') url += `&month=${month}`;
            if (year) url += `&year=${year}`;
            if (partNumber) url += `&partNumber=${partNumber}`;
            if (model) url += `&model=${model}`;
            if (startDate) url += `&startDate=${startDate}`;
            if (endDate) url += `&endDate=${endDate}`;

            const res = await fetch(url);
            const result = await res.json();

            if (result.status === 'success') {
                const headers = ["Date", "Shift", "Total Produksi", "NG Frame", "NG Scrap", "Point", "DEFECT", "Qty", "Inspector", "Part Number"];
                let lastRecordId = null;

                const csvRows = result.data.map(r => {
                    const isNewRecord = r.id !== lastRecordId;
                    const row = [
                        isNewRecord ? r.date_day : "",
                        isNewRecord ? r.shift : "",
                        isNewRecord ? (r.total_prod || 0) : "",
                        isNewRecord ? (r.total_ng || 0) : "",
                        isNewRecord ? (r.total_scrap || 0) : "",
                        r.point || "-",
                        r.defect || "-",
                        r.qty || 0,
                        isNewRecord ? r.inspector : "",
                        isNewRecord ? r.part_number : ""
                    ];
                    lastRecordId = r.id;
                    return row;
                });

                const htmlContent = `
                  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                  <head>
                    <meta charset="utf-8">
                    <!--[if gte mso 9]>
                    <xml>
                      <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                          <x:ExcelWorksheet>
                            <x:Name>Recap QC</x:Name>
                            <x:WorksheetOptions>
                              <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                          </x:ExcelWorksheet>
                        </x:ExcelWorksheets>
                      </x:ExcelWorkbook>
                    </xml>
                    <![endif]-->
                  </head>
                  <body>
                    <table border="1">
                      <thead style="background-color: #f1f5f9; font-weight: bold;">
                        <tr>
                          ${headers.map(h => `<th style="padding: 5px; text-align: left;">${h}</th>`).join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${csvRows.map(row => `
                          <tr>
                            ${row.map(cell => `<td style="padding: 5px;">${cell === null || cell === undefined ? "" : cell}</td>`).join('')}
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </body>
                  </html>
                `;

                const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
                const urlObj = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = urlObj;
                link.setAttribute('download', `Recap_QC_${month}_${year}.xls`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            alert("Gagal download rekap: " + error.message);
        }
    };

    return (
        <><div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Database</h2>
                        <p className="text-sm text-slate-500">Kumpulan data hasil scan / abnormality.</p>
                    </div>
                    <div className="inline-flex bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                        <button onClick={() => setDbViewMode('inspection')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${dbViewMode === 'inspection' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                            <i className="fas fa-clipboard-list mr-1"></i> Check Sheets
                        </button>
                        <button onClick={() => setDbViewMode('abnormality')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${dbViewMode === 'abnormality' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                            <i className="fas fa-triangle-exclamation mr-1"></i> Abnormality
                        </button>
                    </div>
                </div>
            </div>

            {dbViewMode === 'inspection' && (<>
            {/* Filters */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="w-32">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Bulan</label>
                        <select
                            value={recapFilter.month}
                            onChange={(e) => setRecapFilter({ ...recapFilter, month: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold"
                        >
                            <option value="all">Semua</option>
                            {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                                <option key={i + 1} value={i + 1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-24">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Tahun</label>
                        <input
                            type="number" value={recapFilter.year}
                            onChange={(e) => setRecapFilter({ ...recapFilter, year: e.target.value })}
                            placeholder="2024"
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold"
                        />
                    </div>
                    <div className="w-32">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Model</label>
                        <select
                            value={recapFilter.model}
                            onChange={(e) => setRecapFilter({ ...recapFilter, model: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold font-black"
                        >
                            <option value="">Semua</option>
                            {availableModels.map((m, idx) => (
                                <option key={idx} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-32">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Mulai Tanggal</label>
                        <input
                            type="date" value={recapFilter.startDate}
                            onChange={(e) => setRecapFilter({ ...recapFilter, startDate: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold"
                        />
                    </div>
                    <div className="w-32">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Sampai Tanggal</label>
                        <input
                            type="date" value={recapFilter.endDate}
                            onChange={(e) => setRecapFilter({ ...recapFilter, endDate: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Part Number</label>
                        <input
                            type="text" value={recapFilter.partNumber}
                            onChange={(e) => setRecapFilter({ ...recapFilter, partNumber: e.target.value })}
                            placeholder="Cari No Part..."
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => fetchDatabaseRecords(1)} className="bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-700 shadow-lg">
                            <i className="fas fa-search text-[10px]"></i> Cari
                        </button>
                        <button onClick={handleClearFilter} className="bg-slate-100 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-200 border border-slate-200">
                            <i className="fas fa-undo text-[10px]"></i> Clear
                        </button>
                        <button onClick={handleDownloadMonthlyRecap} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg">
                            <i className="fas fa-file-excel text-[10px]"></i> Excel
                        </button>
                    </div>
                </div>
            </div>

            {isLoadingDb ? (
                <div className="text-center py-20">
                    <i className="fas fa-spinner fa-spin text-4xl mb-4 text-blue-500"></i>
                    <p className="text-slate-500 font-medium">Mengambil data dari MySQL...</p>
                </div>
            ) : dbRecords.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-xl">
                    <i className="fas fa-list text-4xl mb-4 text-slate-300"></i>
                    <p className="text-lg font-semibold text-slate-600">Database Masih Kosong</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                                    <th className="py-2 px-3 font-semibold text-xs">Tgl Scan & Inspector</th>
                                    <th className="py-2 px-3 font-semibold text-xs">
                                        <div className="flex flex-col gap-1 w-20 normal-case">
                                            <span>Line/Pos</span>
                                            <select 
                                                value={dbLineFilter} 
                                                onChange={(e) => setDbLineFilter(e.target.value)}
                                                className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[9px] font-bold text-slate-500 outline-none cursor-pointer w-full"
                                            >
                                                <option value="">Semua</option>
                                                {availableLines.map(l => (
                                                    <option key={l} value={l}>{l}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </th>
                                    <th className="py-2 px-3 font-semibold text-xs">Part Info</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center">Prod</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center text-green-600">OK</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center text-red-600">NG</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center text-purple-600">Point</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center text-emerald-600">Chokoritsu</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center text-blue-600">Efisiensi</th>
                                    <th className="py-2 px-3 font-semibold text-xs text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dbRecords.map((record, idx) => (
                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                        <td className="py-2 px-3">
                                            <div className="font-bold text-slate-800 text-xs">
                                                {record.meta.date || '-'} <span className="text-slate-300 mx-1">•</span> Shift {record.meta.shift || '-'} <span className="text-slate-300 mx-1">•</span> {record.meta.nama || 'Anonim'}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Input: {formatTimestamp(record.created_at)}</div>
                                        </td>
                                        <td className="py-2 px-3">
                                            <div className="text-xs text-slate-600 font-black bg-slate-100 px-1.5 py-0.5 rounded inline-block uppercase">{record.meta.linePos || '-'}</div>
                                        </td>
                                        <td className="py-2 px-3">
                                            <div className="font-semibold text-slate-700 text-xs leading-tight">{record.meta.partName || '-'}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">{record.meta.partNumber || '-'} • {record.meta.model || '-'}</div>
                                        </td>
                                        <td className="py-2 px-3 text-center font-bold text-slate-700 text-xs">{record.summary.totalProduksi}</td>
                                        <td className="py-2 px-3 text-center font-bold text-green-600 bg-green-50/30 rounded text-xs">{record.summary.totalOK}</td>
                                        <td className="py-2 px-3 text-center font-bold text-red-600 bg-red-50/30 rounded text-xs">{record.summary.totalNG}</td>
                                        <td className="py-2 px-3 text-center font-bold text-purple-600 bg-purple-50/30 rounded text-xs">{record.summary.totalNGPoint}</td>
                                        <td className="py-2 px-3 text-center font-bold text-emerald-600 text-xs">{record.summary.totalProduksi > 0 ? ((record.summary.totalOK / record.summary.totalProduksi) * 100).toFixed(1) + '%' : '-'}</td>
                                        <td className="py-2 px-3 text-center font-bold text-blue-600 text-xs">{record.summary.efficiency > 0 ? Number(record.summary.efficiency).toFixed(1) + '%' : '-'}</td>
                                        <td className="py-2 px-3 text-center">
                                            <div className="flex justify-center gap-1.5">
                                                <button 
                                                    onClick={() => window.showPartAnalytics && window.showPartAnalytics({ part_number: record.meta.partNumber, part_name: record.meta.partName, model: record.meta.model, initialModel: record.meta.model, initialDate: record.meta.date })}
                                                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 bg-indigo-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 text-[11px] font-black transition-colors"
                                                    title="Lihat Analitik Part"
                                                >
                                                    <i className="fas fa-chart-line text-[9px]"></i> Chart
                                                </button>
                                                <button 
                                                    onClick={async () => {
                                                        setDetailModal({ open: true, mode: 'view', loading: true, record: { id: record.id }, data: null });
                                                        try {
                                                            const res = await fetch(`${api_url}/api/records/${record.id}`);
                                                            const result = await res.json();
                                                            if (result.status === 'success') {
                                                                setDetailModal(prev => ({ ...prev, loading: false, data: result.data }));
                                                                setModalEditData(result.data);
                                                            } else {
                                                                alert("Gagal mengambil data detail.");
                                                                setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null });
                                                            }
                                                        } catch (e) {
                                                            alert("Error: " + e.message);
                                                            setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null });
                                                        }
                                                    }} 
                                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 bg-blue-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 text-[11px] font-black transition-colors"
                                                >
                                                    <i className="fas fa-eye text-[9px]"></i> View
                                                </button>
                                                {(currentUser?.role === 'admin') && (
                                                <button 
                                                    onClick={async () => {
                                                        setDetailModal({ open: true, mode: 'edit', loading: true, record: { id: record.id }, data: null });
                                                        try {
                                                            const res = await fetch(`${api_url}/api/records/${record.id}`);
                                                            const result = await res.json();
                                                            if (result.status === 'success') {
                                                                setDetailModal(prev => ({ ...prev, loading: false, data: result.data }));
                                                                setModalEditData(result.data);
                                                            } else {
                                                                alert("Gagal mengambil data detail.");
                                                                setDetailModal({ open: false, mode: 'edit', loading: false, record: null, data: null });
                                                            }
                                                        } catch (e) {
                                                            alert("Error: " + e.message);
                                                            setDetailModal({ open: false, mode: 'edit', loading: false, record: null, data: null });
                                                        }
                                                    }} 
                                                    className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 bg-emerald-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 text-[11px] font-black transition-colors"
                                                >
                                                    <i className="fas fa-edit text-[9px]"></i> Edit
                                                </button>
                                                )}
                                                {(currentUser?.role === 'admin') && (
                                                <button onClick={() => handleDeleteRecord(record.id)} className="text-red-600 hover:text-red-800 hover:bg-red-100 bg-red-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 text-[11px] font-black transition-colors">
                                                    <i className="fas fa-trash-alt text-[9px]"></i>
                                                </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex flex-wrap justify-between items-center px-6 py-4 bg-slate-50 border-t border-slate-100 gap-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Menampilkan Halaman {currentPage} dari {totalPages} ({totalRecords} data)
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => currentPage > 1 && fetchDatabaseRecords(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${currentPage === 1 ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    Prev
                                </button>
                                {[...Array(totalPages)].map((_, i) => {
                                    const pageNum = i + 1;
                                    if (pageNum === 1 || pageNum === totalPages || Math.abs(pageNum - currentPage) <= 1) {
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => fetchDatabaseRecords(pageNum)}
                                                className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    } else if (pageNum === 2 || pageNum === totalPages - 1) {
                                        return <span key={pageNum} className="text-slate-400 px-1 font-bold">...</span>;
                                    }
                                    return null;
                                })}
                                <button
                                    onClick={() => currentPage < totalPages && fetchDatabaseRecords(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${currentPage === totalPages ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}</>)}

            {dbViewMode === 'abnormality' && (
                <>
                    {/* Abnormality Filters */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="w-40">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Tanggal</label>
                                <input type="date" value={abnFilter.date} onChange={(e) => setAbnFilter({...abnFilter, date: e.target.value})} className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold" />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Part Number</label>
                                <input type="text" value={abnFilter.partNumber} onChange={(e) => setAbnFilter({...abnFilter, partNumber: e.target.value})} placeholder="Cari No Part..." className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold" />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Inspector</label>
                                <input type="text" value={abnFilter.inspector} onChange={(e) => setAbnFilter({...abnFilter, inspector: e.target.value})} placeholder="Nama QC..." className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all font-bold" />
                            </div>
                            <button onClick={fetchAbnormalityRecords} className="bg-red-600 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-700 shadow-lg">
                                <i className="fas fa-search text-[10px]"></i> Cari
                            </button>
                        </div>
                    </div>

                    {/* Abnormality Records Table */}
                    {isLoadingDb ? (
                        <div className="text-center py-20"><i className="fas fa-spinner fa-spin text-4xl mb-4 text-red-500"></i><p className="text-slate-500 font-medium">Mengambil data abnormality...</p></div>
                    ) : abnRecords.length === 0 ? (
                        <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-xl"><i className="fas fa-triangle-exclamation text-4xl mb-4 text-slate-300"></i><p className="text-lg font-semibold text-slate-600">Belum Ada Abnormality</p></div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-red-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                                            <th className="py-2 px-3 font-semibold text-xs">Tgl • Jam</th>
                                            <th className="py-2 px-3 font-semibold text-xs">Inspector</th>
                                            <th className="py-2 px-3 font-semibold text-xs">Part • Shift</th>
                                            <th className="py-2 px-3 font-semibold text-xs">4M1E</th>
                                            <th className="py-2 px-3 font-semibold text-xs">Masalah</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {abnRecords.map((rec, idx) => (
                                            <tr key={rec.id || idx} className="border-b border-slate-50 hover:bg-red-50/30 transition-colors">
                                                <td className="py-2 px-3">
                                                    <div className="font-bold text-slate-800 text-xs">{rec.date || '-'}</div>
                                                    <div className="text-[10px] font-semibold text-slate-400">{rec.time || '-'}</div>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className="font-bold text-slate-700 text-xs">{rec.inspector || '-'}</span>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className="font-semibold text-slate-700 text-xs">{rec.part_number || '-'}</span>
                                                    {rec.shift && <span className="ml-1 text-[10px] text-slate-400">S{rec.shift}</span>}
                                                    {rec.line_pos && <span className="ml-1 text-[10px] text-slate-400">L{rec.line_pos}</span>}
                                                    {rec.side && <span className={`ml-1 text-[9px] font-black ${rec.side === 'KANAN' ? 'text-purple-500' : 'text-blue-500'}`}>{rec.side}</span>}
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black bg-red-100 text-red-700">{rec.category_4m1e}</span>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className="font-bold text-slate-800 text-xs">{rec.problem_category}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>

            {detailModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => {
                        if (!modalEditData || detailModal.mode === 'view') {
                            setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null });
                            setModalEditData(null);
                        }
                    }}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300 border border-slate-200"
                        onClick={e => e.stopPropagation()}>
                        
                        {/* Header */}
                        <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0 rounded-t-[2.5rem]">
                            <div>
                                <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                    <i className={`fas ${detailModal.mode === 'edit' ? 'fa-edit text-emerald-400' : 'fa-eye text-blue-400'}`}></i>
                                    {detailModal.mode === 'edit' ? 'Edit Record' : 'Detail Record'}
                                </h3>
                                {detailModal.data?.meta && (
                                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                                        #{detailModal.data.meta.id} • {detailModal.data.meta.partNumber || '-'} • {detailModal.data.meta.partName || '-'}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => { setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null }); setModalEditData(null); }}
                                className="text-slate-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-800">
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {/* Loading */}
                        {detailModal.loading ? (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <i className="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
                                <p className="text-slate-500 font-medium">Memuat detail record...</p>
                            </div>
                        ) : detailModal.data ? (
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                
                                {/* Meta Fields */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <i className="fas fa-info-circle text-blue-400"></i> Informasi Record
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Part Number', key: 'partNumber', readOnly: true },
                                            { label: 'Part Name', key: 'partName', readOnly: true },
                                            { label: 'Model', key: 'model' },
                                            { label: 'Inspector', key: 'nama' },
                                            { label: 'Shift', key: 'shift' },
                                            { label: 'Line/Pos', key: 'linePos' },
                                            { label: 'Date', key: 'date', type: 'date' },
                                        ].map(field => {
                                            const val = detailModal.mode === 'edit' ? modalEditData?.meta?.[field.key] : detailModal.data?.meta?.[field.key];
                                            const isReadOnly = detailModal.mode === 'view' || field.readOnly;
                                            return (
                                                <div key={field.key}>
                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-wider">{field.label}</label>
                                                    {isReadOnly ? (
                                                        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                                                            {val || '-'}
                                                        </div>
                                                    ) : (
                                                        <input type={field.type || 'text'} value={val || ''} 
                                                            onChange={(e) => {
                                                                const newMeta = { ...modalEditData.meta, [field.key]: e.target.value };
                                                                setModalEditData({ ...modalEditData, meta: newMeta });
                                                            }}
                                                            className="w-full bg-white px-3 py-2 rounded-xl border-2 border-blue-200 text-xs font-bold text-slate-800 outline-none focus:border-blue-400" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Summary KPIs */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <i className="fas fa-chart-simple text-emerald-400"></i> Summary
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                                        {[
                                            { label: 'Total Prod', key: 'totalProduksi', color: 'blue' },
                                            { label: 'Total OK', key: 'totalOK', color: 'emerald' },
                                            { label: 'NG Frame', key: 'totalNG', color: 'red' },
                                            { label: 'NG Point', key: 'totalNGPoint', color: 'purple', dynamicVal: (dList) => (dList || []).reduce((sum, item) => sum + Number(item.qty || 0), 0) },
                                            { label: 'Scrap', key: 'totalScrap', color: 'orange' },
                                            { label: 'Efisiensi', key: 'efficiency', color: 'sky', suffix: '%', isStaticDisplay: true, dynamicVal: (_, sumData) => sumData?.efficiency > 0 ? Number(sumData.efficiency).toFixed(1) : '-' },
                                            { label: 'Chokoritsu', key: 'chokoritsu', color: 'teal', suffix: '%', isStaticDisplay: true, dynamicVal: (dList, sumData) => sumData?.totalProduksi > 0 ? ((sumData.totalOK / sumData.totalProduksi) * 100).toFixed(1) : '-' }
                                        ].map(field => {
                                            const srcData = detailModal.mode === 'edit' ? modalEditData?.summary : detailModal.data?.summary;
                                            const detailsList = detailModal.mode === 'edit' ? modalEditData?.details : detailModal.data?.details;
                                            
                                            let val;
                                            if (field.dynamicVal) {
                                                val = field.dynamicVal(detailsList, srcData);
                                            } else {
                                                val = srcData?.[field.key] ?? 0;
                                            }
                                            
                                            const isReadOnly = detailModal.mode === 'view' || field.isStaticDisplay || field.key === 'totalNGPoint';
                                            const colorMap = { 
                                                blue: 'border-blue-200 text-blue-700', 
                                                emerald: 'border-emerald-200 text-emerald-700', 
                                                red: 'border-red-200 text-red-700', 
                                                purple: 'border-purple-200 text-purple-700', 
                                                orange: 'border-orange-200 text-orange-700',
                                                sky: 'border-sky-200 text-sky-700',
                                                teal: 'border-teal-200 text-teal-700'
                                            };
                                            return (
                                                <div key={field.key} className={`bg-white rounded-xl border ${colorMap[field.color]} p-3 text-center`}>
                                                    <label className="block text-[8px] font-black uppercase tracking-wider opacity-60 mb-1">{field.label}</label>
                                                    {isReadOnly ? (
                                                        <div className="text-lg font-black">{val}{field.suffix || ''}</div>
                                                    ) : (
                                                        <input type="number" value={val} 
                                                            onChange={(e) => {
                                                                const intVal = parseInt(e.target.value) || 0;
                                                                const newSum = { ...modalEditData.summary, [field.key]: intVal };
                                                                setModalEditData({ ...modalEditData, summary: newSum });
                                                            }}
                                                            className="w-full text-center text-lg font-black outline-none bg-transparent" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Details Table */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-table-list text-amber-400"></i> Detail Defect
                                        </h4>
                                        {detailModal.mode === 'edit' && (
                                            <button onClick={() => {
                                                const newDetails = [...(modalEditData?.details || [])];
                                                newDetails.push({ checkNo: String(newDetails.length + 1), problem: '', defectCode: '', qty: 1, location: null, pageIndex: 0 });
                                                setModalEditData({ ...modalEditData, details: newDetails });
                                            }} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[9px] font-black flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
                                                <i className="fas fa-plus-circle text-[9px]"></i> Tambah Baris
                                            </button>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="text-[9px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                    <th className="py-2 px-2">Check No</th>
                                                    <th className="py-2 px-2">Problem</th>
                                                    <th className="py-2 px-2">Defect Code</th>
                                                    <th className="py-2 px-2 text-center">Qty</th>
                                                    {detailModal.mode === 'edit' && <th className="py-2 px-2 text-center">Aksi</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const list = detailModal.mode === 'edit' ? modalEditData?.details : getGroupedDetails(detailModal.data?.details);
                                                    if (!list || list.length === 0) {
                                                        return (
                                                            <tr><td colSpan={detailModal.mode === 'edit' ? 5 : 4} className="text-center py-8 text-xs font-bold text-slate-400">
                                                                <i className="fas fa-inbox text-xl block mb-2 text-slate-200"></i>
                                                                Tidak ada data NG (All OK)
                                                            </td></tr>
                                                        );
                                                    }
                                                    return list.map((d, idx) => {
                                                        const isReadOnly = detailModal.mode === 'view';
                                                        return (
                                                            <tr key={idx} className="border-b border-slate-100 text-xs hover:bg-white/50 transition-colors">
                                                                <td className="py-2 px-2">
                                                                    {isReadOnly ? (
                                                                        <span className="font-black text-slate-700">{d.checkNo || '-'}</span>
                                                                    ) : (
                                                                        <input type="text" value={d.checkNo || ''} 
                                                                            onChange={(e) => {
                                                                                const newD = [...modalEditData.details];
                                                                                newD[idx] = { ...newD[idx], checkNo: e.target.value };
                                                                                setModalEditData({ ...modalEditData, details: newD });
                                                                            }}
                                                                            className="w-10 bg-white px-2 py-1 rounded-lg border border-slate-200 text-center font-black text-xs outline-none focus:border-blue-300" />
                                                                    )}
                                                                </td>
                                                                <td className="py-2 px-2">
                                                                    {isReadOnly ? (
                                                                        <span className="font-semibold text-slate-600">{d.problem || '-'}</span>
                                                                    ) : (
                                                                        <input type="text" value={d.problem || ''} 
                                                                            onChange={(e) => {
                                                                                const newD = [...modalEditData.details];
                                                                                newD[idx] = { ...newD[idx], problem: e.target.value };
                                                                                setModalEditData({ ...modalEditData, details: newD });
                                                                            }}
                                                                            className="w-full min-w-[120px] bg-white px-2 py-1 rounded-lg border border-slate-200 font-semibold text-xs outline-none focus:border-blue-300" />
                                                                    )}
                                                                </td>
                                                                <td className="py-2 px-2">
                                                                    {isReadOnly ? (
                                                                        <span className="inline-block bg-slate-100 px-2 py-0.5 rounded font-black text-xs">{d.defectCode || '-'}</span>
                                                                    ) : (
                                                                        <input type="text" value={d.defectCode || ''} 
                                                                            onChange={(e) => {
                                                                                const newD = [...modalEditData.details];
                                                                                newD[idx] = { ...newD[idx], defectCode: e.target.value.toUpperCase() };
                                                                                setModalEditData({ ...modalEditData, details: newD });
                                                                            }}
                                                                            className="w-12 bg-white px-2 py-1 rounded-lg border border-slate-200 text-center font-black text-xs outline-none focus:border-blue-300" />
                                                                    )}
                                                                </td>
                                                                <td className="py-2 px-2 text-center">
                                                                    {isReadOnly ? (
                                                                        <span className="font-bold text-slate-700">{d.qty || 0}</span>
                                                                    ) : (
                                                                        <input type="number" value={d.qty || 0} 
                                                                            onChange={(e) => {
                                                                                const newD = [...modalEditData.details];
                                                                                newD[idx] = { ...newD[idx], qty: parseInt(e.target.value) || 0 };
                                                                                setModalEditData({ ...modalEditData, details: newD });
                                                                            }}
                                                                            className="w-14 bg-white px-2 py-1 rounded-lg border border-slate-200 text-center font-black text-xs outline-none focus:border-blue-300" />
                                                                    )}
                                                                </td>
                                                                {detailModal.mode === 'edit' && (
                                                                    <td className="py-2 px-2 text-center">
                                                                        <button onClick={() => {
                                                                            const newD = modalEditData.details.filter((_, i) => i !== idx);
                                                                            setModalEditData({ ...modalEditData, details: newD });
                                                                        }} className="text-red-400 hover:text-red-600 transition-colors" title="Hapus baris">
                                                                            <i className="fas fa-trash-alt text-[9px]"></i>
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <i className="fas fa-note-sticky text-slate-400"></i> Catatan
                                    </h4>
                                    {detailModal.mode === 'view' ? (
                                        <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 min-h-[60px] whitespace-pre-wrap">
                                            {detailModal.data.notes || 'Tidak ada catatan.'}
                                        </div>
                                    ) : (
                                        <textarea value={modalEditData?.notes || ''} 
                                            onChange={(e) => setModalEditData({ ...modalEditData, notes: e.target.value })}
                                            className="w-full bg-white px-4 py-3 rounded-xl border-2 border-blue-200 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 min-h-[80px]"
                                            placeholder="Tulis catatan..." />
                                    )}
                                </div>

                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <p className="text-slate-400 font-medium">Gagal memuat data.</p>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="shrink-0 border-t border-slate-100 bg-slate-50 p-4 flex justify-between items-center rounded-b-[2.5rem]">
                            <div>
                                {detailModal.mode === 'edit' && detailModal.data?.meta?.id && (
                                    <button onClick={async () => {
                                        if (!confirm("Apakah Anda yakin ingin menghapus record ini secara permanen?")) return;
                                        try {
                                            const res = await fetch(`${api_url}/api/delete/${detailModal.data.meta.id}`);
                                            const result = await res.json();
                                            if (result.status === 'success') {
                                                setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null });
                                                setModalEditData(null);
                                                fetchDatabaseRecords(currentPage);
                                            } else {
                                                alert("Gagal menghapus: " + result.message);
                                            }
                                        } catch (e) { alert("Error: " + e.message); }
                                    }} className="bg-red-600 text-white px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-red-700 transition-colors">
                                        <i className="fas fa-trash-alt text-[9px]"></i> Hapus Record
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null }); setModalEditData(null); }}
                                    className="bg-slate-200 text-slate-600 px-5 py-2 rounded-xl text-[10px] font-black hover:bg-slate-300 transition-colors">
                                    {detailModal.mode === 'edit' ? 'Batal' : 'Tutup'}
                                </button>
                                {detailModal.mode === 'edit' && (
                                    <button onClick={async () => {
                                        if (!modalEditData?.meta || !modalEditData?.summary) {
                                            alert("Data tidak lengkap."); return;
                                        }
                                        const detailsList = modalEditData.details || [];
                                        const calculatedNGPoint = detailsList.reduce((sum, item) => sum + Number(item.qty || 0), 0);
                                        const payload = {
                                            meta: modalEditData.meta,
                                            summary: {
                                                ...modalEditData.summary,
                                                totalNGPoint: calculatedNGPoint
                                            },
                                            details: detailsList,
                                            notes: modalEditData.notes || ''
                                        };
                                        try {
                                            const res = await fetch(`${api_url}/api/records/${detailModal.data.meta.id}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(payload)
                                            });
                                            const result = await res.json();
                                            if (result.status === 'success') {
                                                setDetailModal({ open: false, mode: 'view', loading: false, record: null, data: null });
                                                setModalEditData(null);
                                                fetchDatabaseRecords(currentPage);
                                            } else {
                                                alert("Gagal menyimpan: " + result.message);
                                            }
                                        } catch (e) { alert("Error: " + e.message); }
                                    }} className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">
                                        <i className="fas fa-save text-[9px]"></i> Simpan
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
window.DatabaseTab = DatabaseTab;
