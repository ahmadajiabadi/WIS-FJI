function PerspectiveCropper({ imageSrc, onProcess, onCancel }) {
    const canvasRef = React.useRef(null);
    const containerRef = React.useRef(null);
    const [imageLoaded, setImageLoaded] = React.useState(false);
    const [activePointIndex, setActivePointIndex] = React.useState(null);
    const [scale, setScale] = React.useState({ x: 1, y: 1 });
    
    // Original image reference
    const imgRef = React.useRef(null);
    
    // 4 Corner points in canvas coordinates
    // Order: TL, TR, BR, BL
    const pointsRef = React.useRef([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
    ]);

    // Handle touch/mouse position relative to canvas
    const getCanvasMousePos = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    // Initialize points when image loads
    React.useEffect(() => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageSrc;
        img.onload = () => {
            imgRef.current = img;
            
            // Set canvas display dimensions (responsive constraint)
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const container = containerRef.current;
            const maxW = Math.min(650, container ? container.clientWidth - 32 : 650);
            const maxH = 450;
            
            let displayW = img.width;
            let displayH = img.height;
            
            if (displayW > maxW) {
                displayH = (maxW / displayW) * displayH;
                displayW = maxW;
            }
            if (displayH > maxH) {
                displayW = (maxH / displayH) * displayW;
                displayH = maxH;
            }
            
            canvas.width = displayW;
            canvas.height = displayH;
            
            // Scaled ratio to map canvas coordinates back to original image coordinates
            setScale({
                x: img.width / displayW,
                y: img.height / displayH
            });
            
            // Initialize 4 corners slightly padded inward
            const padW = displayW * 0.05;
            const padH = displayH * 0.05;
            
            pointsRef.current = [
                { x: padW, y: padH }, // Top-Left
                { x: displayW - padW, y: padH }, // Top-Right
                { x: displayW - padW, y: displayH - padH }, // Bottom-Right
                { x: padW, y: displayH - padH } // Bottom-Left
            ];
            
            setImageLoaded(true);
            draw();
        };
    }, [imageSrc]);

    // Redraw canvas with image, poly overlays, and handle points
    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas || !imgRef.current) return;
        const ctx = canvas.getContext('2d');
        const pts = pointsRef.current;

        // 1. Draw original scaled image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);

        // 2. Draw semi-transparent crop overlay area
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)'; // tailwind blue-500 @ 25% opacity
        ctx.strokeStyle = '#2563eb'; // tailwind blue-600
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3. Draw draggable corner anchors
        pts.forEach((pt, idx) => {
            // Shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3;

            // Inner circle
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 11, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Center spot
            ctx.shadowBlur = 0; // reset shadow
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // 4. Draw magnifying glass zoom-in window if a handle is currently active
        if (activePointIndex !== null) {
            const activePt = pts[activePointIndex];
            
            // Draw magnifying circular loupe in the corner
            const loupeSize = 100;
            const loupeX = canvas.width > 220 ? (activePointIndex === 1 || activePointIndex === 2 ? 20 : canvas.width - loupeSize - 20) : 10;
            const loupeY = 20;

            ctx.save();
            // Loupe circular mask
            ctx.beginPath();
            ctx.arc(loupeX + loupeSize / 2, loupeY + loupeSize / 2, loupeSize / 2, 0, 2 * Math.PI);
            ctx.clip();

            // Draw magnified portion of the image
            const cropSize = 50; // source crop size
            ctx.drawImage(
                imgRef.current,
                (activePt.x * scale.x) - cropSize / 2,
                (activePt.y * scale.y) - cropSize / 2,
                cropSize,
                cropSize,
                loupeX,
                loupeY,
                loupeSize,
                loupeSize
            );

            ctx.restore();

            // Loupe boundary outline
            ctx.strokeStyle = '#f59e0b'; // amber-500
            ctx.lineWidth = 4;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(loupeX + loupeSize / 2, loupeY + loupeSize / 2, loupeSize / 2, 0, 2 * Math.PI);
            ctx.stroke();

            // Reticle crosshair inside loupe
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(loupeX + loupeSize / 2 - 8, loupeY + loupeSize / 2);
            ctx.lineTo(loupeX + loupeSize / 2 + 8, loupeY + loupeSize / 2);
            ctx.moveTo(loupeX + loupeSize / 2, loupeY + loupeSize / 2 - 8);
            ctx.lineTo(loupeX + loupeSize / 2, loupeY + loupeSize / 2 + 8);
            ctx.stroke();
        }
    };

    // Drag-start handler
    const handleStart = (e) => {
        if (!imageLoaded) return;
        const pos = getCanvasMousePos(e);
        const pts = pointsRef.current;
        
        // Find if user clicked/touched near any corner point (threshold 22px)
        const threshold = 22;
        let foundIdx = null;
        
        for (let i = 0; i < 4; i++) {
            const dist = Math.hypot(pts[i].x - pos.x, pts[i].y - pos.y);
            if (dist < threshold) {
                foundIdx = i;
                break;
            }
        }
        
        if (foundIdx !== null) {
            setActivePointIndex(foundIdx);
            e.preventDefault();
        }
    };

    // Drag-move handler
    const handleMove = (e) => {
        if (activePointIndex === null) return;
        const pos = getCanvasMousePos(e);
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Clamp inside canvas bounds
        const pts = [...pointsRef.current];
        pts[activePointIndex] = {
            x: Math.max(0, Math.min(canvas.width, pos.x)),
            y: Math.max(0, Math.min(canvas.height, pos.y))
        };
        
        pointsRef.current = pts;
        draw();
        e.preventDefault();
    };

    // Drag-end handler
    const handleEnd = () => {
        setActivePointIndex(null);
    };

    // Force redraw on mouseup
    React.useEffect(() => {
        if (activePointIndex === null) {
            draw();
        }
    }, [activePointIndex]);

    // Apply the 3D perspective warp and return warped image base64
    const handleCropWarp = () => {
        if (!imageLoaded || !imgRef.current) return;

        // Target clean A4 dimensions (high-res enough for clear OCR)
        const dstWidth = 1200;
        const dstHeight = 1700;

        // Create temporary canvases for source and destination warping
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = imgRef.current.width;
        srcCanvas.height = imgRef.current.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(imgRef.current, 0, 0);

        const dstCanvas = document.createElement('canvas');
        dstCanvas.width = dstWidth;
        dstCanvas.height = dstHeight;

        // Map selection points from canvas space back to high-res source image coordinates
        const srcPoints = pointsRef.current.map(pt => ({
            x: pt.x * scale.x,
            y: pt.y * scale.y
        }));

        // Execute Warp
        const success = window.AppUtils.warpPerspective(srcCanvas, dstCanvas, srcPoints, dstWidth, dstHeight);
        
        if (success) {
            const warpedBase64 = dstCanvas.toDataURL('image/jpeg', 0.95);
            onProcess(warpedBase64);
        } else {
            alert("Terjadi kesalahan komputasi matriks proyeksi. Silakan atur kembali sudut-sudutnya.");
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-8 max-w-2xl w-full flex flex-col max-h-[95vh] border border-slate-100 animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <i className="fas fa-crop-alt text-blue-600"></i> Penyelarasan Kertas
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            Geser 4 titik sudut biru ke pojok kertas untuk meluruskan pemindaian
                        </p>
                    </div>
                    <button onClick={onCancel} className="w-10 h-10 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full flex items-center justify-center transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Canvas Cropper Container */}
                <div ref={containerRef} className="bg-slate-900 rounded-3xl overflow-hidden flex items-center justify-center p-3 relative flex-1 min-h-[300px] border-4 border-slate-800 shadow-inner">
                    <canvas 
                        ref={canvasRef}
                        onMouseDown={handleStart}
                        onMouseMove={handleMove}
                        onMouseUp={handleEnd}
                        onMouseLeave={handleEnd}
                        onTouchStart={handleStart}
                        onTouchMove={handleMove}
                        onTouchEnd={handleEnd}
                        className="max-w-full block rounded-xl shadow-2xl cursor-crosshair touch-none"
                    />
                    {!imageLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-3">
                            <i className="fas fa-circle-notch animate-spin text-3xl text-blue-500"></i>
                            <span className="text-xs font-bold uppercase tracking-wider">Memuat Gambar...</span>
                        </div>
                    )}
                </div>

                {/* Buttons Actions */}
                <div className="flex gap-3 mt-6">
                    <button 
                        onClick={onCancel} 
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3.5 rounded-2xl font-black text-xs transition-colors uppercase tracking-widest"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={handleCropWarp} 
                        disabled={!imageLoaded}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white px-6 py-3.5 rounded-2xl font-black text-xs shadow-xl shadow-blue-200 hover:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-magic text-sm text-yellow-300"></i> Ratakan & Scan
                    </button>
                </div>
            </div>
        </div>
    );
}

window.PerspectiveCropper = PerspectiveCropper;
