function getNormalizedRecord(record) {
    if (!record) return null;
    let fullResult = { 
        ...record,
        meta: record.meta ? { ...record.meta } : {}
    };
    if (!fullResult.details) fullResult.details = [];
    
    if (fullResult.meta && fullResult.meta.date) {
        let rawDate = fullResult.meta.date;
        if (typeof rawDate === 'string') {
            if (rawDate.includes('T')) {
                fullResult.meta.date = rawDate.split('T')[0];
            } else if (rawDate.includes(' ')) {
                fullResult.meta.date = rawDate.split(' ')[0];
            }
        } else {
            const dObj = new Date(rawDate);
            if (!isNaN(dObj.getTime())) {
                const year = dObj.getFullYear();
                const month = String(dObj.getMonth() + 1).padStart(2, '0');
                const day = String(dObj.getDate()).padStart(2, '0');
                fullResult.meta.date = `${year}-${month}-${day}`;
            }
        }
    }
    return fullResult;
}

function ScanTab({
    api_url,
    script_url,
    onSaveSuccess,
    initialScanResult = null,
    isViewingDbRecord = false,
    dbIsEditMode = false,
    onClose,
    onDraftsCountChange
}) {
    // Local States
    const [drafts, setDrafts] = React.useState([]);
    const [isUploading, setIsUploading] = React.useState(false);
    const [activeDraftId, setActiveDraftId] = React.useState(null);
    const [selectedFiles, setSelectedFiles] = React.useState([]);
    const [scanResult, setScanResult] = React.useState(() => getNormalizedRecord(initialScanResult));
    const [imagePreview, setImagePreview] = React.useState(null);
    const [isReviewMode, setIsReviewMode] = React.useState(false);
    const [isEditMode, setIsEditMode] = React.useState(false);
    const [isSavingToSheets, setIsSavingToSheets] = React.useState(false);
    const [modelUsed, setModelUsed] = React.useState(null);
    const [errorMessage, setErrorMessage] = React.useState(null);
    const [isViewingRecord, setIsViewingRecord] = React.useState(isViewingDbRecord);
    const [showGuidance, setShowGuidance] = React.useState(false);
    const [manualMode, setManualMode] = React.useState(true);
    const isReadOnly = isViewingRecord && !isEditMode;

    // Perspective Cropper States
    const [croppingQueue, setCroppingQueue] = React.useState([]);
    const [currentCroppingIndex, setCurrentCroppingIndex] = React.useState(0);
    const [isReCroppingId, setIsReCroppingId] = React.useState(null);

    // Visual Adjustment States
    const [zoomLevel, setZoomLevel] = React.useState(100);
    const [brightness, setBrightness] = React.useState(100);
    const [contrast, setContrast] = React.useState(100);
    const [rotation, setRotation] = React.useState(0);
    const [activeRowIndex, setActiveRowIndex] = React.useState(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [draggedIndex, setDraggedIndex] = React.useState(null);
    const [canDrag, setCanDrag] = React.useState(false);
    const [isFullVisualMode, setIsFullVisualMode] = React.useState(false);
    const [editingRowIdx, setEditingRowIdx] = React.useState(null);

    // Suggestion & Guidance States
    const [problemSuggestions, setProblemSuggestions] = React.useState([]);
    const [activeSuggestionRow, setActiveSuggestionRow] = React.useState(null);
    const [activeGuidanceRow, setActiveGuidanceRow] = React.useState(null);
    const [showPartSuggestions, setShowPartSuggestions] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");

    // Master Data Overlay States (Heatmap)
    const [masterImagePreview, setMasterImagePreview] = React.useState(null);
    const [masterPoints, setMasterPoints] = React.useState([]);
    const [masterParts, setMasterParts] = React.useState([]);

    // Refs
    const fileInputRef = React.useRef(null);
    const manualFileInputRef = React.useRef(null);
    const imageContainerRef = React.useRef(null);
    const dragStart = React.useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const touchStartDist = React.useRef(0);
    const touchStartZoom = React.useRef(100);
    const touchCenterX = React.useRef(0);
    const touchCenterY = React.useRef(0);
    const pinchRatioX = React.useRef(0);
    const pinchRatioY = React.useRef(0);
    const scrollWidthStart = React.useRef(0);
    const scrollHeightStart = React.useRef(0);
    const debounceTimeoutRef = React.useRef(null);

    // Initial Load & Polling
    React.useEffect(() => {
        fetchDrafts();
        fetchMasterParts();
        const interval = setInterval(fetchDrafts, 5000);
        
        const handleGlobalClick = (e) => {
            // Close suggestions if clicking outside
            if (!e.target.closest('.suggestion-container')) {
                setActiveSuggestionRow(null);
                setActiveGuidanceRow(null);
                setShowPartSuggestions(false);
            }
        };
        window.addEventListener('click', handleGlobalClick);

        return () => {
            clearInterval(interval);
            window.removeEventListener('click', handleGlobalClick);
        };
    }, []);

    // Handle initial scan result from props (Database Tab)
    React.useEffect(() => {
        const loadInitialData = async () => {
            if (initialScanResult) {
                let fullResult = getNormalizedRecord(initialScanResult);
                
                setScanResult(fullResult);
                setIsViewingRecord(isViewingDbRecord);
                setIsEditMode(dbIsEditMode);
                setManualMode(false);

                const rawPath = fullResult.image_path;
                let images = [];
                try {
                    const parsed = JSON.parse(rawPath);
                    images = Array.isArray(parsed) ? parsed : [rawPath];
                } catch (e) {
                    images = rawPath ? [rawPath] : [];
                }

                if (images.length > 1) {
                    setImagePreview(images.map(img => `${api_url}/` + img));
                } else if (images.length === 1) {
                    setImagePreview(`${api_url}/` + images[0]);
                } else {
                    setImagePreview(null);
                }
                setIsReviewMode(images.length > 0);
            }
        };
        loadInitialData();
    }, [initialScanResult, isViewingDbRecord, dbIsEditMode, api_url]);

    // Auto-update NG Point when details change
    React.useEffect(() => {
        if (scanResult && scanResult.details) {
            const total = scanResult.details.reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);
            if (scanResult.summary && total !== scanResult.summary.totalNGPoint) {
                setScanResult(prev => ({
                    ...prev,
                    summary: { ...prev.summary, totalNGPoint: total }
                }));
            }
        }
    }, [scanResult?.details]);

    // Zoom wheel handler
    React.useEffect(() => {
        const container = imageContainerRef.current;
        if (!container) return;
        const handleWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                
                const zoomTarget = container.querySelector('#scan-zoom-container');
                if (!zoomTarget) return;

                // 1. Get current zoom level synchronously
                const currentZoom = zoomLevelRef.current;

                // 2. Calculate new zoom level
                const delta = e.deltaY > 0 ? -15 : 15;
                const newZoom = Math.min(400, Math.max(10, currentZoom + delta));

                if (newZoom === currentZoom) return;

                // 3. Clear any pending debounce timeouts to keep states in sync
                if (debounceTimeoutRef.current) {
                    clearTimeout(debounceTimeoutRef.current);
                }

                // 4. Disable transition for instant styling
                zoomTarget.style.transition = 'none';

                // 5. Get mouse position relative to the container viewport
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // 6. Get current scroll dimensions of the container
                const currentScrollWidth = container.scrollWidth;
                const currentScrollHeight = container.scrollHeight;

                // 7. Calculate position of mouse in current scroll space
                const scrollX = container.scrollLeft + mouseX;
                const scrollY = container.scrollTop + mouseY;

                // 8. Calculate proportional ratios relative to the current scrollable bounds
                const ratioX = currentScrollWidth > 0 ? scrollX / currentScrollWidth : 0.5;
                const ratioY = currentScrollHeight > 0 ? scrollY / currentScrollHeight : 0.5;

                // 9. Apply the new zoom level directly to DOM for 60fps responsiveness
                zoomTarget.style.width = `${newZoom}%`;

                // 10. Calculate new scroll dimensions mathematically to bypass browser layout reflow lag
                const factor = currentZoom > 0 ? newZoom / currentZoom : 1;
                const calculatedScrollWidth = currentScrollWidth * factor;
                const calculatedScrollHeight = currentScrollHeight * factor;

                // 11. Adjust scroll coordinates instantly to focus zoom on the mouse cursor
                const newScrollLeft = ratioX * calculatedScrollWidth - mouseX;
                const newScrollTop = ratioY * calculatedScrollHeight - mouseY;

                container.scrollLeft = newScrollLeft;
                container.scrollTop = newScrollTop;

                // 12. Update percent text label instantly
                const percentEl = document.querySelector('.zoom-percent-text');
                if (percentEl) {
                    percentEl.textContent = `${newZoom}%`;
                }

                // 13. Update sync ref
                zoomLevelRef.current = newZoom;

                // 14. Debounce React state update and transition restoration (150ms)
                debounceTimeoutRef.current = setTimeout(() => {
                    setZoomLevel(newZoom);
                    zoomTarget.style.transition = 'width 0.3s ease-in-out';
                }, 150);
            }
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [imagePreview]);

    // Keep track of current zoomLevel in a ref to avoid re-binding touch events constantly
    const zoomLevelRef = React.useRef(zoomLevel);
    React.useEffect(() => {
        zoomLevelRef.current = zoomLevel;
    }, [zoomLevel]);

    // Pinch-to-zoom touch handler for tablets/phones
    React.useEffect(() => {
        const container = imageContainerRef.current;
        if (!container) return;

        let activeScale = zoomLevelRef.current;
        let isPinching = false;

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                isPinching = true;
                
                // Clear any pending wheel/pinch debounces
                if (debounceTimeoutRef.current) {
                    clearTimeout(debounceTimeoutRef.current);
                }

                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                touchStartDist.current = dist;
                touchStartZoom.current = zoomLevelRef.current;
                activeScale = zoomLevelRef.current;

                const zoomTarget = container.querySelector('#scan-zoom-container');
                if (zoomTarget) {
                    zoomTarget.style.transition = 'none';
                    // Snap container width instantly and force a layout reflow
                    // to ensure scrollWidth and scrollHeight dimensions perfectly match zoomLevelRef.current
                    zoomTarget.style.width = `${zoomLevelRef.current}%`;
                    void zoomTarget.offsetHeight;
                }

                // Calculate pinch focal center in viewport coordinates
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                // Relative coordinates inside the scrollable container viewport
                const rect = container.getBoundingClientRect();
                const touchX = centerX - rect.left;
                const touchY = centerY - rect.top;

                // Store relative touch focal coordinates and scaling ratios
                touchCenterX.current = touchX;
                touchCenterY.current = touchY;

                // Capture starting dimensions of the scroll container to run mathematical scroll calculations
                scrollWidthStart.current = container.scrollWidth;
                scrollHeightStart.current = container.scrollHeight;

                // Calculate absolute coordinates in current scroll space
                const scrollX = container.scrollLeft + touchX;
                const scrollY = container.scrollTop + touchY;

                // Store proportional ratios of the focal point relative to the scrollable bounds
                pinchRatioX.current = scrollWidthStart.current > 0 ? scrollX / scrollWidthStart.current : 0.5;
                pinchRatioY.current = scrollHeightStart.current > 0 ? scrollY / scrollHeightStart.current : 0.5;
            }
        };

        const handleTouchMove = (e) => {
            if (e.touches.length === 2 && touchStartDist.current > 0) {
                e.preventDefault(); // Stop default browser zoom
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scale = dist / touchStartDist.current;
                const newZoom = Math.min(400, Math.max(10, Math.round(touchStartZoom.current * scale)));
                activeScale = newZoom;

                // Direct DOM updates for butter-smooth 60fps gesture response
                const zoomTarget = container.querySelector('#scan-zoom-container');
                if (zoomTarget) {
                    zoomTarget.style.width = `${newZoom}%`;

                    // Calculate the mathematical scroll dimensions to avoid browser layout reflow lag
                    const factor = touchStartZoom.current > 0 ? newZoom / touchStartZoom.current : 1;
                    const calculatedScrollWidth = scrollWidthStart.current * factor;
                    const calculatedScrollHeight = scrollHeightStart.current * factor;

                    // Adjust scroll coordinates instantly to focus zoom on the touch center
                    const newScrollLeft = pinchRatioX.current * calculatedScrollWidth - touchCenterX.current;
                    const newScrollTop = pinchRatioY.current * calculatedScrollHeight - touchCenterY.current;

                    container.scrollLeft = newScrollLeft;
                    container.scrollTop = newScrollTop;
                }
                const percentEl = document.querySelector('.zoom-percent-text');
                if (percentEl) {
                    percentEl.textContent = `${newZoom}%`;
                }
            }
        };

        const handleTouchEnd = (e) => {
            if (isPinching && e.touches.length < 2) {
                isPinching = false;
                touchStartDist.current = 0;
                
                // Sync with React state on touch end so final coordinate maps match
                setZoomLevel(activeScale);
                zoomLevelRef.current = activeScale; // Synchronous update to prevent successive gesture lag

                const zoomTarget = container.querySelector('#scan-zoom-container');
                if (zoomTarget) {
                    zoomTarget.style.transition = 'width 0.3s ease-in-out';
                }
            }
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [imagePreview]);

    const fetchDrafts = async () => {
        try {
            const response = await fetch(`${api_url}/api/drafts`);
            const result = await response.json();
            if (result.status === 'success') {
                setDrafts(result.data);
                if (onDraftsCountChange) {
                    onDraftsCountChange(result.data.filter(d => d.status === 'ready').length);
                }
            }
        } catch (error) {
            console.error("Fetch drafts error:", error);
        }
    };

    const handleDeleteDraft = async (id, e) => {
        if (e) e.stopPropagation();
        if (!confirm("Apakah Anda yakin ingin menghapus draft ini?")) return;
        try {
            const response = await fetch(`${api_url}/api/drafts/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status === 'success') fetchDrafts();
        } catch (error) {
            console.error("Delete draft error:", error);
        }
    };

    const fetchMasterParts = async () => {
        try {
            const res = await fetch(`${api_url}/api/master/parts`);
            const result = await res.json();
            if (result.status === 'success') setMasterParts(result.data);
        } catch (error) {
            console.error("Fetch master parts error:", error);
        }
    };

    const handleRetryDraft = async (id, e) => {
        if (e) e.stopPropagation();
        try {
            const response = await fetch(`${api_url}/api/drafts/retry/${id}`, { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') fetchDrafts();
        } catch (error) {
            console.error("Retry draft error:", error);
        }
    };

    const base64ToFile = (base64String, filename) => {
        const arr = base64String.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    };

    const handleOpenCropperForFile = (item) => {
        setCroppingQueue([item]);
        setCurrentCroppingIndex(0);
        setIsReCroppingId(item.id);
    };

    const handleCropperProcess = (warpedBase64) => {
        const currentFileItem = croppingQueue[currentCroppingIndex];
        if (!currentFileItem) return;

        const fileName = currentFileItem.file.name;
        const warpedFile = base64ToFile(warpedBase64, fileName);
        const warpedPreview = URL.createObjectURL(warpedFile);

        const processedItem = {
            ...currentFileItem,
            file: warpedFile,
            preview: warpedPreview,
            rotation: 0,
            brightness: 100,
            contrast: 100
        };

        if (isReCroppingId) {
            setSelectedFiles(prev => prev.map(f => f.id === isReCroppingId ? processedItem : f));
            setCroppingQueue([]);
            setIsReCroppingId(null);
        } else {
            setSelectedFiles(prev => [...prev, processedItem]);
            if (currentCroppingIndex + 1 < croppingQueue.length) {
                setCurrentCroppingIndex(prev => prev + 1);
            } else {
                setCroppingQueue([]);
            }
        }
    };

    const handleCropperCancel = () => {
        if (isReCroppingId) {
            setCroppingQueue([]);
            setIsReCroppingId(null);
        } else {
            const currentFileItem = croppingQueue[currentCroppingIndex];
            if (currentFileItem) {
                setSelectedFiles(prev => [...prev, currentFileItem]);
            }
            if (currentCroppingIndex + 1 < croppingQueue.length) {
                setCurrentCroppingIndex(prev => prev + 1);
            } else {
                setCroppingQueue([]);
            }
        }
    };

    const handleBatchUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const newSelected = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file: file,
            preview: URL.createObjectURL(file),
            brightness: 100,
            contrast: 100,
            rotation: 0
        }));
        
        setCroppingQueue(newSelected);
        setCurrentCroppingIndex(0);
        setIsReCroppingId(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleManualPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsSavingToSheets(true);
        setErrorMessage(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${api_url}/api/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.status === 'success') {
                setImagePreview(`${api_url}/${result.imagePath}`);
                setScanResult(prev => ({
                    ...prev,
                    image_path: result.imagePath
                }));
            } else {
                throw new Error(result.message || "Gagal mengupload file");
            }
        } catch (error) {
            setErrorMessage("Gagal upload foto manual: " + error.message);
        } finally {
            setIsSavingToSheets(false);
            if (manualFileInputRef.current) manualFileInputRef.current.value = "";
        }
    };

    const handleRemoveManualPhoto = () => {
        setImagePreview(null);
        setScanResult(prev => ({
            ...prev,
            image_path: null
        }));
    };


    const handleUpdateFileParam = (id, param, value) => {
        setSelectedFiles(prev => prev.map(f => f.id === id ? { ...f, [param]: value } : f));
    };

    const handleStartAnalysis = async (mode = 'separate') => {
        if (selectedFiles.length === 0) return;
        setIsUploading(true);
        setErrorMessage(null);
        try {
            const formData = new FormData();
            formData.append('mode', mode);
            const processedBlobs = await Promise.all(selectedFiles.map(async (item) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const is90or270 = (item.rotation / 90) % 2 !== 0;
                        const width = is90or270 ? img.height : img.width;
                        const height = is90or270 ? img.width : img.height;
                        canvas.width = width;
                        canvas.height = height;
                        ctx.save();
                        ctx.translate(width / 2, height / 2);
                        ctx.rotate((item.rotation * Math.PI) / 180);
                        if (ctx.filter !== undefined) {
                            ctx.filter = `brightness(${item.brightness}%) contrast(${item.contrast || 100}%)`;
                        }
                        ctx.drawImage(img, -img.width / 2, -img.height / 2);
                        ctx.restore();
                        canvas.toBlob((blob) => resolve({ blob, name: item.file.name }), 'image/jpeg', 0.9);
                    };
                    img.src = item.preview;
                });
            }));
            processedBlobs.forEach(item => formData.append('files', item.blob, item.name));
            const response = await fetch(`${api_url}/api/upload-batch`, { method: 'POST', body: formData });
            const result = await response.json();
            if (result.status === 'success') {
                setSelectedFiles([]);
                fetchDrafts();
            } else throw new Error(result.message);
        } catch (error) {
            setErrorMessage("Gagal memproses gambar: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleOpenDraft = (draft) => {
        if (draft.status !== 'ready') return;
        let scanData = {};
        try { scanData = typeof draft.scan_data === 'string' ? JSON.parse(draft.scan_data) : draft.scan_data; } catch (e) { }
        if (!scanData.meta) scanData.meta = { partName: "", partNumber: "", model: "", date: draft.created_at?.split('T')[0] || "", nama: "", shift: "", linePos: "" };
        if (!scanData.summary) scanData.summary = { totalProduksi: 0, totalOK: 0, totalNG: 0, totalNGPoint: 0, totalScrap: 0 };
        if (!scanData.details) scanData.details = [];

        setScanResult(scanData);
        let images = [];
        try { const parsed = JSON.parse(draft.image_path); images = Array.isArray(parsed) ? parsed : [draft.image_path]; } catch (e) { images = [draft.image_path]; }
        setImagePreview(images.length > 1 ? images.map(img => `${api_url}/` + img) : `${api_url}/` + images[0]);
        setActiveDraftId(draft.id);
        setModelUsed(draft.model_used);
        setIsViewingRecord(false);
        setIsReviewMode(true);
        setErrorMessage(null);
    };

    const handleZoomToPoint = (item, idx) => {
        setActiveRowIndex(idx);
        setZoomLevel(150);
        if (item.location && imageContainerRef.current) {
            setTimeout(() => {
                const loc = typeof item.location === 'string' ? JSON.parse(item.location) : item.location;
                if (!Array.isArray(loc)) return; // safe guard for voice coordinates
                const [ymin, xmin, ymax, xmax] = loc.map(Number);
                const container = imageContainerRef.current;
                const scrollWidth = container.scrollWidth;
                const scrollHeight = container.scrollHeight;
                const centerX = (xmin + xmax) / 20;
                const centerY = (ymin + ymax) / 20;
                const pageIndex = item.pageIndex !== undefined ? Number(item.pageIndex) : 0;
                const totalPages = Array.isArray(imagePreview) ? imagePreview.length : 1;
                const pageHeight = scrollHeight / totalPages;
                container.scrollTo({
                    left: (centerX / 100) * scrollWidth - container.clientWidth / 2,
                    top: (pageIndex * pageHeight) + (centerY / 100) * pageHeight - container.clientHeight / 2,
                    behavior: 'smooth'
                });
            }, 300);
        }
    };

    const handleUpdateDraft = async () => {
        if (!activeDraftId) return;
        setIsSavingToSheets(true);
        try {
            const response = await fetch(`${api_url}/api/drafts/${activeDraftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scanResult)
            });
            const result = await response.json();
            if (result.status === 'success') alert("Progress Draft Berhasil Disimpan!");
        } catch (error) { alert("Gagal update draft: " + error.message); } finally { setIsSavingToSheets(false); }
    };

    const handleApproveDraft = async () => {
        setIsSavingToSheets(true);
        setErrorMessage(null);
        try {
            let response;
            if (activeDraftId) {
                // Gunakan endpoint khusus approve draft agar image_path & line_pos otomatis dipindahkan di server
                response = await fetch(`${api_url}/api/drafts/approve/${activeDraftId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(scanResult)
                });
            } else {
                // Fallback untuk manual input
                response = await fetch(`${api_url}/api/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(scanResult)
                });
            }
            
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            if (script_url) {
                const flatRows = window.AppUtils.getFlatRows(scanResult);
                fetch(script_url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'save', rows: flatRows }), headers: { 'Content-Type': 'application/json' } });
            }
            onSaveSuccess();
            handleReset();
        } catch (error) { setErrorMessage("Gagal menyimpan data: " + error.message); } finally { setIsSavingToSheets(false); }
    };

    const handleUpdateRecord = async () => {
        setIsSavingToSheets(true);
        try {
            const response = await fetch(`${api_url}/api/records/${scanResult.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scanResult) });
            const result = await response.json();
            if (result.status === 'success') { onSaveSuccess(); handleReset(); } else throw new Error(result.message);
        } catch (error) { setErrorMessage("Gagal update record: " + error.message); } finally { setIsSavingToSheets(false); }
    };

    const handleReset = () => {
        setImagePreview(null);
        setScanResult(null);
        setActiveDraftId(null);
        setModelUsed(null);
        setErrorMessage(null);
        setIsViewingRecord(false);
        setIsReviewMode(false);
        setIsEditMode(false);
        setManualMode(true);
        setZoomLevel(100);
        if (onClose) onClose();
    };

    // Group identical (checkNo, problem) in view mode
    const groupedDetails = React.useMemo(() => {
        if (!scanResult?.details || scanResult.details.length === 0) return [];
        if (!isViewingRecord || isEditMode) return scanResult.details.map(d => ({ ...d, _groupCount: 1, _groupIdx: null }));
        const map = {};
        scanResult.details.forEach((d, i) => {
            const key = `${d.checkNo || ''}|${(d.problem || '').toLowerCase().trim()}`;
            if (!map[key]) {
                map[key] = { ...d, _groupCount: 1, _groupIdx: i };
            } else {
                map[key]._groupCount += 1;
                map[key].qty = (map[key].qty || 1) + (d.qty || 1);
            }
        });
        return Object.values(map).sort((a, b) => a._groupIdx - b._groupIdx);
    }, [scanResult?.details, isViewingRecord, isEditMode]);

    const handleMetaChange = (field, value) => { setScanResult({ ...scanResult, meta: { ...scanResult.meta, [field]: value } }); };
    const handleSummaryChange = (field, value) => { setScanResult({ ...scanResult, summary: { ...scanResult.summary, [field]: parseInt(value) || 0 } }); };

    const handleDetailChange = (index, field, value) => {
        const newDetails = [...scanResult.details];
        newDetails[index][field] = field === 'qty' ? (parseInt(value) || 0) : value;
        
        // Auto-update defect code whenever problem changes
        if (field === 'problem') {
            const lowProblem = value.toLowerCase().trim();
            let matchedCode = ""; 
            
            if (lowProblem !== "") {
                matchedCode = "M"; // Default to Others if there's text but no match
                for (const [key, code] of Object.entries(window.DEFECT_MAP)) {
                    if (lowProblem.includes(key)) { matchedCode = code; break; }
                }
            }
            newDetails[index].defectCode = matchedCode;
        }

        // Auto-Correction / Reset confidence when edited
        if (newDetails[index].confidence !== undefined && newDetails[index].confidence < 100) {
            newDetails[index].confidence = 100;
            newDetails[index].lowConfidenceReason = "";
        }

        setScanResult({ ...scanResult, details: newDetails });
    };

    const addDetailRow = () => { 
        setScanResult({ 
            ...scanResult, 
            details: [...scanResult.details, { 
                pointCheck: "Robot Welding", 
                checkNo: "", 
                problem: "", 
                defectCode: "", 
                qty: 1,
                confidence: 100,
                lowConfidenceReason: ""
            }] 
        }); 
    };
    
    const removeDetailRow = (index) => { setScanResult({ ...scanResult, details: scanResult.details.filter((_, i) => i !== index) }); };

    const insertDetailRow = (index) => {
        const newDetails = [...scanResult.details];
        const currentCheckNo = newDetails[index]?.checkNo || "";
        newDetails.splice(index + 1, 0, {
            pointCheck: "Robot Welding",
            checkNo: currentCheckNo,
            problem: "",
            defectCode: "",
            qty: 1,
            confidence: 100,
            lowConfidenceReason: ""
        });
        setScanResult({ ...scanResult, details: newDetails });
    };

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const newDetails = [...scanResult.details];
        const draggedItem = newDetails[draggedIndex];
        
        newDetails.splice(draggedIndex, 1);
        newDetails.splice(index, 0, draggedItem);
        
        setDraggedIndex(index);
        setScanResult({ ...scanResult, details: newDetails });
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const fetchSuggestions = async () => {
        if (!scanResult?.meta?.partNumber) {
            // Even if no part number, we can fetch global ones
        }
        try {
            const res = await fetch(`${api_url}/api/suggestions/problems?partNumber=${scanResult.meta?.partNumber || ''}`);
            const result = await res.json();
            if (result.status === 'success') setProblemSuggestions(result.data);
        } catch (e) { console.error("Fetch suggestions error", e); }
    };

    const handleSelectProblem = (index, problemText) => {
        handleDetailChange(index, 'problem', problemText);
        setActiveSuggestionRow(null);
    };

    const handleSelectCode = (index, code) => {
        handleDetailChange(index, 'defectCode', code);
        const matchedGuidance = window.DEFECT_GUIDANCE?.find(g => g.code === code);
        if (matchedGuidance) {
            handleDetailChange(index, 'problem', matchedGuidance.name);
        }
        setActiveGuidanceRow(null);
    };

    const handleSelectPart = (part) => {
        setScanResult({
            ...scanResult,
            meta: {
                ...scanResult.meta,
                partNumber: part.part_number,
                partName: part.part_name,
                model: part.model || scanResult.meta.model
            }
        });
        setShowPartSuggestions(false);
    };

    const validationErrors = window.AppUtils.getValidationErrors(scanResult);
    const isDataValid = validationErrors.length === 0;

    return (
        <div className="flex flex-col gap-8">
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes pulse-subtle {
                    0%, 100% { background-color: rgba(245, 158, 11, 0.04); }
                    50% { background-color: rgba(245, 158, 11, 0.16); }
                }
                .animate-pulse-subtle {
                    animation: pulse-subtle 2s infinite ease-in-out;
                }
            `}} />
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={() => setManualMode(false)}
                    className={`px-5 py-2 rounded-xl text-xs font-black transition-all shadow-sm ${
                        !manualMode
                            ? 'bg-blue-600 text-white shadow-blue-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                >
                    <i className="fas fa-qrcode mr-1.5"></i>Scan AI
                </button>
                <button
                    onClick={() => setManualMode(true)}
                    className={`px-5 py-2 rounded-xl text-xs font-black transition-all shadow-sm ${
                        manualMode
                            ? 'bg-blue-600 text-white shadow-blue-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                >
                    <i className="fas fa-pen-to-square mr-1.5"></i>Input Manual
                </button>
            </div>

            {showGuidance && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="bg-slate-900 p-6 flex justify-between items-center">
                            <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                <i className="fas fa-info-circle text-blue-400"></i> Guidance Defect Code
                            </h3>
                            <button onClick={() => setShowGuidance(false)} className="text-slate-400 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        <div className="p-8 grid grid-cols-2 gap-x-8 gap-y-3">
                            {Object.entries({
                                'A': 'Welding Undercut', 'B': 'Welding Over Lap', 'C': 'Welding Pit/Blow Hole', 'D': 'Welding Hole',
                                'E': 'Welding Burn-through', 'F': 'Welding Bead skip', 'G': 'Welding Bead width', 'H': 'Dimensi Spot bolt Tidak STD',
                                'I': 'Spot Bolt Pecah/Retak', 'J': 'Spot Bolt Ada GAP', 'K': 'Spot Bolt Ada Burry', 'L': 'Part Tidak Terpasang', 'M': 'Others'
                            }).map(([code, desc]) => (
                                <div key={code} className="flex items-center gap-4 group">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-800 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">{code}</div>
                                    <div className="text-xs font-bold text-slate-500 uppercase group-hover:text-slate-900 transition-colors">{desc}</div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t flex justify-end">
                            <button onClick={() => setShowGuidance(false)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs">MENGERTI</button>
                        </div>
                    </div>
                </div>
            )}

            {errorMessage && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex gap-3 items-start">
                    <i className="fas fa-exclamation-circle mt-0.5 text-red-600 text-lg"></i>
                    <div><strong className="block mb-1">Perhatian!</strong><p className="text-sm">{errorMessage}</p></div>
                </div>
            )}

            {manualMode ? (
                <window.ManualInputSection
                    api_url={api_url}
                    onSaved={() => {
                        if (onDraftsCountChange) onDraftsCountChange(0);
                    }}
                />
            ) : !scanResult ? (
                <ScanQueueView
                    selectedFiles={selectedFiles}
                    setSelectedFiles={setSelectedFiles}
                    isUploading={isUploading}
                    drafts={drafts}
                    fileInputRef={fileInputRef}
                    handleBatchUpload={handleBatchUpload}
                    handleStartAnalysis={handleStartAnalysis}
                    handleUpdateFileParam={handleUpdateFileParam}
                    handleOpenDraft={handleOpenDraft}
                    handleDeleteDraft={handleDeleteDraft}
                    handleRetryDraft={handleRetryDraft}
                    setScanResult={setScanResult}
                    handleOpenCropperForFile={handleOpenCropperForFile}
                />
            ) : (
                <div className="animate-in fade-in duration-500">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b-2 border-slate-100 gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                                    {isViewingRecord ? (isEditMode ? 'Edit Record' : 'Detail Record') : 'Review Hasil Scan'}
                                </h2>
                                <div className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {modelUsed || 'V2.5'}
                                </div>
                                {scanResult.summary?.confidenceScore !== undefined && (
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border ${
                                        Number(scanResult.summary.confidenceScore) >= 90 
                                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                                            : 'text-amber-600 bg-amber-50 border-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse'
                                    }`}>
                                        <i className={`fas ${Number(scanResult.summary.confidenceScore) >= 90 ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
                                        {scanResult.summary.confidenceScore}% YAKIN {Number(scanResult.summary.confidenceScore) < 90 && '(REVIEW)'}
                                    </div>
                                )}
                            </div>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                {isViewingRecord ? 'Historical Industrial Data' : 'Digital Inspection Verification'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => window.AppUtils.exportCSV(scanResult)} className="bg-slate-100 text-slate-600 px-5 py-3 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all border border-slate-200 flex items-center gap-2"><i className="fas fa-file-csv text-lg"></i> EXPORT CSV</button>
                            {(!isViewingRecord || isEditMode) && (
                                <div className="flex gap-2">
                                    {activeDraftId && <button onClick={handleUpdateDraft} disabled={isSavingToSheets} className="bg-orange-100 text-orange-800 px-5 py-3 rounded-2xl font-black text-xs hover:bg-orange-200 border border-orange-200 transition-all flex items-center gap-2"><i className="fas fa-save text-lg"></i> SIMPAN DRAFT</button>}
                                    <button onClick={isEditMode ? handleUpdateRecord : handleApproveDraft} disabled={isSavingToSheets || !isDataValid} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-xs shadow-xl shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-200 transition-all flex items-center gap-2">{isSavingToSheets ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-check-double text-lg"></i>} {isEditMode ? 'SIMPAN PERUBAHAN' : 'FINALISASI & SIMPAN'}</button>
                                </div>
                            )}
                            <button onClick={handleReset} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2"><i className="fas fa-times text-lg"></i> TUTUP</button>
                        </div>
                    </div>

                    {!isDataValid && (
                        <div className="mb-6 bg-red-50 border border-red-200 p-6 rounded-3xl flex gap-4">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-red-100"><i className="fas fa-exclamation-triangle text-xl"></i></div>
                            <div><h4 className="font-black text-red-800 text-lg mb-1 tracking-tight">Validasi Data Gagal!</h4><ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-red-600/80 font-bold text-xs uppercase tracking-tight">{validationErrors.map((err, i) => <li key={i} className="flex items-center gap-2"><div className="w-1 h-1 bg-red-400 rounded-full"></div> {err}</li>)}</ul></div>
                        </div>
                    )}

                    <div className="mb-6">
                        <div className="bg-white rounded-[2rem] p-8 shadow-2xl shadow-slate-200/50 border border-slate-100">
                            <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1 h-4 bg-blue-600 rounded-full"></div> Informasi Dokumen</h3><button className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-all uppercase tracking-widest" onClick={() => setShowGuidance(true)}><i className="fas fa-info-circle mr-1"></i> Guidance Code</button></div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-3">
                                <div className="suggestion-container relative col-span-2 md:col-span-2 lg:col-span-2">
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Part Number</label>
                                    <input 
                                        type="text" 
                                        value={scanResult.meta?.partNumber || ''} 
                                        onChange={(e) => { if (!isReadOnly) { handleMetaChange('partNumber', e.target.value); setShowPartSuggestions(true); } }} 
                                        onFocus={() => { if (!isReadOnly) setShowPartSuggestions(true); }}
                                        readOnly={isReadOnly}
                                        className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" 
                                    />
                                    {!isReadOnly && showPartSuggestions && (
                                        <div className="absolute z-[70] left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                                            <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pilih Part Master</span>
                                                <button onClick={(e) => { e.stopPropagation(); setShowPartSuggestions(false); }} className="text-slate-400 hover:text-red-500"><i className="fas fa-times text-[10px]"></i></button>
                                            </div>
                                            {masterParts.filter(p => p.part_number.toLowerCase().includes((scanResult.meta?.partNumber || '').toLowerCase()) || p.part_name.toLowerCase().includes((scanResult.meta?.partNumber || '').toLowerCase())).map((part, i) => (
                                                <div key={i} onClick={(e) => { e.stopPropagation(); handleSelectPart(part); }} className="p-4 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0 group/part">
                                                    <div className="text-xs font-black text-slate-700 group-hover/part:text-blue-600">{part.part_number}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">{part.part_name}</div>
                                                </div>
                                            ))}
                                            {masterParts.length === 0 && <div className="p-4 text-center text-xs text-slate-300 italic font-bold">Data Master Kosong</div>}
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-2 md:col-span-2 lg:col-span-3"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Part Name</label><input type="text" value={scanResult.meta?.partName || ''} onChange={(e) => handleMetaChange('partName', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" /></div>
                                <div className="col-span-1 md:col-span-1 lg:col-span-1"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Model</label><input type="text" value={scanResult.meta?.model || ''} onChange={(e) => handleMetaChange('model', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" /></div>
                                <div className="col-span-1 md:col-span-1 lg:col-span-2"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Inspector</label><input type="text" value={scanResult.meta?.nama || ''} onChange={(e) => handleMetaChange('nama', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" /></div>
                                <div className="col-span-1 md:col-span-1 lg:col-span-1"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Shift</label><input type="text" value={scanResult.meta?.shift || ''} onChange={(e) => handleMetaChange('shift', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" placeholder="A/B" /></div>
                                <div className="col-span-1 md:col-span-1 lg:col-span-1"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Line/Pos</label><input type="text" value={scanResult.meta?.linePos || ''} onChange={(e) => handleMetaChange('linePos', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" placeholder="L1" /></div>
                                <div className="col-span-2 md:col-span-2 lg:col-span-2"><label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Date</label><input type="date" value={scanResult.meta?.date || ''} onChange={(e) => handleMetaChange('date', e.target.value)} readOnly={isReadOnly} className="w-full bg-slate-50 p-2.5 rounded-xl border-2 border-transparent focus:border-blue-200 focus:bg-white outline-none transition-all font-black text-slate-800 text-xs shadow-inner" /></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        {!imagePreview && !isViewingRecord && !activeDraftId ? (
                            <div className="lg:w-[35%] w-full lg:sticky lg:top-4 bg-slate-950 p-8 rounded-[2.5rem] shadow-2xl border-4 border-dashed border-slate-800 flex flex-col justify-center items-center h-[80vh] text-center group hover:border-blue-500/50 transition-all duration-300">
                                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-slate-800 group-hover:scale-110 group-hover:border-blue-500/30 transition-all duration-300 animate-pulse-subtle">
                                    <i className="fas fa-camera text-3xl text-slate-400 group-hover:text-blue-400 transition-colors"></i>
                                </div>
                                <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">Lampirkan Foto CS</h4>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider max-w-[200px] mb-8 leading-relaxed">
                                    Upload foto Check Sheet untuk dokumentasi & trace di kemudian hari
                                </p>
                                <button 
                                    onClick={() => manualFileInputRef.current?.click()}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl font-black text-xs shadow-xl shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <i className="fas fa-upload"></i> PILIH FOTO
                                </button>
                                <input 
                                    type="file" 
                                    ref={manualFileInputRef}
                                    onChange={handleManualPhotoUpload}
                                    accept="image/*"
                                    className="hidden" 
                                />
                            </div>
                        ) : null}

                        {imagePreview && (
                            <div className="lg:w-[35%] w-full lg:sticky lg:top-4 bg-slate-900 p-2 rounded-[2.5rem] shadow-2xl border-8 border-slate-800 overflow-hidden flex flex-col h-[80vh]">
                                <div className="flex justify-between items-center bg-slate-800 px-6 py-4 text-white">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                        {!activeDraftId && !isViewingRecord ? "Lampiran Foto CS" : "Visual Verification"}
                                    </span>
                                    <div className="flex items-center gap-4">
                                        {!activeDraftId && !isViewingRecord && (
                                            <button 
                                                onClick={handleRemoveManualPhoto}
                                                className="text-red-400 hover:text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-red-500/20 mr-1"
                                                title="Hapus Foto"
                                            >
                                                <i className="fas fa-trash-alt"></i> Hapus
                                            </button>
                                        )}
                                        <button onClick={() => setIsFullVisualMode(true)} className="text-slate-400 hover:text-blue-400 transition-colors mr-2" title="Tampilkan Layar Penuh"><i className="fas fa-expand text-xs"></i></button>
                                        <div className="flex items-center gap-3 bg-slate-700/50 px-3 py-1.5 rounded-full">
                                            <button onClick={() => setZoomLevel(prev => Math.max(10, prev - 25))} className="hover:text-blue-400 transition-colors"><i className="fas fa-minus-circle"></i></button>
                                            <span className="zoom-percent-text text-[10px] font-black w-8 text-center">{zoomLevel}%</span>
                                            <button onClick={() => setZoomLevel(prev => Math.min(400, prev + 25))} className="hover:text-blue-400 transition-colors"><i className="fas fa-plus-circle"></i></button>
                                        </div>
                                        <div className="flex items-center gap-3 bg-slate-700/50 px-3 py-1.5 rounded-full">
                                            <button onClick={() => setBrightness(prev => Math.max(50, prev - 10))} className="hover:text-yellow-400 transition-colors"><i className="fas fa-sun"></i></button>
                                            <button onClick={() => setBrightness(prev => Math.min(200, prev + 10))} className="hover:text-yellow-400 transition-colors"><i className="fas fa-sun"></i>+</button>
                                        </div>
                                    </div>
                                </div>
                                <div ref={imageContainerRef} className={`relative overflow-auto flex-1 bg-slate-950 custom-scrollbar-dark ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`} style={{ scrollBehavior: 'auto' }} onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); setIsDragging(true); dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: imageContainerRef.current.scrollLeft, scrollTop: imageContainerRef.current.scrollTop }; } }} onMouseMove={(e) => { if (isDragging) { e.preventDefault(); const dx = e.clientX - dragStart.current.x; const dy = e.clientY - dragStart.current.y; imageContainerRef.current.scrollLeft = dragStart.current.scrollLeft - dx; imageContainerRef.current.scrollTop = dragStart.current.scrollTop - dy; } }} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
                                    <div id="scan-zoom-container" className="relative inline-block w-fit min-w-full" style={{ width: `${zoomLevel}%`, transition: 'width 0.3s ease-in-out' }}>
                                        {Array.isArray(imagePreview) ? (
                                            <div className="space-y-6 p-4">
                                                {imagePreview.map((img, i) => (
                                                    <div key={i} className="relative border-4 border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                                                        <div className="absolute top-4 left-4 bg-blue-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black z-30 shadow-lg tracking-widest uppercase">Page {i + 1}</div>
                                                        <img src={img} className="w-full block" style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)`, transform: `rotate(${rotation}deg)` }} />
                                                        {scanResult.details?.map((item, idx) => {
                                                            const itemPage = item.pageIndex !== undefined ? Number(item.pageIndex) : (item.page_index !== undefined ? Number(item.page_index) : 0);
                                                            if (itemPage !== i || !item.location) return null;
                                                            let loc = typeof item.location === 'string' ? JSON.parse(item.location) : item.location;
                                                            if (!Array.isArray(loc)) return null; // safe guard for voice coordinates
                                                            const [ymin, xmin, ymax, xmax] = loc.map(Number);
                                                            const isActive = activeRowIndex === idx;
                                                            return (
                                                                <div 
                                                                    key={idx} 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveRowIndex(idx);
                                                                        const rowEl = document.getElementById(`defect-row-${idx}`);
                                                                        if (rowEl) {
                                                                            rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                                        }
                                                                    }}
                                                                    className={`absolute border-2 transition-all duration-300 cursor-pointer ${
                                                                        isActive 
                                                                            ? 'border-red-500/80 bg-red-500/25 z-20 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                                                                            : 'border-blue-400/40 bg-blue-400/10 hover:border-red-400/60 hover:bg-red-400/15 hover:scale-105 hover:z-20 z-10'
                                                                    }`} 
                                                                    style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}
                                                                >
                                                                    {isActive && (
                                                                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-2xl animate-bounce flex items-center gap-2 z-40 border border-slate-700/50">
                                                                            <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">PT {item.checkNo || idx + 1}</span>
                                                                            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">{item.defectCode || '-'}</span>
                                                                            <span className="text-slate-300">Qty: <strong className="text-white font-black">{item.qty || 1}</strong></span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="relative p-4">
                                                <div className="relative border-4 border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                                                    <img src={imagePreview} className="w-full block" style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)`, transform: `rotate(${rotation}deg)` }} />
                                                    {scanResult.details?.map((item, idx) => {
                                                        if (!item.location) return null;
                                                        let loc = typeof item.location === 'string' ? JSON.parse(item.location) : item.location;
                                                        if (!Array.isArray(loc)) return null; // safe guard for voice coordinates
                                                        const [ymin, xmin, ymax, xmax] = loc.map(Number);
                                                        const isActive = activeRowIndex === idx;
                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveRowIndex(idx);
                                                                    const rowEl = document.getElementById(`defect-row-${idx}`);
                                                                    if (rowEl) {
                                                                        rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                                    }
                                                                }}
                                                                className={`absolute border-2 transition-all duration-300 cursor-pointer ${
                                                                    isActive 
                                                                        ? 'border-red-500/80 bg-red-500/25 z-20 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                                                                        : 'border-blue-400/40 bg-blue-400/10 hover:border-red-400/60 hover:bg-red-400/15 hover:scale-105 hover:z-20 z-10'
                                                                }`} 
                                                                style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}
                                                            >
                                                                {isActive && (
                                                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-2xl animate-bounce flex items-center gap-2 z-40 border border-slate-700/50">
                                                                        <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">PT {item.checkNo || idx + 1}</span>
                                                                        <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">{item.defectCode || '-'}</span>
                                                                        <span className="text-slate-300">Qty: <strong className="text-white font-black">{item.qty || 1}</strong></span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 space-y-8 lg:w-[62%]">
                            <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col max-h-[80vh] relative">
                                <div className="p-6 bg-white border-b border-slate-100 sticky top-0 z-40 flex justify-between items-center shadow-sm h-[88px]">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1 h-4 bg-red-600 rounded-full"></div> Rincian Defect (NG)</h3>
                                    {!isReadOnly && <button onClick={(e) => { e.stopPropagation(); addDetailRow(); }} className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200"><i className="fas fa-plus-circle text-blue-400"></i> TAMBAH BARIS</button>}
                                </div>
                                <div className="overflow-y-auto flex-1 custom-scrollbar">
                                    <table className="w-full text-left relative">
                                        <thead className="sticky top-0 z-30">
                                            <tr className="bg-slate-50/80 backdrop-blur-md text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-100">
                                                <th className="px-2 py-3 w-8 text-center"></th>
                                                <th className="px-4 py-3 w-16 text-center">Check No</th>
                                                <th className="px-4 py-3">Problem</th>
                                                <th className="px-4 py-3 text-center w-14">Code</th>
                                                <th className="px-4 py-3 text-center w-24">Qty</th>
                                                <th className="px-4 py-3 text-right w-20">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {(isViewingRecord && !isEditMode ? groupedDetails : scanResult.details)?.map((detail, idx) => {
                                                const isLowConfidenceRow = detail.confidence !== undefined && Number(detail.confidence) < 90;
                                                const isGrouped = detail._groupCount > 1;
                                                    return (
                                                    <tr 
                                                        key={idx} 
                                                        id={`defect-row-${idx}`}
                                                        draggable={!isGrouped && canDrag}
                                                        onDragStart={(e) => { if (!isGrouped) handleDragStart(e, idx); }}
                                                        onDragOver={(e) => { if (!isGrouped) handleDragOver(e, idx); }}
                                                        onDragEnd={(e) => { if (!isGrouped) { handleDragEnd(); setCanDrag(false); } }}
                                                        className={`group transition-all duration-200 ${isGrouped ? 'bg-indigo-50/60' : 'cursor-pointer'} ${
                                                            activeRowIndex === idx ? 'bg-blue-50/50' : (isLowConfidenceRow ? 'bg-amber-50/20' : 'hover:bg-slate-50/30')
                                                        } ${draggedIndex === idx ? 'opacity-40 bg-slate-100' : ''} ${
                                                            isLowConfidenceRow ? 'animate-pulse-subtle border-l-4 border-amber-500' : ''
                                                        }`}
                                                        onMouseEnter={() => setActiveRowIndex(idx)} 
                                                        onMouseLeave={() => setActiveRowIndex(null)} 
                                                        onClick={() => { if (!isGrouped) handleZoomToPoint(detail, idx); }}
                                                    >
                                                        <td 
                                                            className="px-2 py-2 text-center text-slate-300"
                                                        >
                                                            {isGrouped ? (
                                                                <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full text-[8px] font-black">{(detail._groupCount)}x</span>
                                                            ) : (
                                                                <i className="fas fa-grip-lines text-[10px]"></i>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {isLowConfidenceRow && (
                                                                    <i 
                                                                        className="fas fa-exclamation-triangle text-amber-500 animate-pulse text-xs shrink-0" 
                                                                        title={`Confidence: ${detail.confidence}%. Alasan: ${detail.lowConfidenceReason || 'Kurang yakin'}`}
                                                                    ></i>
                                                                )}
                                                                {(isGrouped || isReadOnly) ? (
                                                                    <span className="w-full bg-indigo-100 text-indigo-700 p-1.5 rounded-lg font-black text-center text-xs">{detail.checkNo}</span>
                                                                ) : (
                                                                    <input 
                                                                        type="text" 
                                                                        value={detail.checkNo} 
                                                                        onChange={(e) => handleDetailChange(idx, 'checkNo', e.target.value)} 
                                                                        className="w-full bg-blue-50/50 group-hover:bg-white text-blue-600 p-1.5 rounded-lg outline-none font-black text-center text-xs transition-colors" 
                                                                        placeholder="1" 
                                                                    />
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-2 relative suggestion-container">
                                                            <div className="relative flex items-center w-full">
                                                                {(isGrouped || isReadOnly) ? (
                                                                    <span className="w-full bg-indigo-100 text-indigo-700 p-2 rounded-xl font-bold text-xs">{detail.problem}</span>
                                                                ) : (
                                                                    <input 
                                                                        type="text" 
                                                                        value={detail.problem} 
                                                                        onChange={(e) => { handleDetailChange(idx, 'problem', e.target.value); setSearchTerm(e.target.value); }} 
                                                                        onFocus={(e) => { e.stopPropagation(); setActiveSuggestionRow(idx); fetchSuggestions(); setSearchTerm(detail.problem); }}
                                                                        onClick={(e) => { e.stopPropagation(); setActiveSuggestionRow(idx); }}
                                                                        className="w-full bg-slate-50/50 group-hover:bg-white p-2 pr-8 rounded-xl outline-none font-bold text-slate-700 text-xs placeholder-slate-300 transition-all border border-transparent focus:border-blue-200" 
                                                                        placeholder="Deskripsi..." 
                                                                    />
                                                                )}
                                                                {!isGrouped && (detail.problem || activeSuggestionRow === idx) && (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => { 
                                                                            e.stopPropagation(); 
                                                                            if (activeSuggestionRow === idx && !detail.problem) {
                                                                                setActiveSuggestionRow(null);
                                                                            } else {
                                                                                handleDetailChange(idx, 'problem', ''); 
                                                                                setActiveSuggestionRow(null);
                                                                            }
                                                                        }} 
                                                                        className="absolute right-2 text-slate-400 hover:text-red-500 p-1 transition-colors focus:outline-none"
                                                                        title="Batal / Bersihkan"
                                                                    >
                                                                        <i className="fas fa-times-circle text-sm"></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {!isGrouped && isLowConfidenceRow && detail.lowConfidenceReason && (
                                                                <div className="mt-1 flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-lg w-fit">
                                                                    <i className="fas fa-question-circle text-[8px]"></i>
                                                                    <span>AI Ragu: {detail.lowConfidenceReason}</span>
                                                                </div>
                                                            )}
                                                            {!isGrouped && activeSuggestionRow === idx && editingRowIdx === null && (
                                                                <div className={`absolute z-[100] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden max-h-60 overflow-y-auto animate-in duration-200 w-[200%] sm:w-[150%] ${
                                                                    isViewingRecord && !isEditMode ? '' :
                                                                    idx >= (scanResult.details?.length || 0) - 2 && (scanResult.details?.length || 0) >= 2 
                                                                        ? 'bottom-full mb-1 slide-in-from-bottom-2' 
                                                                        : 'top-full mt-1 slide-in-from-top-2'
                                                                }`}>
                                                                    <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saran Masalah</span>
                                                                        <button onClick={(e) => { e.stopPropagation(); setActiveSuggestionRow(null); }} className="text-slate-400 hover:text-red-500"><i className="fas fa-times text-[10px]"></i></button>
                                                                    </div>
                                                                    <div 
                                                                        onClick={(e) => { e.stopPropagation(); handleDetailChange(idx, 'problem', ''); setActiveSuggestionRow(null); }} 
                                                                        className="px-4 py-3 bg-red-50/50 hover:bg-red-100 border-b border-slate-100 cursor-pointer text-xs font-black text-red-600 flex items-center gap-2 sticky top-[41px] z-10 transition-all"
                                                                    >
                                                                        <i className="fas fa-times-circle text-red-500"></i> Tidak Jadi Pilih / Kosongkan Isian
                                                                    </div>
                                                                    {problemSuggestions.filter(p => p.text.toLowerCase().includes(searchTerm.toLowerCase())).map((p, i) => (
                                                                        <div key={i} onClick={(e) => { e.stopPropagation(); handleSelectProblem(idx, p.text); }} className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group/item border-b border-slate-50 last:border-0">
                                                                            <span className="text-xs font-bold text-slate-600 group-hover/item:text-blue-600">{p.text}</span>
                                                                            {p.type === 'history' && <span className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-black uppercase">Recent</span>}
                                                                        </div>
                                                                    ))}
                                                                    {problemSuggestions.length === 0 && <div className="p-4 text-center text-[10px] text-slate-300 italic">Tidak ada histori</div>}
                                                                    <div 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveSuggestionRow(null); }} 
                                                                        className="px-4 py-3 bg-slate-50 hover:bg-slate-100 border-t border-slate-100 cursor-pointer text-center text-xs font-black text-slate-500 hover:text-red-500 transition-all flex items-center justify-center gap-2 sticky bottom-0 z-10"
                                                                    >
                                                                        <i className="fas fa-times-circle text-red-500"></i> Batal / Tutup Rekomendasi
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    <td className="px-2 py-2 text-center">
                                                        <div className="relative w-full suggestion-container">
                                                            {(isGrouped || isReadOnly) ? (
                                                                <span className="w-full bg-indigo-100 text-indigo-700 p-2 rounded-xl font-black text-center text-xs">{detail.defectCode}</span>
                                                            ) : (
                                                                <input 
                                                                    type="text" 
                                                                    value={detail.defectCode} 
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        handleDetailChange(idx, 'defectCode', val);
                                                                        const matchedGuidance = window.DEFECT_GUIDANCE?.find(g => g.code.toUpperCase() === val.toUpperCase().trim());
                                                                        if (matchedGuidance) {
                                                                            handleDetailChange(idx, 'problem', matchedGuidance.name);
                                                                        }
                                                                    }}
                                                                    onClick={(e) => { e.stopPropagation(); setActiveGuidanceRow(idx); }}
                                                                    onFocus={(e) => { e.stopPropagation(); setActiveGuidanceRow(idx); }}
                                                                    className="w-full bg-slate-100 group-hover:bg-white text-slate-700 p-2 rounded-xl outline-none font-black text-center text-xs border border-transparent group-hover:border-slate-200 transition-all cursor-pointer" 
                                                                    placeholder="-" 
                                                                />
                                                            )}
                                                            {!isGrouped && activeGuidanceRow === idx && editingRowIdx === null && (
                                                                <div className={`absolute z-[110] right-0 mt-1 sm:w-64 bg-white border border-slate-200 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden animate-in duration-200 ${
                                                                    isViewingRecord && !isEditMode ? '' :
                                                                    idx >= (scanResult.details?.length || 0) - 2 && (scanResult.details?.length || 0) >= 2 
                                                                        ? 'bottom-full mb-1 origin-bottom slide-in-from-bottom-2' 
                                                                        : 'top-full mt-1 origin-top slide-in-from-top-2'
                                                                }`}>
                                                                    <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                                                                        <span className="text-[10px] font-black uppercase tracking-widest">Pilih Kode Defect</span>
                                                                        <button onClick={(e) => { e.stopPropagation(); setActiveGuidanceRow(null); }} className="text-white/50 hover:text-white"><i className="fas fa-times"></i></button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 p-2 max-h-72 overflow-y-auto custom-scrollbar">
                                                                        {window.DEFECT_GUIDANCE.map((g, i) => (
                                                                            <div key={i} onClick={(e) => { e.stopPropagation(); handleSelectCode(idx, g.code); }} className="flex items-center gap-4 p-3 hover:bg-blue-50 rounded-2xl transition-all cursor-pointer group/g border-b border-slate-50 last:border-0">
                                                                                <div className="w-10 h-10 bg-slate-100 group-hover/g:bg-blue-600 group-hover/g:text-white rounded-xl flex items-center justify-center font-black text-sm transition-all shadow-sm">{g.code}</div>
                                                                                <div className="text-[11px] font-bold text-slate-600 group-hover/g:text-blue-600 leading-tight">{g.name}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                        {(isGrouped || isReadOnly) ? (
                                                            <span className="inline-flex items-center justify-center w-full font-black text-sm text-indigo-700">{detail.qty}</span>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-2 bg-slate-100 group-hover:bg-white p-1 rounded-2xl border border-slate-200 shadow-sm transition-all">
                                                                <button onClick={(e) => { e.stopPropagation(); handleDetailChange(idx, 'qty', Math.max(1, (detail.qty || 1) - 1)); }} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><i className="fas fa-minus text-xs"></i></button>
                                                                <input type="number" value={detail.qty} onChange={(e) => handleDetailChange(idx, 'qty', e.target.value)} className="w-10 bg-transparent outline-none font-black text-center text-sm text-slate-700" />
                                                                <button onClick={(e) => { e.stopPropagation(); handleDetailChange(idx, 'qty', (detail.qty || 1) + 1); }} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"><i className="fas fa-plus text-xs"></i></button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 text-right">
                                                        {!isGrouped && !isReadOnly && (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button onClick={(e) => { e.stopPropagation(); insertDetailRow(idx); }} className="w-8 h-8 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm" title="Tambah baris di bawah">
                                                                    <i className="fas fa-plus text-xs"></i>
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); removeDetailRow(idx); }} className="w-8 h-8 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm" title="Hapus baris">
                                                                    <i className="fas fa-trash-alt text-xs"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                            })}
                                            {(!scanResult.details || scanResult.details.length === 0) && (<tr><td colSpan="6" className="px-6 py-20 text-center text-slate-300 italic font-bold uppercase tracking-[0.2em] text-[10px]">ALL OK</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="bg-white rounded-[2rem] p-8 shadow-2xl shadow-slate-200/50 border border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-8"><div className="w-1 h-4 bg-emerald-600 rounded-full"></div> Ringkasan Produksi</h3>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                    <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100/50 shadow-sm"><label className="block text-[9px] font-black text-blue-600 uppercase mb-3 tracking-widest text-center">Total Prod</label><input type="number" value={scanResult.summary?.totalProduksi || 0} onChange={(e) => handleSummaryChange('totalProduksi', e.target.value)} readOnly={isReadOnly} className="w-full bg-white p-3 rounded-2xl border-2 border-blue-200 text-center text-lg font-black text-blue-800 shadow-xl shadow-blue-100/50 outline-none" /></div>
                                    <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100/50 shadow-sm"><label className="block text-[9px] font-black text-emerald-600 uppercase mb-3 tracking-widest text-center">Total OK</label><input type="number" value={scanResult.summary?.totalOK || 0} onChange={(e) => handleSummaryChange('totalOK', e.target.value)} readOnly={isReadOnly} className="w-full bg-white p-3 rounded-2xl border-2 border-emerald-200 text-center text-lg font-black text-emerald-800 shadow-xl shadow-emerald-100/50 outline-none" /></div>
                                    <div className="bg-red-50/50 p-6 rounded-[2rem] border border-red-100/50 shadow-sm"><label className="block text-[9px] font-black text-red-600 uppercase mb-3 tracking-widest text-center">NG Frame</label><input type="number" value={scanResult.summary?.totalNG || 0} onChange={(e) => handleSummaryChange('totalNG', e.target.value)} readOnly={isReadOnly} className="w-full bg-white p-3 rounded-2xl border-2 border-red-200 text-center text-lg font-black text-red-800 shadow-xl shadow-red-100/50 outline-none" /></div>
                                    <div className="bg-purple-50/50 p-6 rounded-[2rem] border border-purple-100/50 shadow-sm"><label className="block text-[9px] font-black text-purple-600 uppercase mb-3 tracking-widest text-center">NG Point</label><div className="w-full bg-white p-3 rounded-2xl border-2 border-purple-200 text-center text-lg font-black text-purple-800 shadow-xl shadow-purple-100/50">{scanResult.summary?.totalNGPoint || 0}</div></div>
                                    <div className="bg-orange-50/50 p-6 rounded-[2rem] border border-orange-100/50 shadow-sm"><label className="block text-[9px] font-black text-orange-600 uppercase mb-3 tracking-widest text-center">Scrap</label><input type="number" value={scanResult.summary?.totalScrap || 0} onChange={(e) => handleSummaryChange('totalScrap', e.target.value)} readOnly={isReadOnly} className="w-full bg-white p-3 rounded-2xl border-2 border-orange-200 text-center text-lg font-black text-orange-800 shadow-xl shadow-orange-100/50 outline-none" /></div>
                                </div>
                            </div>

                            <div className="bg-white rounded-[2rem] p-8 shadow-2xl shadow-slate-200/50 border border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-6"><div className="w-1 h-4 bg-slate-400 rounded-full"></div> Catatan Tambahan</h3>
                                <textarea value={scanResult.notes || ""} onChange={(e) => setScanResult({ ...scanResult, notes: e.target.value })} readOnly={isReadOnly} placeholder="Tulis catatan..." className="w-full bg-slate-50 p-6 rounded-3xl border-2 border-transparent focus:border-slate-200 focus:bg-white outline-none transition-all font-bold text-slate-600 text-sm shadow-inner min-h-[100px]"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleBatchUpload} multiple accept="image/*" className="hidden" />

            {croppingQueue.length > 0 && croppingQueue[currentCroppingIndex] && window.PerspectiveCropper && (
                React.createElement(window.PerspectiveCropper, {
                    imageSrc: croppingQueue[currentCroppingIndex].preview,
                    onProcess: handleCropperProcess,
                    onCancel: handleCropperCancel
                })
            )}

            {isFullVisualMode && (
                <div className="fixed inset-0 z-[80] bg-slate-950 flex flex-col animate-in fade-in duration-300">
                    <div className="flex justify-between items-center bg-slate-900 px-8 py-5 text-white border-b border-slate-800">
                        <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Visual Verification (Full Screen)</span>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700">
                                <button onClick={() => setZoomLevel(prev => Math.max(10, prev - 25))} className="text-slate-300 hover:text-blue-400 transition-colors"><i className="fas fa-minus-circle"></i></button>
                                <span className="zoom-percent-text text-xs font-black w-10 text-center">{zoomLevel}%</span>
                                <button onClick={() => setZoomLevel(prev => Math.min(400, prev + 25))} className="text-slate-300 hover:text-blue-400 transition-colors"><i className="fas fa-plus-circle"></i></button>
                            </div>
                            <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700">
                                <button onClick={() => setBrightness(prev => Math.max(50, prev - 10))} className="text-slate-300 hover:text-yellow-400 transition-colors"><i className="fas fa-sun"></i></button>
                                <span className="text-xs font-black text-slate-300 text-center">{brightness}%</span>
                                <button onClick={() => setBrightness(prev => Math.min(200, prev + 10))} className="text-slate-300 hover:text-yellow-400 transition-colors"><i className="fas fa-sun"></i>+</button>
                            </div>
                            <button onClick={() => setIsFullVisualMode(false)} className="bg-red-600/90 hover:bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg font-bold" title="Tutup Layar Penuh">
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>
                    </div>
                    <div className={`relative overflow-auto flex-1 bg-slate-950 custom-scrollbar-dark ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`} style={{ scrollBehavior: 'auto' }} onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); setIsDragging(true); dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: e.currentTarget.scrollLeft, scrollTop: e.currentTarget.scrollTop }; } }} onMouseMove={(e) => { if (isDragging) { e.preventDefault(); const dx = e.clientX - dragStart.current.x; const dy = e.clientY - dragStart.current.y; e.currentTarget.scrollLeft = dragStart.current.scrollLeft - dx; e.currentTarget.scrollTop = dragStart.current.scrollTop - dy; } }} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
                        <div className="relative inline-block w-fit min-w-full mx-auto" style={{ width: `${zoomLevel}%`, transition: 'width 0.3s ease-in-out' }}>
                            {Array.isArray(imagePreview) ? (
                                <div className="space-y-8 p-8 max-w-5xl mx-auto">
                                    {imagePreview.map((img, i) => (
                                        <div key={i} className="relative border-8 border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                                            <div className="absolute top-6 left-6 bg-blue-600 text-white px-6 py-2 rounded-full text-xs font-black z-30 shadow-lg tracking-widest uppercase">Page {i + 1}</div>
                                            <img src={img} className="w-full block" style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)`, transform: `rotate(${rotation}deg)` }} />
                                            {scanResult.details?.map((item, idx) => {
                                                const itemPage = item.pageIndex !== undefined ? Number(item.pageIndex) : (item.page_index !== undefined ? Number(item.page_index) : 0);
                                                if (itemPage !== i || !item.location) return null;
                                                let loc = typeof item.location === 'string' ? JSON.parse(item.location) : item.location;
                                                const [ymin, xmin, ymax, xmax] = loc.map(Number);
                                                const isActive = activeRowIndex === idx;
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveRowIndex(idx);
                                                        }}
                                                        className={`absolute border-2 transition-all duration-300 cursor-pointer ${
                                                            isActive 
                                                                ? 'border-red-500/80 bg-red-500/25 z-20 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                                                                : 'border-blue-400/40 bg-blue-400/10 hover:border-red-400/60 hover:bg-red-400/15 hover:scale-105 hover:z-20 z-10'
                                                        }`} 
                                                        style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}
                                                    >
                                                        {isActive && (
                                                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-2xl animate-bounce flex items-center gap-2 z-40 border border-slate-700/50">
                                                                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">PT {item.checkNo || idx + 1}</span>
                                                                <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">{item.defectCode || '-'}</span>
                                                                <span className="text-slate-300">Qty: <strong className="text-white font-black">{item.qty || 1}</strong></span>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingRowIdx(idx);
                                                                    }} 
                                                                    className="bg-amber-500 hover:bg-amber-400 text-slate-900 w-5 h-5 rounded flex items-center justify-center ml-1 transition-all"
                                                                    title="Edit Defect Ini"
                                                                >
                                                                    <i className="fas fa-pencil-alt text-[8px]"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="relative p-8 max-w-5xl mx-auto">
                                    <div className="relative border-8 border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                                        <img src={imagePreview} className="w-full block" style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)`, transform: `rotate(${rotation}deg)` }} />
                                        {scanResult.details?.map((item, idx) => {
                                            if (!item.location) return null;
                                            let loc = typeof item.location === 'string' ? JSON.parse(item.location) : item.location;
                                            if (!Array.isArray(loc)) return null; // safe guard for voice coordinates
                                            const [ymin, xmin, ymax, xmax] = loc.map(Number);
                                            const isActive = activeRowIndex === idx;
                                            return (
                                                <div 
                                                    key={idx} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveRowIndex(idx);
                                                    }}
                                                    className={`absolute border-2 transition-all duration-300 cursor-pointer ${
                                                        isActive 
                                                            ? 'border-red-500/80 bg-red-500/25 z-20 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                                                            : 'border-blue-400/40 bg-blue-400/10 hover:border-red-400/60 hover:bg-red-400/15 hover:scale-105 hover:z-20 z-10'
                                                    }`} 
                                                    style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}
                                                >
                                                    {isActive && (
                                                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-2xl animate-bounce flex items-center gap-2 z-40 border border-slate-700/50">
                                                            <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">PT {item.checkNo || idx + 1}</span>
                                                            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black">{item.defectCode || '-'}</span>
                                                            <span className="text-slate-300">Qty: <strong className="text-white font-black">{item.qty || 1}</strong></span>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingRowIdx(idx);
                                                                }} 
                                                                className="bg-amber-500 hover:bg-amber-400 text-slate-900 w-5 h-5 rounded flex items-center justify-center ml-1 transition-all"
                                                                title="Edit Defect Ini"
                                                            >
                                                                <i className="fas fa-pencil-alt text-[8px]"></i>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingRowIdx !== null && scanResult.details?.[editingRowIdx] && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
                        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                            <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                <i className="fas fa-edit text-amber-400"></i> Edit Defect - Point {scanResult.details[editingRowIdx].checkNo || editingRowIdx + 1}
                            </h3>
                            <button onClick={() => setEditingRowIdx(null)} className="text-slate-400 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        <div className="p-8 space-y-6">
                            {/* Check No */}
                            <div>
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Check No</label>
                                <input 
                                    type="text" 
                                    value={scanResult.details[editingRowIdx].checkNo} 
                                    onChange={(e) => handleDetailChange(editingRowIdx, 'checkNo', e.target.value)} 
                                    className="w-full bg-slate-50 p-3 rounded-xl border-2 border-slate-100 focus:border-blue-200 outline-none transition-all font-black text-slate-800 text-xs shadow-inner" 
                                    placeholder="1"
                                />
                            </div>

                            {/* Problem */}
                            <div className="relative suggestion-container">
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Problem Description</label>
                                <input 
                                    type="text" 
                                    value={scanResult.details[editingRowIdx].problem} 
                                    onChange={(e) => { handleDetailChange(editingRowIdx, 'problem', e.target.value); setSearchTerm(e.target.value); }} 
                                    onFocus={() => { setActiveSuggestionRow(editingRowIdx); fetchSuggestions(); setSearchTerm(scanResult.details[editingRowIdx].problem); }}
                                    className="w-full bg-slate-50 p-3 rounded-xl border-2 border-slate-100 focus:border-blue-200 outline-none transition-all font-bold text-slate-700 text-xs shadow-inner" 
                                    placeholder="Deskripsi masalah..."
                                />
                                {activeSuggestionRow === editingRowIdx && (
                                    <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden max-h-48 overflow-y-auto w-full">
                                        {problemSuggestions.filter(p => p.text.toLowerCase().includes(searchTerm.toLowerCase())).map((p, i) => (
                                            <div key={i} onClick={() => { handleSelectProblem(editingRowIdx, p.text); }} className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-xs font-bold text-slate-600 border-b border-slate-50 last:border-0">
                                                {p.text}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Defect Code Dropdown */}
                            <div className="relative suggestion-container">
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Defect Code</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={scanResult.details[editingRowIdx].defectCode} 
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            handleDetailChange(editingRowIdx, 'defectCode', val);
                                            const matchedGuidance = window.DEFECT_GUIDANCE?.find(g => g.code.toUpperCase() === val.toUpperCase().trim());
                                            if (matchedGuidance) {
                                                handleDetailChange(editingRowIdx, 'problem', matchedGuidance.name);
                                            }
                                        }}
                                        onClick={(e) => { e.stopPropagation(); setActiveGuidanceRow(editingRowIdx); }}
                                        onFocus={(e) => { e.stopPropagation(); setActiveGuidanceRow(editingRowIdx); }}
                                        className="flex-1 bg-slate-100 p-3 rounded-xl border-2 border-slate-200 text-center font-black text-slate-800 text-xs cursor-pointer outline-none focus:border-blue-200" 
                                        placeholder="-"
                                    />
                                    <button onClick={() => setShowGuidance(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors"><i className="fas fa-info-circle mr-1"></i> Info</button>
                                </div>
                                {activeGuidanceRow === editingRowIdx && (
                                    <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden max-h-48 overflow-y-auto p-2">
                                        {window.DEFECT_GUIDANCE.map((g, i) => (
                                            <div key={i} onClick={(e) => { e.stopPropagation(); handleSelectCode(editingRowIdx, g.code); }} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded-xl cursor-pointer border-b border-slate-50 last:border-0">
                                                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-black text-xs">{g.code}</div>
                                                <div className="text-[10px] font-bold text-slate-600 leading-tight">{g.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Quantity NG</label>
                                <div className="flex items-center justify-center gap-4 bg-slate-50 p-2 rounded-2xl border-2 border-slate-100 shadow-inner w-fit mx-auto">
                                    <button onClick={() => handleDetailChange(editingRowIdx, 'qty', Math.max(1, (scanResult.details[editingRowIdx].qty || 1) - 1))} className="w-9 h-9 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl flex items-center justify-center shadow transition-all"><i className="fas fa-minus text-sm"></i></button>
                                    <input type="number" value={scanResult.details[editingRowIdx].qty} onChange={(e) => handleDetailChange(editingRowIdx, 'qty', e.target.value)} className="w-12 bg-transparent outline-none font-black text-center text-lg text-slate-700" />
                                    <button onClick={() => handleDetailChange(editingRowIdx, 'qty', (scanResult.details[editingRowIdx].qty || 1) + 1)} className="w-9 h-9 bg-white hover:bg-blue-50 text-slate-400 hover:text-blue-500 rounded-xl flex items-center justify-center shadow transition-all"><i className="fas fa-plus text-sm"></i></button>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
                            <button onClick={() => setEditingRowIdx(null)} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-2xl font-black text-xs transition-colors">SIMPAN & TUTUP</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
window.ScanTab = ScanTab;
