function ScanQueueView({
    selectedFiles,
    setSelectedFiles,
    isUploading,
    drafts,
    fileInputRef,
    handleBatchUpload,
    handleStartAnalysis,
    handleUpdateFileParam,
    handleOpenDraft,
    handleDeleteDraft,
    handleRetryDraft,
    setScanResult,
    handleOpenCropperForFile
}) {
    return (
        <div className="flex flex-col gap-8">
            {selectedFiles.length === 0 ? (
                <div className="max-w-3xl mx-auto w-full">
                    <div className="bg-white border border-slate-200 rounded-[2rem] shadow-xl overflow-hidden">
                        <div className="bg-slate-800 p-8 text-white text-center">
                            <h2 className="text-2xl font-bold mb-2">Mulai Pemeriksaan QC</h2>
                            <p className="text-slate-400 text-sm">Pilih metode input data untuk memulai pengecekan.</p>
                        </div>
                        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="group bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 text-center hover:border-blue-500 hover:bg-white transition-all cursor-pointer flex flex-col items-center" onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'; input.onchange = handleBatchUpload; input.click(); }}>
                                <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><i className="fas fa-camera text-2xl"></i></div>
                                <h3 className="font-bold text-slate-800 text-lg">Foto CS</h3>
                                <p className="text-slate-500 text-xs mt-2">Ambil foto langsung dari kamera HP.</p>
                            </div>
                            <div className="group bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 text-center hover:border-blue-500 hover:bg-white transition-all cursor-pointer flex flex-col items-center" onClick={() => fileInputRef.current?.click()}>
                                <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><i className="fas fa-file-upload text-2xl"></i></div>
                                <h3 className="font-bold text-slate-800 text-lg">Upload CS</h3>
                                <p className="text-slate-500 text-xs mt-2">Pilih file dari galeri atau folder.</p>
                            </div>
                            <div className="group bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-6 text-center hover:border-emerald-500 hover:bg-white transition-all cursor-pointer flex flex-col items-center" onClick={() => setScanResult({ meta: { partName: "", partNumber: "", model: "", date: new Date().toISOString().split('T')[0], nama: "", shift: "" }, summary: { totalProduksi: 0, totalOK: 0, totalNG: 0, totalNGPoint: 0, totalScrap: 0 }, details: [], notes: "" })}>
                                <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><i className="fas fa-keyboard text-2xl"></i></div>
                                <h3 className="font-bold text-slate-800 text-lg">Input Manual</h3>
                                <p className="text-slate-500 text-xs mt-2">Ketik data secara manual tanpa scan.</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-slate-800 text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <h3 className="font-bold flex items-center gap-2"><i className="fas fa-images"></i> Review Foto ({selectedFiles.length})</h3>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            <button onClick={() => setSelectedFiles([])} className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all">Batal</button>
                            <button onClick={() => handleStartAnalysis('combined')} disabled={isUploading} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 disabled:bg-slate-600 transition-all" title="Gabung semua foto menjadi 1 dokumen Scan">{isUploading ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-object-group"></i>} Gabung & Scan</button>
                            <button onClick={() => handleStartAnalysis('separate')} disabled={isUploading} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 disabled:bg-slate-600 transition-all" title="Setiap foto dianggap sebagai dokumen Scan terpisah">{isUploading ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-layer-group"></i>} Scan Terpisah</button>
                        </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {selectedFiles.map(item => (
                            <div key={item.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden group relative flex flex-col shadow-sm hover:shadow-md transition-all">
                                <div className="aspect-[3/4] bg-black relative overflow-hidden flex items-center justify-center">
                                    <img src={item.preview} className="max-w-full max-h-full object-contain transition-all duration-300" style={{ filter: `brightness(${item.brightness}%) contrast(${item.contrast}%)`, transform: `rotate(${item.rotation}deg)` }} />
                                    <button onClick={() => setSelectedFiles(prev => prev.filter(f => f.id !== item.id))} className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-all z-10 shadow-sm" title="Hapus Foto"><i className="fas fa-times text-xs"></i></button>
                                    
                                    {/* Crop/Warp Perspective Button */}
                                    <button onClick={() => handleOpenCropperForFile(item)} className="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all shadow-lg hover:scale-105 active:scale-95 duration-200 z-10" title="Ratakan & Potong Perspektif"><i className="fas fa-crop-alt text-xs"></i></button>
                                </div>
                                <div className="p-2 space-y-2 bg-white">
                                    <div className="flex items-center justify-between gap-1">
                                        <button onClick={() => handleUpdateFileParam(item.id, 'rotation', (item.rotation - 90) % 360)} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-rotate-left text-[10px]"></i></button>
                                        <div className="flex-1 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg"><i className="fas fa-sun text-[10px] text-slate-400"></i><input type="range" min="50" max="200" value={item.brightness} onChange={(e) => handleUpdateFileParam(item.id, 'brightness', e.target.value)} className="flex-1 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer" /></div>
                                        <button onClick={() => handleUpdateFileParam(item.id, 'rotation', (item.rotation + 90) % 360)} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-rotate-right text-[10px]"></i></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Foto CS Button */}
                        <div onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.capture = 'environment';
                            input.onchange = handleBatchUpload;
                            input.click();
                        }} className="border-2 border-dashed border-slate-300 rounded-2xl aspect-[3/4] flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer transition-all group shadow-sm">
                            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-2 transition-all"><i className="fas fa-camera text-slate-500"></i></div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-center px-1">Foto CS</span>
                        </div>
                        
                        {/* Upload CS Button */}
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl aspect-[3/4] flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer transition-all group shadow-sm">
                            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-2 transition-all"><i className="fas fa-file-upload text-slate-500"></i></div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-center px-1">Upload CS</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-9 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
                    <div className="bg-emerald-600 px-8 py-5 flex justify-between items-center text-white">
                        <h3 className="font-black tracking-tight flex items-center gap-3"><i className="fas fa-clipboard-check text-xl"></i> SIAP DIPERIKSA</h3>
                        <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">{drafts.filter(d => d.status === 'ready').length} Items</div>
                    </div>
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left min-h-[150px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                                    <th className="px-6 py-4">Draft #</th>
                                    <th className="px-6 py-4">Part Info</th>
                                    <th className="px-6 py-4">Timestamp Scan</th>
                                    <th className="px-6 py-4 text-center">Confidence AI</th>
                                    <th className="px-6 py-4 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {drafts.filter(d => d.status === 'ready').map(draft => {
                                    let sd = {}; try { sd = typeof draft.scan_data === 'string' ? JSON.parse(draft.scan_data) : (draft.scan_data || {}); } catch (e) { }
                                    const formatTimestamp = (dateStr) => {
                                        if (!dateStr) return '-';
                                        const d = new Date(dateStr);
                                        if (isNaN(d.getTime())) return '-';
                                        const pad = (n) => String(n).padStart(2, '0');
                                        return `${d.toLocaleDateString('id-ID')} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                    };
                                    return (
                                        <tr key={draft.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4"><span className="bg-slate-100 group-hover:bg-blue-100 text-slate-600 group-hover:text-blue-600 px-2 py-1 rounded font-black text-[10px]">#{draft.id}</span></td>
                                            <td className="px-6 py-4"><div className="font-bold text-slate-700 text-xs">{sd.meta?.partNumber || '-'}</div><div className="text-[9px] text-slate-400 font-bold uppercase">{sd.meta?.partName || 'Unknown Part'}</div></td>
                                            <td className="px-6 py-4"><div className="text-[10px] text-slate-600 font-bold">{formatTimestamp(draft.created_at)}</div></td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2.5 py-1 rounded-full font-black text-[10px] ${
                                                    sd.summary?.confidenceScore !== undefined 
                                                        ? (Number(sd.summary.confidenceScore) >= 90 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200')
                                                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                                                }`}>
                                                    {sd.summary?.confidenceScore !== undefined ? `${sd.summary.confidenceScore}%` : '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4"><div className="flex justify-center gap-2"><button onClick={() => handleOpenDraft(draft)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg">REVIEW</button><button onClick={(e) => handleDeleteDraft(draft.id, e)} className="w-7 h-7 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg flex items-center justify-center transition-all"><i className="fas fa-trash-alt text-[10px]"></i></button></div></td>
                                        </tr>
                                    );
                                })}
                                {drafts.filter(d => d.status === 'ready').length === 0 && <tr><td colSpan="5" className="px-8 py-20 text-center text-slate-300 italic font-medium">Kosong</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-3 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
                    <div className="bg-slate-800 px-8 py-5 flex justify-between items-center text-white">
                        <h3 className="font-black tracking-tight flex items-center gap-3 uppercase"><i className="fas fa-cog fa-spin text-xl text-blue-400"></i> Sedang Diproses</h3>
                        <div className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">{drafts.filter(d => d.status !== 'ready').length} Queue</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[150px]">
                        {drafts.filter(d => d.status !== 'ready').map(draft => (
                            <div key={draft.id} className={`flex items-center gap-4 p-4 rounded-2xl border group ${draft.status === 'error' ? 'bg-red-50 border-red-100' : 'bg-slate-50/50 border-slate-100'}`}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${draft.status === 'error' ? 'bg-white text-red-500' : 'bg-white text-blue-500'}`}>
                                    <i className={`fas ${draft.status === 'processing' ? 'fa-sync fa-spin' : (draft.status === 'error' ? 'fa-exclamation-triangle' : 'fa-hourglass-start text-slate-300')}`}></i>
                                </div>
                                <div className="flex-1">
                                    <p className={`font-black text-xs ${draft.status === 'error' ? 'text-red-800' : 'text-slate-800'}`}>DRAFT #{draft.id}</p>
                                    <p className={`text-[9px] font-bold uppercase tracking-tight ${draft.status === 'error' ? 'text-red-500' : 'text-slate-400'}`}>
                                        {draft.status === 'processing' ? '🤖 Menganalisa Dokumen...' : (draft.status === 'error' ? `❌ Gagal: ${draft.error_message || 'AI Error'}` : '⏳ Menunggu Antrean AI')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {draft.status === 'error' && (
                                        <button onClick={(e) => handleRetryDraft(draft.id, e)} className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all" title="Coba Lagi (Retry)">
                                            <i className="fas fa-redo-alt text-xs"></i>
                                        </button>
                                    )}
                                    <button onClick={(e) => handleDeleteDraft(draft.id, e)} className="text-slate-300 hover:text-red-500 p-2"><i className="fas fa-times"></i></button>
                                </div>
                            </div>
                        ))}
                        {drafts.filter(d => d.status !== 'ready').length === 0 && <p className="text-center py-12 text-slate-300 italic text-xs uppercase tracking-widest font-black">Antrean Kosong</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

window.ScanQueueView = ScanQueueView;
