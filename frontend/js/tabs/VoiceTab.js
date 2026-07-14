function VoiceTab({ api_url, onSaveSuccess }) {
    const [showSetup, setShowSetup] = React.useState(() => {
        try { return !localStorage.getItem('qc_voice_active_session'); } catch (e) { return true; }
    });

    const handleSetupComplete = (session) => {
        console.log('[VT] handleSetupComplete session:', JSON.stringify(session, null, 2));
        if (session.sidesData) {
            isRestoringRef.current = true;
            sidesDataRef.current = session.sidesData;
            if (session.activeSide) {
                setActiveSide(session.activeSide);
                activeSideRef.current = session.activeSide;
            }
            const sideKey = session.activeSide || 'KIRI';
            const sideData = session.sidesData?.[sideKey];
            if (sideData) {
                if (sideData.metadata) setMetadata(sideData.metadata);
                if (sideData.problemsList) setProblemsListState(sideData.problemsList);
                if (sideData.totalNgFrame !== undefined) setTotalNgFrame(sideData.totalNgFrame);
                if (sideData.totalOk !== undefined) setTotalOk(sideData.totalOk);
                if (sideData.totalScrap !== undefined) setTotalScrap(sideData.totalScrap);
                if (sideData.selectedPart) setSelectedPart(sideData.selectedPart);
                if (sideData.partPoints) setPartPoints(sideData.partPoints);
            }
            if (session.zoom) setZoom(session.zoom);
            localStorage.setItem('qc_voice_active_session', JSON.stringify(session));
            localStorage.setItem('qc_voice_last_interrupted_session', JSON.stringify(session));
            setTimeout(() => { isRestoringRef.current = false; }, 500);
            setShowSetup(false);
            setShowFullManualMode(true);
            return;
        }
        // Populate sides data from setup session immediately
        const sisi = (side, s) => ({
            metadata: { partNumber: s.part_number, partName: s.part_name, model: s.model, linePos: s.line || '', shift: session.shift || '', inspector: session.inspector || '', nama: '', date: session.tanggal || '', side },
            problemsList: [], totalNgFrame: 0, totalOk: 0, totalScrap: 0,
            selectedPart: s, partPoints: [], pendingPoint: null, lastDetectedPoint: null
        });
        // Always update both sides - clear if not provided in new session
        sidesDataRef.current['KIRI'] = session.lhPart ? sisi('KIRI', session.lhPart) : null;
        sidesDataRef.current['KANAN'] = session.rhPart ? sisi('KANAN', session.rhPart) : null;
        
        // Determine which side to start on - prefer LH if exists, otherwise RH
        const startSide = session.lhPart ? 'KIRI' : (session.rhPart ? 'KANAN' : 'KIRI');
        const startPart = session.lhPart || session.rhPart;
        
        // Populate current side state
        if (startPart) {
            const p = startPart;
            setMetadata(prev => ({
                ...prev,
                date: session.tanggal || prev.date,
                shift: session.shift || prev.shift,
                inspector: session.inspector || prev.inspector,
                linePos: p.line || prev.linePos,
                partNumber: p.part_number,
                model: p.model || '',
            }));
            selectedPartRef.current = p;
            setSelectedPart(p);
            setActiveSide(startSide);
            activeSideRef.current = startSide;
            if (p.takt_time || p.takt_time_sec) {
                setTaktTime(p.takt_time || p.takt_time_sec);
            }
        }
        setShowSetup(false);
        setShowFullManualMode(true);
    };

    const [partsList, setPartsList] = React.useState([]);
    const [selectedPart, setSelectedPart] = React.useState(null);
    const [partPoints, setPartPoints] = React.useState([]);
    const [problemsList, setProblemsList] = React.useState([]);
    const [isListening, setIsListening] = React.useState(false);
    const [transcript, setTranscript] = React.useState('');
    const [status, setStatus] = React.useState('idle'); // idle, listening, success, error
    const [lastDetectedPoint, setLastDetectedPoint] = React.useState(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isMetadataCollapsed, setIsMetadataCollapsed] = React.useState(false);

    // States for Voice & Drafts
    const [pendingPoint, _setPendingPoint] = React.useState(null);
    const [totalNgFrame, _setTotalNgFrame] = React.useState(0);
    const [totalOk, _setTotalOk] = React.useState(0);
    const [totalScrap, _setTotalScrap] = React.useState(0);
    const [zoom, setZoom] = React.useState(1.0);
    const [micDevices, setMicDevices] = React.useState([]);
    const [selectedMicId, setSelectedMicId] = React.useState(null);
    const [showVoiceGuidance, setShowVoiceGuidance] = React.useState(false);
    const [voiceValidation, _setVoiceValidation] = React.useState(true);
    const [visualFeedback, _setVisualFeedback] = React.useState(true);
    const [showVisualFeedback, setShowVisualFeedback] = React.useState(false);
    
    // States for active cycle NG points display panel
    const [currentCycleNgPoints, setCurrentCycleNgPoints] = React.useState([]);
    const [isNgPanelCollapsed, setIsNgPanelCollapsed] = React.useState(false);
    const [ngPanelPos, setNgPanelPos] = React.useState({ x: 20, y: 20 });
    const dragStartRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const [visualFeedbackData, setVisualFeedbackData] = React.useState({ type: 'success', message: '' });
    const [visualFeedbackSecondary, setVisualFeedbackSecondary] = React.useState(null);
    const visualFeedbackRef = React.useRef(true);
    const visualFeedbackTimeoutRef = React.useRef(null);
    const [hasDraft, setHasDraft] = React.useState(false);
    const [activeSide, setActiveSide] = React.useState('KIRI'); // 'KIRI' | 'KANAN'
    const activeSideRef = React.useRef('KIRI');

    // Mic enumeration on mount & after permission granted
    const refreshMicDevices = React.useCallback(() => {
        if (window.VoiceRecognition && window.VoiceRecognition.getDevices) {
            window.VoiceRecognition.getDevices().then(devices => {
                if (devices.length > 0) {
                    setMicDevices(devices);

                    // Auto-select USB mic if available, otherwise first device
                    const usbMic = devices.find(d => {
                        const l = (d.label || '').toLowerCase();
                        return l.includes('usb') || l.includes('external') || l.includes('lavalier');
                    });
                    const preferred = usbMic || devices[0];
                    if (preferred && (!selectedMicId || preferred.deviceId !== selectedMicId)) {
                        setSelectedMicId(preferred.deviceId);
                        if (window.VoiceRecognition.setDevice) {
                            window.VoiceRecognition.setDevice(preferred.deviceId);
                        }
                    } else if (!selectedMicId) {
                        setSelectedMicId(devices[0].deviceId);
                    }
                }
            });
        }
    }, []);

    // Warmup Audio & TTS on mount so manual OK/NG buttons have sound
    React.useEffect(() => {
        window.VoiceFeedback.warmupAudio();
        window.VoiceFeedback.primeTTS();
        window.VoiceFeedback.startTTSKeepAlive();
    }, []);

    React.useEffect(() => {
        // VoiceRecognition auto-detect callback — updates dropdown
        if (window.VoiceRecognition && window.VoiceRecognition.setAutoSelectCallback) {
            window.VoiceRecognition.setAutoSelectCallback((deviceId, label) => {
                setSelectedMicId(deviceId);
                refreshMicDevices();
            });
        }
        refreshMicDevices();
    }, [refreshMicDevices]);

    const handleMicChange = React.useCallback((deviceId) => {
        setSelectedMicId(deviceId);
        if (window.VoiceRecognition && window.VoiceRecognition.setDevice) {
            window.VoiceRecognition.setDevice(deviceId || null);
        }
    }, []);
    const handleMouseMove = React.useCallback((e) => {
        if (!dragStartRef.current) return;
        const dx = e.clientX - dragStartRef.current.startX;
        const dy = e.clientY - dragStartRef.current.startY;
        setNgPanelPos({
            x: Math.max(10, dragStartRef.current.posX - dx),
            y: Math.max(10, dragStartRef.current.posY + dy)
        });
    }, []);

    const handleMouseUp = React.useCallback(() => {
        dragStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const handleMouseDown = (e) => {
        const handle = e.target.closest('.drag-handle');
        if (handle) {
            dragStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                posX: ngPanelPos.x,
                posY: ngPanelPos.y
            };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
    };

    React.useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const sidesDataRef = React.useRef({ kiri: null, kanan: null });

    // Restore active session from setup phase (OLD format: lhPart/rhPart)
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem('qc_voice_active_session');
            if (stored) {
                const session = JSON.parse(stored);
                // Only handle OLD format (has lhPart/rhPart, not sidesData)
                if (session.lhPart !== undefined || session.rhPart !== undefined) {
                    console.log('[VT] restore OLD format session:', JSON.stringify({ lhPart: session.lhPart ? session.lhPart.part_number : null, rhPart: session.rhPart ? session.rhPart.part_number : null }, null, 2));
                    const sisi = (side, s) => ({
                        metadata: { partNumber: s.part_number, partName: s.part_name, model: s.model, linePos: s.line || '', shift: session.shift || '', inspector: session.inspector || '', nama: '', date: session.tanggal || '', side },
                        problemsList: [], totalNgFrame: 0, totalOk: 0, totalScrap: 0,
                        selectedPart: s, partPoints: [], pendingPoint: null, lastDetectedPoint: null
                    });
                    // Always update both sides - clear if not provided
                    sidesDataRef.current['KIRI'] = session.lhPart ? sisi('KIRI', session.lhPart) : null;
                    sidesDataRef.current['KANAN'] = session.rhPart ? sisi('KANAN', session.rhPart) : null;
                    
                    // Determine which side to start on
                    const startSide = session.lhPart ? 'KIRI' : (session.rhPart ? 'KANAN' : 'KIRI');
                    const startPart = session.lhPart || session.rhPart;
                    
                    if (startPart) {
                        const p = startPart;
                        setMetadata(prev => ({
                            ...prev,
                            date: session.tanggal || prev.date,
                            shift: session.shift || prev.shift,
                            inspector: session.inspector || prev.inspector,
                            linePos: p.line || prev.linePos,
                            partNumber: p.part_number,
                            model: p.model || '',
                        }));
                        selectedPartRef.current = p;
                        setSelectedPart(p);
                        setActiveSide(startSide);
                        activeSideRef.current = startSide;
                    }
                }
            }
        } catch (e) { console.warn('[VOICE] Failed to restore session:', e); }
    }, []);

    const {
        efficiencyTimerRunning, efficiencyElapsed, efficiencyItems, currentTaktTime,
        isTimerPaused,
        efficiencyItemsRef, efficiencyTimerRunningRef, efficiencyTimerStartRef,
        currentTaktTimeRef, isTimerPausedRef, sessionIdRef, sessionStartRef,
        setEfficiencyItems, setIsTimerPaused,
        setEfficiencyTimerRunning, setEfficiencyElapsed, setCurrentTaktTime,
        breaksListRef,
        loadBreaksList, checkIsBreakTime, setTaktTime,
        recordEfficiencyItem, resetEfficiencyTimer,
        startEfficiencyTimer, stopEfficiencyTimer,
        pauseEfficiencyTimer, resumeEfficiencyTimer,
        handleOkEfficiency, handleNgFrameEfficiency,
        handleManualOkEfficiency, handleManualNgFrameEfficiency,
        forceRecordEfficiency,
        undoLastEfficiency,
    } = window.useEfficiencyTimer(api_url);

    // Inline editing state for table rows
    const [suggestionSearchTerm, setSuggestionSearchTerm] = React.useState('');
    const [showSuggestionRow, setShowSuggestionRow] = React.useState(-1);
    const [problemSuggestions, setProblemSuggestions] = React.useState([]);
    const [partPickerSearch, setPartPickerSearch] = React.useState('');
    const [showPartPickerModal, setShowPartPickerModal] = React.useState(false);
    const [partPickerExpanded, setPartPickerExpanded] = React.useState({});
    const [showFullManualMode, setShowFullManualMode] = React.useState(() => {
        try { return !!localStorage.getItem('qc_voice_active_session'); } catch (e) { return false; }
    });
    const [manualPointClick, setManualPointClick] = React.useState(null);
    const [showPointSelectorGrid, setShowPointSelectorGrid] = React.useState(false);
    const [manualProblemList, setManualProblemList] = React.useState([]);
    const [manualProblemSearch, setManualProblemSearch] = React.useState('');
    const [showProgressModal, setShowProgressModal] = React.useState(false);

    // Form metadata state
    const [metadata, setMetadata] = React.useState({
        inspector: '',
        shift: '1',
        linePos: '',
        partNumber: '',
        model: '',
        date: new Date(Date.now() + new Date().getTimezoneOffset() * -60000).toISOString().split('T')[0]
    });

    // Refs to eliminate stale React closures inside continuous speech callbacks
    const pendingPointRef = React.useRef(null);
    const problemsListRef = React.useRef([]);
    const totalNgFrameRef = React.useRef(0);
    const totalOkRef = React.useRef(0);
    const totalScrapRef = React.useRef(0);
    const voiceValidationRef = React.useRef(true);
    const currentCycleNgPointsRef = React.useRef([]);

    // Helper: stop SpeechRecognition dan lepas mic stream
    const stopAllCapture = React.useCallback(() => {
        if (window.VoiceRecognition?.isListening) {
            window.VoiceRecognition.stop();
        }
    }, []);
    const partPointsRef = React.useRef([]);
    const isListeningRef = React.useRef(false);
    const [isMuted, setIsMuted] = React.useState(false);
    const isMutedRef = React.useRef(false);

    // Abnormality popup state
    const [showAbnormalPopup, setShowAbnormalPopup] = React.useState(false);
    const showAbnormalPopupRef = React.useRef(false);
    const [abnormalCategory, setAbnormalCategory] = React.useState(null); // null=level1, 'Man'|etc=level2
    const abnormalCategoryRef = React.useRef(null);
    const [showAbnormalSuccess, setShowAbnormalSuccess] = React.useState(false);
    const [showSaveConfirm, setShowSaveConfirm] = React.useState(false);
    const [showDiagnostic, setShowDiagnostic] = React.useState(false);
    const [diagnosticMessage, setDiagnosticMessage] = React.useState('');

    const metadataRef = React.useRef(metadata);
    const selectedPartRef = React.useRef(null);
    const lastDetectedPointRef = React.useRef(null);
    const blinkTimeoutRef = React.useRef(null);
    const voiceCooldownRef = React.useRef(0);
    const isRestoringRef = React.useRef(false);
    
    const wakeLockRef = React.useRef(null);
    const suggestionBlurRef = React.useRef(null);
    const visualizerContainerRef = React.useRef(null);

    // Break popup state
    const [isBreakPaused, setIsBreakPaused] = React.useState(false);
    const isBreakPausedRef = React.useRef(false);
    const breakAutoPausedRef = React.useRef(false);
    const [showBreakPopup, setShowBreakPopup] = React.useState(false);
    const [currentBreakInfo, setCurrentBreakInfo] = React.useState(null);
    const isBreakWaitingCycleRef = React.useRef(false);
    const prevTotalRef = React.useRef({ ok: 0, ng: 0 });

    // Zombie reload overlay
    const [showReloadOverlay, setShowReloadOverlay] = React.useState(false);

    const findCurrentBreak = () => {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayCol = dayNames[now.getDay()];
        return breaksListRef.current.find(b => {
            if (!b.active) return false;
            if (!b[todayCol]) return false;
            const startParts = b.start_time.split(':');
            const endParts = b.end_time.split(':');
            const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
            const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        });
    };

    // Switch between KIRI and KANAN side, saving/restoring state
    const switchSide = (side) => {
        if (side === activeSideRef.current) return;

        // Check if target side has a part number configured
        const targetSideData = sidesDataRef.current[side];
        if (!targetSideData || !targetSideData.metadata?.partNumber) {
            const sideName = side === 'KANAN' ? 'kanan' : 'kiri';
            const feedbackText = `Tidak ada sisi ${sideName}`;
            speakFeedback(feedbackText);
            setTranscript(feedbackText);
            triggerVisualFeedback('error', feedbackText);
            return;
        }

        // Cooldown tidak direset agar OK/NG/Scrap tetap ter-block 6 detik setelah auto-switch
        // Save current side data — use refs to avoid stale closure
        sidesDataRef.current[activeSideRef.current] = {
            metadata: JSON.parse(JSON.stringify(metadataRef.current)),
            problemsList: [...problemsListRef.current],
            totalNgFrame: totalNgFrameRef.current,
            totalOk: totalOkRef.current,
            totalScrap: totalScrapRef.current,
            selectedPart: selectedPartRef.current ? { ...selectedPartRef.current } : null,
            partPoints: [...partPointsRef.current],
            pendingPoint: pendingPointRef.current,
            lastDetectedPoint: lastDetectedPointRef.current,
            currentCycleNgPoints: [...(currentCycleNgPointsRef.current || [])],
        };
        setActiveSide(side);
        // Restore target side or init empty
        const data = sidesDataRef.current[side];
        if (data) {
            isRestoringRef.current = true;
            setMetadata(data.metadata);
            setProblemsListState(data.problemsList);
            setTotalNgFrame(data.totalNgFrame);
            setTotalOk(data.totalOk);
            setTotalScrap(data.totalScrap);
            if (data.partPoints) setPartPoints(data.partPoints);
            setSelectedPart(data.selectedPart);
            setPendingPoint(data.pendingPoint ?? null);
            setLastDetectedPoint(data.lastDetectedPoint ?? null);
            setCurrentCycleNgPoints(data.currentCycleNgPoints || []);
            if (data.selectedPart && (data.selectedPart.takt_time || data.selectedPart.takt_time_sec)) {
                setTaktTime(data.selectedPart.takt_time || data.selectedPart.takt_time_sec);
            }
            setTimeout(() => { isRestoringRef.current = false; }, 500);
        } else {
            isRestoringRef.current = true;
            setMetadata(prev => ({ ...prev, partNumber: '', model: '' }));
            setProblemsListState([]);
            setTotalNgFrame(0);
            setTotalOk(0);
            setTotalScrap(0);
            setPartPoints([]);
            setSelectedPart(null);
            setPendingPoint(null);
            setLastDetectedPoint(null);
            setCurrentCycleNgPoints([]);
            setTimeout(() => { isRestoringRef.current = false; }, 500);
        }
        return true;
    };

    const toggleSideIfOtherHasPart = () => {
        const otherSide = activeSide === 'KIRI' ? 'KANAN' : 'KIRI';
        if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
            switchSide(otherSide);
        }
    };

    const handleIncrementOk = (autoToggle = true) => {
        const validPoints = (currentCycleNgPointsRef.current || []).filter(Boolean);
        if (validPoints.length > 0) {
            window.VoiceFeedback.playBeep(330, 0.3, 'sawtooth');
            speakFeedback('Seharusnya Reject');
            triggerVisualFeedback('error', 'Seharusnya Reject');
            return false;
        }
        setTotalOk(prev => prev + 1);
        forceRecordEfficiency('OK', activeSideRef.current);
        window.VoiceFeedback.playOkBeep();
        speakFeedback('OK');
        triggerVisualFeedback('success', 'Tambah Total OK');
        if (autoToggle) {
            toggleSideIfOtherHasPart();
        }
        return true;
    };

    const handleIncrementNgFrame = (autoToggle = true) => {
        setTotalNgFrame(prev => prev + 1);
        forceRecordEfficiency('NG');
        window.VoiceFeedback.playNgFrameBeep();
        speakFeedback('Reject');
        triggerVisualFeedback('success', 'Tambah Cacat Frame');
        if (autoToggle) {
            toggleSideIfOtherHasPart();
        }
        return true;
    };

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                console.log("Screen Wake Lock active");
            } catch (err) {
                console.warn("Wake Lock request failed:", err);
            }
        }
    };

    const releaseWakeLock = () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release()
                .then(() => {
                    wakeLockRef.current = null;
                    console.log("Screen Wake Lock released");
                });
        }
    };

    React.useEffect(() => {
        if (!showSetup) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }
    }, [showSetup]);

    React.useEffect(() => {
        const handleVisibilityChange = async () => {
            if (!showSetup && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            releaseWakeLock();
        };
    }, [showSetup]);

    // Cleanup mic when switching away from Voice tab
    React.useEffect(() => {
        return () => {
            if (window.VoiceRecognition.stop) window.VoiceRecognition.stop();
            if (visualFeedbackTimeoutRef.current) clearTimeout(visualFeedbackTimeoutRef.current);
        };
    }, []);



    // Wrap setter state functions to keep Refs in sync instantly
    const setPendingPoint = (val) => {
        _setPendingPoint(val);
        pendingPointRef.current = val;
    };

    const setTotalNgFrame = (val) => {
        const oldVal = totalNgFrameRef.current;
        const value = typeof val === 'function' ? val(oldVal) : val;
        _setTotalNgFrame(value);
        totalNgFrameRef.current = value;
        if (value > oldVal) {
            setCurrentCycleNgPoints([]);
            currentCycleNgPointsRef.current = [];
            if (sidesDataRef.current && sidesDataRef.current[activeSideRef.current]) {
                sidesDataRef.current[activeSideRef.current].currentCycleNgPoints = [];
            }
        }
    };

    const setTotalOk = (val) => {
        const oldVal = totalOkRef.current;
        const value = typeof val === 'function' ? val(oldVal) : val;
        _setTotalOk(value);
        totalOkRef.current = value;
        if (value > oldVal) {
            setCurrentCycleNgPoints([]);
            currentCycleNgPointsRef.current = [];
            if (sidesDataRef.current && sidesDataRef.current[activeSideRef.current]) {
                sidesDataRef.current[activeSideRef.current].currentCycleNgPoints = [];
            }
        }
    };

    const setTotalScrap = (val) => {
        const value = typeof val === 'function' ? val(totalScrapRef.current) : val;
        _setTotalScrap(value);
        totalScrapRef.current = value;
    };

    const setVoiceValidation = (val) => {
        _setVoiceValidation(val);
        voiceValidationRef.current = val;
        if (val) {
            window.VoiceFeedback.primeTTS();
            window.VoiceFeedback.startTTSKeepAlive();
        } else {
            window.VoiceFeedback.stopTTSKeepAlive();
        }
    };

    const setVisualFeedback = (val) => {
        _setVisualFeedback(val);
        visualFeedbackRef.current = val;
    };

    const setMuted = (val) => {
        setIsMuted(val);
        isMutedRef.current = val;
    };

    const setProblemsListState = (val) => {
        const oldList = Array.isArray(problemsListRef.current) ? problemsListRef.current : [];
        const nextList = typeof val === 'function' ? val(oldList) : val;
        const safeNextList = Array.isArray(nextList) ? nextList : [];
        setProblemsList(safeNextList);
        problemsListRef.current = safeNextList;

        if (safeNextList.length === 0) {
            setCurrentCycleNgPoints([]);
        } else if (safeNextList.length > oldList.length) {
            const addedCount = safeNextList.length - oldList.length;
            const addedItems = safeNextList.slice(0, addedCount).filter(Boolean);
            setCurrentCycleNgPoints(prev => [...addedItems, ...(Array.isArray(prev) ? prev : [])].filter(Boolean));
        } else if (safeNextList.length < oldList.length) {
            setCurrentCycleNgPoints(prev => 
                (Array.isArray(prev) ? prev : []).filter(item => 
                    item && safeNextList.some(n => n && n.timestamp === item.timestamp)
                )
            );
        }
    };

    // Sync abnormality refs
    React.useEffect(() => { showAbnormalPopupRef.current = showAbnormalPopup; }, [showAbnormalPopup]);
    React.useEffect(() => { abnormalCategoryRef.current = abnormalCategory; }, [abnormalCategory]);
    React.useEffect(() => { currentCycleNgPointsRef.current = currentCycleNgPoints; }, [currentCycleNgPoints]);

    // Synchronize refs for stale-closure-safe access
    React.useEffect(() => {
        partPointsRef.current = partPoints;
    }, [partPoints]);
    React.useEffect(() => {
        metadataRef.current = metadata;
    }, [metadata]);
    React.useEffect(() => {
        selectedPartRef.current = selectedPart;
    }, [selectedPart]);
    React.useEffect(() => {
        lastDetectedPointRef.current = lastDetectedPoint;
    }, [lastDetectedPoint]);

    // Check for saved local draft and active session on mount
    React.useEffect(() => {
        const savedDraft = localStorage.getItem('qc_voice_draft');
        if (savedDraft) {
            setHasDraft(true);
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.getVoices();
        }

        // Refresh voice guides & commands from server so any Settings changes apply
        if (window.loadVoiceGuidesFromServer) {
            window.loadVoiceGuidesFromServer(api_url);
        }
        if (window.loadVoiceCommandsFromServer) {
            window.loadVoiceCommandsFromServer(api_url);
        }
        if (window.loadAbnormalityCategories) {
            window.loadAbnormalityCategories(api_url);
        }
        if (window.loadInspectorNames) {
            window.loadInspectorNames(api_url);
        }
        if (window.loadLinePositions) {
            window.loadLinePositions(api_url);
        }

        // Restore active tab-switch session
        const activeSession = localStorage.getItem('qc_voice_active_session');
        if (activeSession) {
            try {
                isRestoringRef.current = true;
                const data = JSON.parse(activeSession);
                console.log('[VT] restore tab-switch session:', JSON.stringify({ hasSidesData: !!data.sidesData, sidesKeys: data.sidesData ? Object.keys(data.sidesData) : [], lhPart: data.lhPart?.part_number, rhPart: data.rhPart?.part_number }, null, 2));
                if (data.sidesData) {
                    sidesDataRef.current = data.sidesData;
                }
                if (data.activeSide) setActiveSide(data.activeSide);
                // Restore current side's data
                const sideKey = data.activeSide || 'KIRI';
                const sideData = data.sidesData?.[sideKey];
                if (sideData) {
                    if (sideData.metadata) setMetadata(sideData.metadata);
                    if (sideData.problemsList) setProblemsListState(sideData.problemsList);
                    if (sideData.totalNgFrame !== undefined) setTotalNgFrame(sideData.totalNgFrame);
                    if (sideData.totalOk !== undefined) setTotalOk(sideData.totalOk);
                    if (sideData.totalScrap !== undefined) setTotalScrap(sideData.totalScrap);
                    if (sideData.selectedPart) setSelectedPart(sideData.selectedPart);
                    if (sideData.partPoints) setPartPoints(sideData.partPoints);
                } else {
                    if (data.metadata) setMetadata(data.metadata);
                    if (data.problemsList) setProblemsListState(data.problemsList);
                    if (data.totalNgFrame) setTotalNgFrame(data.totalNgFrame);
                    if (data.totalOk) setTotalOk(data.totalOk);
                    if (data.totalScrap) setTotalScrap(data.totalScrap);
                    if (data.selectedPart) setSelectedPart(data.selectedPart);
                }
                if (data.zoom) setZoom(data.zoom);
                setTimeout(() => {
                    isRestoringRef.current = false;
                }, 500);
            } catch (e) {
                console.error("Error loading active voice session:", e);
                isRestoringRef.current = false;
            }
        }
    }, []);

    // Auto-save active tab-switch session (dual-side aware)
    React.useEffect(() => {
        // Skip save during initial session restoration to avoid overwriting restored data
        if (isRestoringRef.current) return;
        
        // If we are in setup phase, clear active session and do not save
        if (showSetup) {
            try {
                localStorage.removeItem('qc_voice_active_session');
            } catch (e) {}
            return;
        }
        
        // Ensure current active side's data is saved to ref before persisting
        if (activeSide && sidesDataRef.current) {
            sidesDataRef.current[activeSide] = {
                metadata: JSON.parse(JSON.stringify(metadata)),
                problemsList: [...problemsList],
                totalNgFrame,
                totalOk,
                totalScrap,
                selectedPart: selectedPart ? { ...selectedPart } : null,
                partPoints: [...partPoints],
                pendingPoint: pendingPoint,
                lastDetectedPoint: lastDetectedPoint,
            };
        }
        console.log('[VT] auto-save: sidesDataRef', JSON.stringify({ kiri: sidesDataRef.current.kiri ? { part: sidesDataRef.current.kiri.metadata?.partNumber } : null, kanan: sidesDataRef.current.kanan ? { part: sidesDataRef.current.kanan.metadata?.partNumber } : null }, null, 2));
        const sessionData = {
            sidesData: sidesDataRef.current,
            activeSide,
            zoom
        };
        // Check if there's any meaningful data across both sides
        const hasData = Object.values(sidesDataRef.current).some(sd =>
            sd && (sd.metadata?.inspector || sd.problemsList?.length > 0 || sd.totalNgFrame > 0 || sd.totalOk > 0 || sd.totalScrap > 0)
        );
        if (hasData) {
            localStorage.setItem('qc_voice_active_session', JSON.stringify(sessionData));
            localStorage.setItem('qc_voice_last_interrupted_session', JSON.stringify(sessionData));
        }
    }, [metadata, problemsList, totalNgFrame, totalOk, totalScrap, selectedPart, zoom, partPoints, pendingPoint, lastDetectedPoint, activeSide]);

    // Handle auto-fullscreen toggle based on showSetup state
    React.useEffect(() => {
        if (!showSetup) {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.log('Failed to enter fullscreen:', err));
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } else {
            if (document.fullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(err => console.log('Failed to exit fullscreen:', err));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        }
    }, [showSetup]);

    // Sync ref with state to avoid stale closure in speech recognition
    React.useEffect(() => { activeSideRef.current = activeSide; }, [activeSide]);

    // Auto-collapse metadata form when part number is selected
    React.useEffect(() => {
        if (metadata.partNumber) {
            setIsMetadataCollapsed(true);
        }
    }, [metadata.partNumber]);

    // Fetch master parts on mount
    React.useEffect(() => {
        fetch(`${api_url}/api/master/parts`)
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') setPartsList(res.data);
            })
            .catch(err => console.error("Error fetching master parts:", err));
    }, [api_url]);

    // Break detection interval — pauses/resumes timer via breakAutoPausedRef
    React.useEffect(() => {
        const iv = setInterval(() => {
            const inBreak = checkIsBreakTime();
            if (inBreak && !isBreakPausedRef.current) {
                isBreakPausedRef.current = true;
                setIsBreakPaused(true);
                if (!isTimerPausedRef.current) {
                    pauseEfficiencyTimer();
                    breakAutoPausedRef.current = true;
                } else {
                    breakAutoPausedRef.current = false;
                }
                stopAllCapture();
                setIsListening(false);
                isListeningRef.current = false;
                setStatus('idle');
                setCurrentBreakInfo(findCurrentBreak());
                setShowBreakPopup(true);
                isBreakWaitingCycleRef.current = false;
            } else if (!inBreak && isBreakPausedRef.current) {
                isBreakPausedRef.current = false;
                setIsBreakPaused(false);
                setShowBreakPopup(false);
                setCurrentBreakInfo(null);
                isBreakWaitingCycleRef.current = false;
                if (breakAutoPausedRef.current) {
                    resumeEfficiencyTimer();
                    breakAutoPausedRef.current = false;
                }
                if (efficiencyTimerRunningRef.current && !isTimerPausedRef.current && !isListeningRef.current) {
                    toggleListening();
                }
            }
        }, 1000);
        return () => clearInterval(iv);
    }, [checkIsBreakTime, pauseEfficiencyTimer, resumeEfficiencyTimer]);

    // Detect 1-cycle completion (OK or NG increment) after "1 Cycle" override
    React.useEffect(() => {
        const prev = prevTotalRef.current;
        const increased = (totalOk > prev.ok) || (totalNgFrame > prev.ng);
        prevTotalRef.current = { ok: totalOk, ng: totalNgFrame };
        if (isBreakWaitingCycleRef.current && increased) {
            isBreakWaitingCycleRef.current = false;
            if (!checkIsBreakTime()) return;
            if (!isTimerPausedRef.current) {
                pauseEfficiencyTimer();
                breakAutoPausedRef.current = true;
            }
            stopAllCapture();
            setIsListening(false);
            isListeningRef.current = false;
            setStatus('idle');
            setCurrentBreakInfo(findCurrentBreak());
            setShowBreakPopup(true);
        }
    }, [totalOk, totalNgFrame]);

    // Fetch point coordinates when part or side changes
    React.useEffect(() => {
        if (metadata.partNumber) {
            fetch(`${api_url}/api/master/points/${encodeURIComponent(metadata.partNumber)}?side=${activeSide}&model=${encodeURIComponent(metadata.model || '')}`)
                .then(res => res.json())
                .then(res => {
                    if (res.status === 'success') setPartPoints(res.data);
                })
                .catch(err => console.error("Error fetching points:", err));
        } else {
            setPartPoints([]);
        }
        
        // ONLY reset if we are NOT restoring an active session!
        if (!isRestoringRef.current) {
            setProblemsListState([]);
            setTotalNgFrame(0);
            setTotalOk(0);
            setTotalScrap(0);
            setPendingPoint(null);
        }
    }, [metadata.partNumber, activeSide, api_url]);

    // Fetch problem suggestions for inline editing
    const fetchProblemSuggestions = React.useCallback(async (searchText = '') => {
        try {
            const res = await fetch(`${api_url}/api/suggestions/problems?partNumber=${encodeURIComponent(metadata.partNumber || '')}`);
            const result = await res.json();
            if (result.status === 'success') {
                const filtered = searchText
                    ? result.data.filter(p => p.text.toLowerCase().includes(searchText.toLowerCase()))
                    : result.data;
                setProblemSuggestions(filtered);
            }
        } catch (e) {
            console.error("Fetch suggestions error:", e);
        }
    }, [api_url, metadata.partNumber]);

    const addBlankRow = () => {
        const newItem = { checkNo: '', pointCheck: '', problem: '', defectCode: '', qty: 1, location: null, pageIndex: 0, confidence: 100, lowConfidenceReason: '', timestamp: Date.now() };
        setProblemsListState(prev => [newItem, ...prev]);
    };

    const updateRow = (idx, field, value) => {
        setProblemsListState(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    };

    const handleSelectSuggestion = (idx, text) => {
        updateRow(idx, 'problem', text);
        setShowSuggestionRow(-1);
        const t = text.toLowerCase();
        const matchedGuidance = window.DEFECT_GUIDANCE?.find(g =>
            g.name.toLowerCase().includes(t) ||
            t.includes(g.name.toLowerCase()) ||
            g.keywords?.some(k => t.includes(k.toLowerCase()) || k.toLowerCase().includes(t))
        );
        if (matchedGuidance) {
            updateRow(idx, 'defectCode', matchedGuidance.code);
        }
    };

    const lastSyncedInspectorRef = React.useRef("");
    const firstLiveSyncDoneRef = React.useRef(false);

    // Record abnormality via API
    const recordAbnormality = React.useCallback(async (problemName) => {
        const cat = abnormalCategoryRef.current;
        try {
            const res = await fetch(`${api_url}/api/abnormality`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inspector: metadataRef.current.inspector,
                    part_number: metadataRef.current.partNumber,
                    model: metadataRef.current.model,
                    shift: metadataRef.current.shift,
                    line_pos: metadataRef.current.linePos,
                    side: activeSideRef.current,
                    category_4m1e: cat,
                    problem_category: problemName
                })
            });
            const result = await res.json();
            if (result.status === 'success') {
                setShowAbnormalPopup(false);
                showAbnormalPopupRef.current = false;
                setAbnormalCategory(null);
                abnormalCategoryRef.current = null;
                setShowAbnormalSuccess(problemName);
                setTimeout(() => setShowAbnormalSuccess(false), 2000);
                window.VoiceFeedback.playBeep(784, 0.15);
                speakFeedback(`Abnormalitas tercatat, ${cat}, ${problemName}`);
                setTranscript(`Abnormality: ${cat} - ${problemName}`);
            }
        } catch (err) {
            console.error('Record abnormality error:', err);
            speakFeedback('Gagal merekam abnormalitas');
        }
    }, [api_url]);

    // Send live-update payloads for both sides (one row per side)
    const sendLiveUpdateNow = React.useCallback(async () => {
        try {
            const inspector = metadataRef.current.inspector;
            if (!localStorage.getItem('qc_voice_active_session') || !inspector) return;

            // Build payloads for both sides that have a part number
            const sidesToSync = [];
            // Current side: read from latest state via refs
            const currentKey = activeSideRef.current;
            const currentEffItems = efficiencyItemsRef.current.filter(item => !item.side || item.side === currentKey);
            const currentTotalChecks = currentEffItems.length;
            const currentTotalCheckTime = currentTotalChecks > 0 ? currentEffItems.reduce((sum, item) => sum + item.duration, 0) : 0;
            const currentAvgEff = currentTotalChecks > 0 ? Math.round(currentEffItems.reduce((sum, item) => sum + item.efficiency, 0) / currentTotalChecks) : 0;

            const currentData = {
                side: currentKey,
                shift: metadataRef.current.shift,
                linePos: metadataRef.current.linePos,
                partNumber: metadataRef.current.partNumber,
                partName: selectedPartRef.current ? selectedPartRef.current.part_name : '',
                model: metadataRef.current.model,
                totalOk: totalOkRef.current,
                totalNg: totalNgFrameRef.current,
                totalScrap: totalScrapRef.current,
                problemsList: problemsListRef.current,
                efficiency: currentAvgEff,
                totalCheckTime: Math.round(currentTotalCheckTime),
                totalChecks: currentTotalChecks,
            };
            if (currentData.partNumber) sidesToSync.push(currentData);

            // Other side: read from ref
            const otherKey = currentKey === 'KIRI' ? 'KANAN' : 'KIRI';
            const otherData = sidesDataRef.current[otherKey];
            if (otherData && otherData.metadata?.partNumber) {
                const otherEffItems = efficiencyItemsRef.current.filter(item => !item.side || item.side === otherKey);
                const otherTotalChecks = otherEffItems.length;
                const otherTotalCheckTime = otherTotalChecks > 0 ? otherEffItems.reduce((sum, item) => sum + item.duration, 0) : 0;
                const otherAvgEff = otherTotalChecks > 0 ? Math.round(otherEffItems.reduce((sum, item) => sum + item.efficiency, 0) / otherTotalChecks) : 0;

                sidesToSync.push({
                    side: otherKey,
                    shift: otherData.metadata?.shift || metadataRef.current.shift,
                    linePos: otherData.metadata?.linePos || metadataRef.current.linePos,
                    partNumber: otherData.metadata.partNumber,
                    partName: otherData.selectedPart?.part_name || '',
                    model: otherData.metadata.model || '',
                    totalOk: otherData.totalOk || 0,
                    totalNg: otherData.totalNgFrame || 0,
                    totalScrap: otherData.totalScrap || 0,
                    problemsList: otherData.problemsList || [],
                    efficiency: otherAvgEff,
                    totalCheckTime: Math.round(otherTotalCheckTime),
                    totalChecks: otherTotalChecks,
                });
            }

            for (const sd of sidesToSync) {
                await fetch(`${api_url}/api/dashboard/live-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inspector,
                        side: sd.side,
                        shift: sd.shift,
                        linePos: sd.linePos,
                        partNumber: sd.partNumber,
                        partName: sd.partName,
                        model: sd.model,
                        totalOk: sd.totalOk,
                        totalNg: sd.totalNg,
                        totalScrap: sd.totalScrap,
                        problemsList: sd.problemsList,
                        efficiency: sd.efficiency,
                        totalCheckTime: sd.totalCheckTime,
                        totalChecks: sd.totalChecks,
                    })
                });
            }
            lastSyncedInspectorRef.current = inspector;
            firstLiveSyncDoneRef.current = true;
        } catch (err) {
            console.error("Failed to sync live progress:", err);
        }
    }, [api_url]);

    // Auto-sync live progress to database for Pimpinan real-time monitoring (dual-side aware)
    React.useEffect(() => {
        if (!metadata.inspector || !metadata.inspector.trim()) {
            if (lastSyncedInspectorRef.current) {
                fetch(`${api_url}/api/dashboard/live-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inspector: lastSyncedInspectorRef.current })
                }).catch(e => console.error("Failed to clean up cleared inspector:", e));
                lastSyncedInspectorRef.current = "";
            }
            return;
        }

        // Immediate sync on first valid data (inspector + part), no debounce
        if (!firstLiveSyncDoneRef.current && metadata.partNumber && metadata.inspector.trim()) {
            sendLiveUpdateNow();
            return; // no debounce needed, subsequent changes will use debounce
        }

        const delayDebounce = setTimeout(async () => {
            try {
                // If inspector name changed, delete the old session
                if (lastSyncedInspectorRef.current && lastSyncedInspectorRef.current !== metadata.inspector) {
                    await fetch(`${api_url}/api/dashboard/live-delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ inspector: lastSyncedInspectorRef.current })
                    });
                }
                sendLiveUpdateNow();
            } catch (err) {
                console.error("Failed to sync live progress:", err);
            }
        }, 300); // 300ms debounce to avoid flooding requests

        return () => clearTimeout(delayDebounce);
    }, [metadata.inspector, metadata.shift, metadata.linePos, metadata.partNumber, metadata.model, totalOk, totalNgFrame, totalScrap, problemsList, selectedPart, partPoints, activeSide, api_url, sendLiveUpdateNow]);

    // Per-item efficiency recording → POST to backend
    // Per-item efficiency recording → POST to backend
    React.useEffect(() => {
        window.__onCheckRecorded = (startTime, endTime, durationSec, takt, eff, judgment, session_id, recordedSide) => {
            const targetSide = recordedSide || activeSide;
            const targetSd = sidesDataRef.current[targetSide];
            const partNum = targetSd?.metadata?.partNumber || metadata.partNumber;
            const modelVal = targetSd?.metadata?.model || metadata.model;
            if (!partNum || !judgment) return;
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
            fetch(`${api_url}/api/efficiency/record-item`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    part_number: partNum,
                    model: modelVal,
                    line_pos: metadata.linePos,
                    side: targetSide,
                    date: metadata.date,
                    shift: metadata.shift,
                    inspector: metadata.inspector,
                    check_start: fmt(startDate),
                    check_end: fmt(endDate),
                    duration_sec: Math.round(durationSec * 100) / 100,
                    takt_time_sec: takt,
                    efficiency: eff,
                    judgment,
                    total_ng_point: targetSd?.problemsList?.length || 0,
                    session_id
                })
            }).catch(e => console.error('Record item failed:', e));
        };
        return () => { window.__onCheckRecorded = null; };
    }, [api_url, metadata, activeSide]);

    // Wrapper functions for VoiceFeedback module
    const speakFeedback = (text) => window.VoiceFeedback.speakFeedback(text, voiceValidationRef.current);
    const triggerSpeechBounce = () => window.VoiceFeedback.triggerSpeechBounce(visualizerContainerRef.current);

    const triggerVisualFeedback = (type, message) => {
        if (!visualFeedbackRef.current) return;
        if (visualFeedbackTimeoutRef.current) clearTimeout(visualFeedbackTimeoutRef.current);
        setVisualFeedbackData({ type, message });
        setVisualFeedbackSecondary(null);
        setShowVisualFeedback(true);
        visualFeedbackTimeoutRef.current = setTimeout(() => {
            setShowVisualFeedback(false);
        }, 2000);
    };

    const triggerVisualFeedbackDual = (type, primary, secondary) => {
        if (!visualFeedbackRef.current) return;
        if (visualFeedbackTimeoutRef.current) clearTimeout(visualFeedbackTimeoutRef.current);
        setVisualFeedbackData({ type, message: primary });
        setVisualFeedbackSecondary({ type, message: secondary });
        setShowVisualFeedback(true);
        visualFeedbackTimeoutRef.current = setTimeout(() => {
            setShowVisualFeedback(false);
        }, 2000);
    };

    const handleFinishCycle = () => {
        // Cooldown check to prevent double triggering
        if (Date.now() - voiceCooldownRef.current < 2000) return;
        voiceCooldownRef.current = Date.now();

        const hasNgPoints = (currentCycleNgPointsRef.current || []).filter(Boolean).length > 0;
        if (!hasNgPoints) {
            const okSuccess = handleIncrementOk(false);
            if (okSuccess) {
                setTranscript("Klik: Selesai (Auto OK).");
                setStatus('success');
                triggerVisualFeedback('success', 'Tambah Total OK');
                setTimeout(() => {
                    const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                    if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                        setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                        switchSide(otherSide);
                    }
                    setStatus(isListeningRef.current ? 'listening' : 'idle');
                }, 1000);
            }
        } else {
            setTotalNgFrame(prev => prev + 1);
            handleNgFrameEfficiency(activeSideRef.current);
            window.VoiceFeedback.playNgFrameBeep();
            speakFeedback('Reject');
            setTranscript("Klik: Selesai (Auto NG Frame).");
            setStatus('success');
            triggerVisualFeedback('success', 'Tambah Cacat Frame');
            setTimeout(() => {
                const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                    setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                    switchSide(otherSide);
                }
                setStatus(isListeningRef.current ? 'listening' : 'idle');
            }, 1000);
        }
    };

    const handleUndoLastCycle = async () => {
        const lastItem = await undoLastEfficiency();
        if (lastItem) {
            const undoneSide = lastItem.side || activeSideRef.current; // 'KIRI' or 'KANAN'

            // 1. Switch side back if it was switched
            if (activeSideRef.current !== undoneSide) {
                switchSide(undoneSide);
                speakFeedback(`Kembali ke sisi ${undoneSide.toLowerCase()}`);
            }

            // 2. Decrement counter
            if (lastItem.judgment === 'OK') {
                setTotalOk(prev => Math.max(0, prev - 1));
            } else if (lastItem.judgment === 'NG') {
                setTotalNgFrame(prev => Math.max(0, prev - 1));
            }

            // 3. Restore defect points of this cycle to currentCycleNgPoints
            const startTime = lastItem.timestamp - lastItem.duration * 1000;
            const endTime = lastItem.timestamp;
            const targetProblems = sidesDataRef.current[undoneSide]?.problemsList || [];
            const restoredPoints = targetProblems.filter(item => {
                return item.timestamp >= startTime - 2000 && item.timestamp <= endTime + 2000;
            });

            if (restoredPoints.length > 0) {
                setCurrentCycleNgPoints(restoredPoints);
                if (sidesDataRef.current[undoneSide]) {
                    sidesDataRef.current[undoneSide].currentCycleNgPoints = restoredPoints;
                }
            }

            triggerVisualFeedback('success', `1 Cycle ${undoneSide} dibatalkan`);
            setTimeout(() => {
                speakFeedback('Cycle dibatalkan');
            }, 1000);
        } else {
            triggerVisualFeedback('error', 'Tidak ada cycle untuk dibatalkan');
        }
    };

    const convertSpokenNumber = (text) => {
        const numbersMap = {
            'nol': 0, 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4,
            'lima': 5, 'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9,
            'sepuluh': 10, 'sebelas': 11, 'dua belas': 12, 'tiga belas': 13,
            'empat belas': 14, 'lima belas': 15, 'enam belas': 16,
            'tujuh belas': 17, 'delapan belas': 18, 'sembilan belas': 19,
            'dua puluh': 20
        };
        const trimmed = text.toLowerCase().trim();
        if (numbersMap[trimmed] !== undefined) return numbersMap[trimmed];
        
        const matchedDigits = trimmed.match(/\d+/);
        if (matchedDigits) return parseInt(matchedDigits[0]);
        return null;
    };

    // NLP Parser engine to detect NG based on text transcript
    const parseInspectionText = (rawText, isInterim = false) => {
        const text = rawText.toLowerCase().trim();
        const hadExplicitPointKeyword = text.includes("poin") || text.includes("point") || text.includes("nomor") || text.includes("nomer");

        // 0a. Silent mode guard — if muted, only unmute command is accepted
        if (isMutedRef.current) {
            if (window.matchesVoiceCommand(text, 'unmute')) {
                setMuted(false);
                const cmd = window.findVoiceCommand(text, 'unmute');
                speakFeedback(cmd?.feedback_text || 'Mendengarkan kembali');
                window.VoiceFeedback.playBeep(660, 0.15);
                setTranscript("Mode aktif kembali");
                setStatus('listening');
                triggerVisualFeedback('success', 'Mendengarkan kembali');
                return;
            }
            return; // ignore all other speech while muted
        }

        // 0b. Voice Command: MUTE
        if (window.matchesVoiceCommand(text, 'mute')) {
            setMuted(true);
            const cmd = window.findVoiceCommand(text, 'mute');
            speakFeedback(cmd?.feedback_text || 'Mikrofon dibisukan');
            window.VoiceFeedback.playBeep(250, 0.3, 'triangle');
            setTranscript("Mode diam");
            setStatus('idle');
            triggerVisualFeedback('success', 'Mikrofon dibisukan');
            return;
        }

        // 0c. Voice Command: ABNORMAL / MASALAH
        if (text.includes("abnormal") || text.includes("masalah")) {
            if (!showAbnormalPopupRef.current) {
                setAbnormalCategory(null);
                abnormalCategoryRef.current = null;
                setShowAbnormalPopup(true);
                showAbnormalPopupRef.current = true;
                window.VoiceFeedback.playBeep(523, 0.15);
                speakFeedback("Pilih jenis masalah, Man, Mesin, Material, Metode, atau Environment");
                setTranscript("Pilih 4M1E...");
            }
            return;
        }

        // If abnormality popup is open, intercept category selection
        if (showAbnormalPopupRef.current) {
            const cats = ['man', 'mesin', 'material', 'metode', 'environment'];
            const spoken = text.toLowerCase().trim();
            if (!abnormalCategoryRef.current) {
                // Level 1: detect 4M1E
                const matchedCat = cats.find(c => spoken.includes(c) || spoken.includes(c.substring(0, 3)));
                if (matchedCat) {
                    const proper = matchedCat.charAt(0).toUpperCase() + matchedCat.slice(1);
                    setAbnormalCategory(proper);
                    abnormalCategoryRef.current = proper;
                    const flatCats = window.ABNORMALITY_CATEGORIES_FLAT || [];
                    const problems = flatCats.filter(c => c.category_4m1e === proper && c.active);
                    if (problems.length > 0) {
                        const names = problems.map(p => p.problem_name).join(', ');
                        speakFeedback(`${proper}, sebutkan masalah, seperti ${names.substring(0, 100)}`);
                    } else {
                        speakFeedback(`${proper}, tidak ada masalah terdaftar`);
                    }
                    window.VoiceFeedback.playBeep(660, 0.12);
                    setTranscript(`Kategori: ${proper}`);
                    return;
                }
            } else {
                // Level 2: detect problem name via keywords or name match
                const flatCats = window.ABNORMALITY_CATEGORIES_FLAT || [];
                const problems = flatCats.filter(c => c.category_4m1e === abnormalCategoryRef.current && c.active);
                let matchedProblem = null;
                for (const p of problems) {
                    const kw = (p.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                    if (kw.some(k => spoken.includes(k))) {
                        matchedProblem = p;
                        break;
                    }
                    if (spoken.includes(p.problem_name.toLowerCase())) {
                        matchedProblem = p;
                        break;
                    }
                }
                if (matchedProblem) {
                    recordAbnormality(matchedProblem.problem_name);
                    return;
                }
            }
            return;
        }

        // 0d. Voice Command: STOP LISTENING
        if (text.includes("stop dengarkan") || text.includes("selesai dengarkan") || text.includes("matikan mic") || text.includes("stop mic")) {
            stopAllCapture();
            speakFeedback("Mikrofon dimatikan");
            setTranscript("Command: Stop dengarkan.");
            setStatus('idle');
            triggerVisualFeedback('success', 'Mikrofon dimatikan');
            return;
        }

        // 1. Voice Command: SIDE SWITCH (kanan / kiri)
        const sideSwitchText = text.replace(/^(ke|pindah|ganti|tukar)\s+/i, '').trim();
        if (sideSwitchText === 'kanan') {
            if (activeSideRef.current !== 'KANAN') {
                const success = switchSide('KANAN');
                if (success) {
                    speakFeedback('Beralih ke sisi kanan');
                    setTranscript('Beralih ke sisi kanan');
                    setStatus('success');
                    triggerVisualFeedback('success', 'Beralih ke kanan');
                    setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1500);
                }
            } else {
                speakFeedback('Sudah di kanan');
                setTranscript('Sudah di kanan');
                setStatus('idle');
                triggerVisualFeedback('error', 'Sudah di kanan');
                setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1000);
            }
            return;
        }
        if (sideSwitchText === 'kiri') {
            if (activeSideRef.current !== 'KIRI') {
                const success = switchSide('KIRI');
                if (success) {
                    speakFeedback('Beralih ke sisi kiri');
                    setTranscript('Beralih ke sisi kiri');
                    setStatus('success');
                    triggerVisualFeedback('success', 'Beralih ke kiri');
                    setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1500);
                }
            } else {
                speakFeedback('Sudah di kiri');
                setTranscript('Sudah di kiri');
                setStatus('idle');
                triggerVisualFeedback('error', 'Sudah di kiri');
                setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1000);
            }
            return;
        }

        // 2. Voice Command: UNDO / DELETE LAST
        if (window.matchesVoiceCommand(text, 'undo')) {
            const cmd = window.findVoiceCommand(text, 'undo');
            if (problemsListRef.current.length > 0) {
                setProblemsListState(prev => prev.slice(1));
                window.VoiceFeedback.playBeep(350, 0.2, 'triangle');
                speakFeedback(cmd?.feedback_text || 'Dihapus');
                setTranscript("Command: Hapus draf teratas.");
                setStatus('success');
                setPendingPoint(null);
                triggerVisualFeedback('success', 'Item terakhir dihapus');
                setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1500);
            } else if (totalNgFrameRef.current > 0 && (text.includes("frame") || text.includes("cacat"))) {
                setTotalNgFrame(prev => Math.max(0, prev - 1));
                window.VoiceFeedback.playBeep(350, 0.2, 'triangle');
                speakFeedback(cmd?.feedback_text || 'Dihapus');
                setTranscript("Command: Kurangi cacat frame.");
                setStatus('success');
                triggerVisualFeedback('success', 'Cacat frame dikurangi');
                setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1500);
            }
            return;
        }

        // 2b. Voice Command: BATAL CYCLE
        if (window.matchesVoiceCommand(text, 'batal_cycle')) {
            handleUndoLastCycle();
            return;
        }

        // --- COMMANDS GUARDED BY NO POINT DETECTED ---
        const hasPointIndicator = text.includes("poin") || text.includes("point") || text.includes("nomor") || text.includes("nomer") || text.includes(" no") || text.includes(" p ") || text.match(/\b\d+\b/);

        if (!hasPointIndicator) {
            // Dedup: prevent re-executing same command within 1.5s
            const sinceLastCmd = Date.now() - voiceCooldownRef.current;
            if (sinceLastCmd < 6000) {
                return;
            }
            voiceCooldownRef.current = Date.now();

            // 1.0 Voice Command: FINISH (Auto OK/NG Frame)
            if (window.matchesVoiceCommand(text, 'finish')) {
                voiceCooldownRef.current = 0; // reset to bypass inner check
                handleFinishCycle();
                return;
            }

            // 1.1 Voice Command: INCREMENT TOTAL OK
            if (window.matchesVoiceCommand(text, 'ok')) {
                const hasNgPoints = (currentCycleNgPointsRef.current || []).filter(Boolean).length > 0;
                if (!hasNgPoints) {
                    const okSuccess = handleIncrementOk(false);
                    if (okSuccess) {
                        setTranscript("Command: Tambah Total OK.");
                        setStatus('success');
                        triggerVisualFeedback('success', 'Tambah Total OK');
                        setTimeout(() => {
                            const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                            if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                                setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                                switchSide(otherSide);
                            }
                            setStatus(isListeningRef.current ? 'listening' : 'idle');
                        }, 1000);
                    }
                } else {
                    // Auto route to NG Frame (same as "selesai")
                    setTotalNgFrame(prev => prev + 1);
                    handleNgFrameEfficiency(activeSideRef.current);
                    window.VoiceFeedback.playNgFrameBeep();
                    speakFeedback('Reject');
                    setTranscript("Command: OK (Auto NG Frame).");
                    setStatus('success');
                    triggerVisualFeedback('success', 'Tambah Cacat Frame');
                    setTimeout(() => {
                        const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                        if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                            setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                            switchSide(otherSide);
                        }
                        setStatus(isListeningRef.current ? 'listening' : 'idle');
                    }, 1000);
                }
                return;
            }

            // 1.2 Voice Command: INCREMENT SCRAP
            if (window.matchesVoiceCommand(text, 'scrap')) {
                const cmd = window.findVoiceCommand(text, 'scrap');
                setTotalScrap(prev => prev + 1);
                window.VoiceFeedback.playScrapBeep();
                speakFeedback(cmd?.feedback_text || 'Scrap');
                setTranscript("Command: Tambah Scrap.");
                setStatus('success');
                triggerVisualFeedback('success', 'Tambah Scrap');
                setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 1500);
                return;
            }

            // 2. Voice Command: INCREMENT NG FRAME
            if (window.matchesVoiceCommand(text, 'ng_frame')) {
                const cmd = window.findVoiceCommand(text, 'ng_frame');
                setTotalNgFrame(prev => prev + 1);
                handleNgFrameEfficiency(activeSideRef.current);
                window.VoiceFeedback.playNgFrameBeep();
                speakFeedback(cmd?.feedback_text || 'Cacat');
                setTranscript("Command: Tambah Cacat Frame.");
                setStatus('success');
                triggerVisualFeedback('success', 'Tambah Cacat Frame');
                setTimeout(() => {
                    const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                    if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                        setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                        switchSide(otherSide);
                    }
                    setStatus(isListeningRef.current ? 'listening' : 'idle');
                }, 1000);
                return;
            }
        }

        // Interim result: jangan proses point+defect, tunggu final
        if (isInterim) return;

        // 3. Identify Point Number
        const pointRegex = /(?:poin|point|nomor|nomer|no|\bp\b)\s*([a-z0-9\s]+)/i;
        const pointMatch = text.match(pointRegex);
        let pointNo = null;
        let matchedPointWord = "";
        let commandText = text; // trimmed to only the portion after point keyword

        if (pointMatch) {
            const rawPointVal = pointMatch[1].trim();
            const words = rawPointVal.split(/\s+/);
            pointNo = convertSpokenNumber(words[0]);
            matchedPointWord = words[0];
            if (pointNo === null && words[1]) {
                pointNo = convertSpokenNumber(words[0] + " " + words[1]);
                matchedPointWord = words[0] + " " + words[1];
            }
            if (pointNo === null) {
                pointNo = convertSpokenNumber(rawPointVal);
                matchedPointWord = rawPointVal;
            }
            // Trim text to only the portion from point keyword onwards
            commandText = text.substring(pointMatch.index);
        } else {
            // Fallback: try to extract number directly from the beginning of the text
            const words = text.split(/\s+/);
            let testNo = null;
            // Check first two words first (e.g. "dua puluh", "dua belas")
            if (words[1]) {
                testNo = convertSpokenNumber(words[0] + " " + words[1]);
                if (testNo !== null) {
                    pointNo = testNo;
                    matchedPointWord = words[0] + " " + words[1];
                }
            }
            // Check first word if two-word match failed
            if (pointNo === null) {
                testNo = convertSpokenNumber(words[0]);
                if (testNo !== null) {
                    pointNo = testNo;
                    matchedPointWord = words[0];
                }
            }
            // Fallback to searching for any digit inside the text
            if (pointNo === null) {
                const digitMatch = text.match(/\b\d+\b/);
                if (digitMatch) {
                    pointNo = parseInt(digitMatch[0]);
                    matchedPointWord = digitMatch[0];
                }
            }
        }

        // 4. Identify Defect Type
        let detectedDefectCode = null;
        let detectedDefectName = "";
        let detectedFeedbackText = "";

        // Try to match precise keywords from DEFECT_GUIDANCE using cumulative scoring
        const guidance = window.DEFECT_GUIDANCE || [];
        let bestScore = 0;
        for (const item of guidance) {
            const keywords = [...(item.keywords || [])];

            let score = 0;
            for (const keyword of keywords) {
                // Use word boundary regex to prevent substring collisions
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBoundary = new RegExp('\\b' + escaped + '\\b', 'i');
                if (wordBoundary.test(commandText)) {
                    score += keyword.length;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                detectedDefectCode = item.code;
                detectedDefectName = item.name;
                detectedFeedbackText = item.feedbackText || '';
            }
        }

        // Fallback to substring word match in guidance names
        if (!detectedDefectCode) {
            for (const item of guidance) {
                const nameWords = item.name.toLowerCase();
                const nameCleaned = nameWords.replace(/welding|spot|bolt/g, '').trim();
                const cleanWords = nameCleaned.split(/\s+/).filter(w => w.length > 3);
                
                const matchesWord = cleanWords.some(w => {
                    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return new RegExp('\\b' + escaped + '\\b', 'i').test(commandText);
                });
                if (matchesWord) {
                    detectedDefectCode = item.code;
                    detectedDefectName = item.name;
                    detectedFeedbackText = item.feedbackText || '';
                    break;
                }
            }
        }

        // --- SMART STATE BUFFERING LOGIC WITH REFS ---
        
        // CASE A: User said both point and defect
        if (pointNo !== null && detectedDefectCode) {
            let extraFeedback = null;
            if (window.matchesVoiceCommand(text, 'ng_frame')) {
                const ngCmd = window.findVoiceCommand(text, 'ng_frame');
                setTotalNgFrame(prev => prev + 1);
                handleNgFrameEfficiency();
                window.VoiceFeedback.playNgFrameBeep();
                extraFeedback = { msg: ngCmd?.feedback_text || 'cacat', label: 'Cacat Frame' };
            }
            registerDefect(pointNo, detectedDefectName, detectedDefectCode, detectedFeedbackText, extraFeedback);
            if (extraFeedback) {
                setTimeout(() => {
                    const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                    if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                        setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                        switchSide(otherSide);
                    }
                }, 1000);
            }
        }
        // CASE B: User speaks defect after a pending point in buffer
        else if (pointNo === null && detectedDefectCode && pendingPointRef.current) {
            let extraFeedback = null;
            if (window.matchesVoiceCommand(text, 'ng_frame')) {
                const ngCmd = window.findVoiceCommand(text, 'ng_frame');
                setTotalNgFrame(prev => prev + 1);
                handleNgFrameEfficiency();
                window.VoiceFeedback.playNgFrameBeep();
                extraFeedback = { msg: ngCmd?.feedback_text || 'cacat', label: 'Cacat Frame' };
            }
            registerDefect(parseInt(pendingPointRef.current), detectedDefectName, detectedDefectCode, detectedFeedbackText, extraFeedback);
            if (extraFeedback) {
                setTimeout(() => {
                    const otherSide = activeSideRef.current === 'KIRI' ? 'KANAN' : 'KIRI';
                    if (sidesDataRef.current[otherSide]?.metadata?.partNumber) {
                        setTimeout(() => speakFeedback(`Beralih ke ${otherSide}`), 200);
                        switchSide(otherSide);
                    }
                }, 1000);
            }
        }
        // CASE C: User speaks both point and a CUSTOM defect that is NOT in DEFECT_GUIDANCE
        else if (pointNo !== null && !detectedDefectCode) {
            const cleanText = commandText.replace(new RegExp(`(poin|point|nomor|no|p)\\s*${matchedPointWord}`, 'i'), '').trim();
            
            if (cleanText.length > 2) {
                if (hadExplicitPointKeyword) {
                    window.VoiceFeedback.playBeep(250, 0.3, 'triangle');
                    speakFeedback("Tolong ulangi");
                    setTranscript(`Problem "${cleanText}" tidak dikenal`);
                    setStatus('error');
                    triggerVisualFeedback('error', `${cleanText} belum didaftarkan. Tolong Ulangi`);
                    setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 2000);
                } else {
                    console.log(`Unrecognized defect: ${cleanText} — no "point" keyword, silently ignored`);
                }
            } else {
                setPendingPoint(pointNo.toString());
                setLastDetectedPoint(pointNo.toString());
                window.VoiceFeedback.playBeep(523, 0.15);
                setStatus('listening');
                setTranscript(`Poin ${pointNo} terdeteksi. Menunggu defect...`);

                if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
                blinkTimeoutRef.current = setTimeout(() => {
                    setLastDetectedPoint(null);
                }, 5000);
            }
        }
        // CASE D: No valid pairing — pending point with unrecognized defect, or gibberish
        else {
            if (pendingPointRef.current) {
                if (hadExplicitPointKeyword) {
                    window.VoiceFeedback.playBeep(250, 0.3, 'triangle');
                    speakFeedback("Tolong ulangi");
                    setTranscript("Problem tidak dikenal");
                    setStatus('error');
                    triggerVisualFeedback('error', 'Perintah tidak dikenal. Tolong Ulangi');
                    setTimeout(() => setStatus(isListeningRef.current ? 'listening' : 'idle'), 2000);
                } else {
                    console.log(`Pending point with unrecognized text — no "point" keyword, silently ignored: ${text}`);
                }
            } else {
                console.log("No valid pairing match found for: ", text);
            }
        }
    };

    const registerDefect = (pointNo, defectName, defectCode, feedbackText, extraFeedback = null) => {
        const newNG = {
            checkNo: pointNo.toString(),
            pointCheck: `Point #${pointNo}`,
            problem: defectName,
            defectCode: defectCode,
            qty: 1,
            location: null,
            pageIndex: 0,
            confidence: 100,
            lowConfidenceReason: "",
            timestamp: Date.now()
        };

        const pointData = partPointsRef.current.find(p => p.check_no == pointNo);
        if (pointData) {
            newNG.location = { x: pointData.x_coord, y: pointData.y_coord };
        }

        setProblemsListState(prev => [newNG, ...prev]);
        setLastDetectedPoint(pointNo.toString());
        setPendingPoint(null);

        window.VoiceFeedback.playPointNgBeep();

        const feedback = feedbackText || defectName.split('(')[0].replace(/Welding/g, '').trim();

        if (extraFeedback) {
            speakFeedback(`titik ${pointNo}, ${feedback}, ${extraFeedback.msg}`);
            setTranscript(`Terdaftar: Poin ${pointNo} - ${defectName} + ${extraFeedback.label}`);
            setStatus('success');
            triggerVisualFeedbackDual('success',
                `Poin ${pointNo} — ${defectName}`,
                extraFeedback.label
            );
        } else {
            speakFeedback(`titik ${pointNo}, ${feedback}`);
            setTranscript(`Terdaftar: Poin ${pointNo} - ${defectName}`);
            setStatus('success');
            triggerVisualFeedback('success', `Poin ${pointNo} — ${defectName}`);
        }

        if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
        blinkTimeoutRef.current = setTimeout(() => {
            setLastDetectedPoint(null);
            setStatus(isListeningRef.current ? 'listening' : 'idle');
        }, 3000);
    };

    const handleDeleteCycleNgPoint = (itemToDelete) => {
        setProblemsListState(prev => prev.filter(item => item.timestamp !== itemToDelete.timestamp));
        if (lastDetectedPoint === itemToDelete.checkNo) {
            setLastDetectedPoint(null);
        }
        window.VoiceFeedback.playBeep(220, 0.2, 'sine');
    };

    const handleSaveDraft = () => {
        // Ensure current side is saved to ref — use refs to avoid stale closure
        if (sidesDataRef.current) {
            sidesDataRef.current[activeSideRef.current] = {
                metadata: JSON.parse(JSON.stringify(metadataRef.current)),
                problemsList: [...problemsListRef.current],
                totalNgFrame: totalNgFrameRef.current,
                totalOk: totalOkRef.current,
                totalScrap: totalScrapRef.current,
                selectedPart: selectedPartRef.current ? { ...selectedPartRef.current } : null,
                partPoints: [...partPointsRef.current],
                pendingPoint: pendingPointRef.current,
            };
        }
        const draftData = {
            sidesData: sidesDataRef.current,
            activeSide: activeSideRef.current
        };
        localStorage.setItem('qc_voice_draft', JSON.stringify(draftData));
        window.VoiceFeedback.playBeep(523, 0.1);
        setTimeout(() => window.VoiceFeedback.playBeep(659, 0.08), 100);
        setTimeout(() => window.VoiceFeedback.playBeep(784, 0.12), 200);
        speakFeedback("Draf disimpan");
        alert("Draf inspeksi suara berhasil disimpan di laptop!");
        setHasDraft(true);
    };

    const handleLoadDraft = () => {
        const savedDraft = localStorage.getItem('qc_voice_draft');
        if (savedDraft) {
            const data = JSON.parse(savedDraft);
            if (data.sidesData) {
                sidesDataRef.current = data.sidesData;
            }
            const sideKey = data.activeSide || 'KIRI';
            setActiveSide(sideKey);
            const sideData = data.sidesData?.[sideKey];
            if (sideData) {
                isRestoringRef.current = true;
                if (sideData.metadata) setMetadata(sideData.metadata);
                if (sideData.problemsList) setProblemsListState(sideData.problemsList);
                if (sideData.totalNgFrame !== undefined) setTotalNgFrame(sideData.totalNgFrame);
                if (sideData.totalOk !== undefined) setTotalOk(sideData.totalOk);
                if (sideData.totalScrap !== undefined) setTotalScrap(sideData.totalScrap);
                if (sideData.selectedPart) setSelectedPart(sideData.selectedPart);
                if (sideData.partPoints) setPartPoints(sideData.partPoints);
                if (sideData.pendingPoint !== undefined) setPendingPoint(sideData.pendingPoint);
                setTimeout(() => { isRestoringRef.current = false; }, 500);
            } else {
                // Legacy draft - single side
                setMetadata(data.metadata);
                setProblemsListState(data.problemsList);
                setTotalNgFrame(data.totalNgFrame);
                setTotalOk(data.totalOk || 0);
                setTotalScrap(data.totalScrap || 0);
                setSelectedPart(data.selectedPart);
            }
            setHasDraft(false);
            localStorage.removeItem('qc_voice_draft');
            window.VoiceFeedback.playBeep(660, 0.1);
            speakFeedback("Draf dimuat");
        }
    };

    const handleRestartMic = () => {
        setShowReloadOverlay(false);
        stopAllCapture();
        if (window.VoiceRecognition.restart) {
            window.VoiceRecognition.restart();
        } else {
            window.VoiceRecognition.stop();
            setTimeout(() => {
                window.VoiceRecognition.start({
                    onTranscript: (text, isFinal) => {
                        triggerSpeechBounce();
                        setTranscript(text);
                        parseInspectionText(text, !isFinal);
                    },
                    onStatusChange: (status) => {
                        if (status === 'listening') {
                            setIsListening(true);
                            isListeningRef.current = true;
                            setStatus('listening');
                        } else if (status === 'error') {
                            setStatus('error');
                        } else if (status === 'idle') {
                            setIsListening(false);
                            isListeningRef.current = false;
                            setStatus('idle');
                        }
                    }
                });
            }, 500);
        }
    };

    const handleZombieAutoRestart = (attemptsLeft) => {
        const maxAttempts = 2;
        const attempt = maxAttempts - (attemptsLeft || maxAttempts) + 1;
        speakFeedback(`Microphone bermasalah, restart otomatis percobaan ke ${attempt}`);
        if (window.VoiceRecognition.restart) {
            window.VoiceRecognition.restart();
        }
        const checkInterval = setInterval(() => {
            if (window.VoiceRecognition.isListening) {
                clearInterval(checkInterval);
                speakFeedback('Microphone kembali normal');
                setShowReloadOverlay(false);
                setIsListening(true);
                isListeningRef.current = true;
                setStatus('listening');
                window.VoiceFeedback.playBeep(660, 0.15);
                return;
            }
        }, 500);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.VoiceRecognition.isListening) {
                if (attemptsLeft && attemptsLeft > 1) {
                    handleZombieAutoRestart(attemptsLeft - 1);
                } else {
                    speakFeedback('Restart gagal, silakan klik tombol restart');
                    setShowReloadOverlay(true);
                    setIsListening(false);
                    isListeningRef.current = false;
                    setStatus('error');
                }
            }
        }, 5000);
    };

    const handleClearDraft = () => {
        if (confirm("Hapus draf yang tersimpan sebelumnya?")) {
            localStorage.removeItem('qc_voice_draft');
            setHasDraft(false);
            window.VoiceFeedback.playBeep(250, 0.3, 'triangle');
            speakFeedback("Draf dihapus");
        }
    };

    const handleEndSession = () => {
        if (confirm("Selesaikan sesi ini dan pilih part baru?")) {
            // Delete temporary check times from DB on end session (discarding progress)
            if (sessionIdRef.current) {
                fetch(`${api_url}/api/efficiency/session/${sessionIdRef.current}`, { method: 'DELETE' })
                    .catch(e => console.error("Failed to delete temp session check times:", e));
            }
            // Delete live monitoring status on end session
            if (metadata.inspector) {
                fetch(`${api_url}/api/dashboard/live-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inspector: metadata.inspector })
                }).catch(e => console.error("Failed to delete live monitoring:", e));
            }
            localStorage.removeItem('qc_voice_active_session');
            setShowSetup(true);
            window.VoiceFeedback.playBeep(250, 0.3, 'triangle');
            speakFeedback("Sesi diakhiri");
        }
    };

    const toggleListening = async () => {
        // Stop normal SpeechRecognition if active
        if (window.VoiceRecognition.isListening) {
            window.VoiceRecognition.stop();
            return;
        }

        // --- Start ---
        // Refresh mic devices (permission now granted via previous clicks)
        refreshMicDevices();

        // Warmup audio & prime TTS for tablet compatibility
        window.VoiceFeedback.warmupAudio();
        window.VoiceFeedback.primeTTS();
        if (voiceValidationRef.current) window.VoiceFeedback.startTTSKeepAlive();
        
        if (window.loadVoiceGuidesFromServer) {
            await window.loadVoiceGuidesFromServer(api_url);
        }
        if (window.loadVoiceCommandsFromServer) {
            await window.loadVoiceCommandsFromServer(api_url);
        }

        // Normal SpeechRecognition pipeline
        if (window.VoiceRecognition.onZombie) {
            window.VoiceRecognition.clearZombieCallbacks();
            window.VoiceRecognition.onZombie(() => {
                setIsListening(false);
                isListeningRef.current = false;
                setStatus('error');
                handleZombieAutoRestart(2);
            });
        }
        window.VoiceRecognition.start({
            onTranscript: (text, isFinal) => {
                triggerSpeechBounce();
                setTranscript(text);
                parseInspectionText(text, !isFinal);
            },
            onStatusChange: (status) => {
                if (status === 'listening') {
                    setIsListening(true);
                    isListeningRef.current = true;
                    setStatus('listening');
                } else if (status === 'error') {
                    setStatus('error');
                } else if (status === 'idle') {
                    setIsListening(false);
                    isListeningRef.current = false;
                    setStatus('idle');
                }
            },
            onDiagnostic: (msg) => {
                setDiagnosticMessage(msg);
                setShowDiagnostic(true);
            }
        });
    };

    const handleStartTimerAndMic = async () => {
        if (!efficiencyTimerRunningRef.current) {
            await startEfficiencyTimer();
            if (!isListeningRef.current) {
                await toggleListening();
            }
        }
    };

    const handlePauseTimerAndMic = () => {
        pauseEfficiencyTimer();
        stopAllCapture();
        setIsListening(false);
        isListeningRef.current = false;
        setStatus('idle');
    };

    const handleResumeTimerAndMic = async () => {
        resumeEfficiencyTimer();
        if (!isListeningRef.current) {
            await toggleListening();
        }
    };

    const handleBreakOneCycle = async () => {
        setShowBreakPopup(false);
        setCurrentBreakInfo(null);
        isBreakWaitingCycleRef.current = true;
        resumeEfficiencyTimer();
        breakAutoPausedRef.current = false;
        if (!isListeningRef.current) {
            await toggleListening();
        }
    };

    const handleSubmit = async () => {
        if (!metadata.inspector || !metadata.linePos) {
            alert("Harap lengkapi formulir metadata (Inspector, Line) terlebih dahulu!");
            return;
        }
        // Check at least one side has part number
        const kiriStored = sidesDataRef.current['KIRI'];
        const kananStored = sidesDataRef.current['KANAN'];
        const hasKiriPart = kiriStored?.metadata?.partNumber || (activeSide === 'KIRI' && metadata.partNumber);
        const hasKananPart = kananStored?.metadata?.partNumber || (activeSide === 'KANAN' && metadata.partNumber);
        if (!hasKiriPart && !hasKananPart) {
            alert("Harap pilih part number untuk minimal satu sisi (KIRI atau KANAN)!");
            return;
        }

        setIsSaving(true);
        stopAllCapture();

        // Ensure current side is saved to ref
        if (sidesDataRef.current) {
            sidesDataRef.current[activeSide] = {
                metadata: JSON.parse(JSON.stringify(metadata)),
                problemsList: [...problemsListRef.current],
                totalNgFrame: totalNgFrameRef.current,
                totalOk: totalOkRef.current,
                totalScrap: totalScrapRef.current,
                selectedPart: selectedPart ? { ...selectedPart } : null,
                partPoints: [...partPoints],
            };
        }

        // Build inputs array for both sides that have data
        const inputs = [];
        const sessionGroup = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const sharedNama = metadata.inspector;
        const sharedShift = metadata.shift;
        const sharedLinePos = metadata.linePos;
        const sharedDate = metadata.date;

        for (const side of ['KIRI', 'KANAN']) {
            const sd = sidesDataRef.current[side];
            if (!sd || !sd.metadata?.partNumber) continue; // skip side without part number

            const totalNgPoint = [...new Set(sd.problemsList.map(item => item.checkNo))].length;
            const totalProd = sd.totalOk + sd.totalNgFrame;

            const effItems = efficiencyItemsRef.current.filter(item => !item.side || item.side === side);
            const totalChecks = effItems.length;
            const totalCheckTime = effItems.reduce((sum, item) => sum + item.duration, 0);
            const avgTakt = totalChecks > 0 ? effItems.reduce((sum, i) => sum + i.taktTime, 0) / totalChecks : 60;
            const sessionStart = sessionStartRef.current;
            const lastItem = effItems[effItems.length - 1];
            // Match backend logic: round avg_takt, floor expected, then round efficiency
            const avgTaktRounded = Math.round(avgTakt);
            const spanSec = sessionStart && lastItem ? (lastItem.timestamp - sessionStart) / 1000 : 0;
            const expected = spanSec > 0 && avgTaktRounded > 0 ? Math.floor(spanSec / avgTaktRounded) : 0;
            const sessionEff = expected > 0 ? Math.min(100, Math.round(totalChecks / expected * 100)) : null;
            const fmtDb = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

            const effData = totalChecks > 0 ? {
                total_check_time: Math.round(totalCheckTime),
                total_checks: totalChecks,
                efficiency: sessionEff ?? Math.round(effItems.reduce((sum, item) => sum + item.efficiency, 0) / totalChecks),
                timestart: fmtDb(new Date(effItems[0].timestamp - effItems[0].duration * 1000)),
                timeend: fmtDb(new Date(lastItem.timestamp)),
                takt_time_sec: avgTaktRounded,
                session_id: sessionIdRef.current
            } : null;

            inputs.push({
                side: side,
                meta: {
                    partName: sd.selectedPart ? sd.selectedPart.part_name : '',
                    partNumber: sd.metadata.partNumber,
                    model: sd.metadata.model || '',
                    nama: sharedNama,
                    shift: sharedShift,
                    linePos: sharedLinePos,
                    date: sharedDate
                },
                summary: {
                    totalProduksi: totalProd,
                    totalOK: sd.totalOk,
                    totalNG: sd.totalNgFrame,
                    totalNGPoint: totalNgPoint,
                    totalScrap: sd.totalScrap,
                    confidenceScore: 100,
                    efficiency: effData
                },
                efficiency: effData,
                details: sd.problemsList.length > 0 ? sd.problemsList : [
                    {
                        checkNo: '-',
                        pointCheck: 'All OK',
                        problem: 'Tidak ada data NG (All OK)',
                        defectCode: '-',
                        qty: 0,
                        location: null,
                        pageIndex: 0,
                        confidence: 100,
                        lowConfidenceReason: ""
                    }
                ],
                image_path: sd.selectedPart ? sd.selectedPart.image_path : null,
                notes: `Voice Inspection session. Side: ${side}. Total NG Frame: ${sd.totalNgFrame}, NG Points: ${sd.problemsList.length}`,
                input_mode: 'voice'
            });
        }

        if (inputs.length === 0) {
            alert("Tidak ada data untuk disimpan. Pastikan minimal satu sisi memiliki part number.");
            setIsSaving(false);
            return;
        }

        // If only one side, use existing /api/save endpoint for backward compat
        try {
            let result;
            if (inputs.length === 1) {
                const singlePayload = {
                    meta: inputs[0].meta,
                    summary: inputs[0].summary,
                    details: inputs[0].details,
                    image_path: inputs[0].image_path,
                    notes: inputs[0].notes,
                    input_mode: inputs[0].input_mode,
                    efficiency: inputs[0].summary.efficiency
                };
                const res = await fetch(`${api_url}/api/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(singlePayload)
                });
                result = await res.json();
            } else {
                const res = await fetch(`${api_url}/api/save-multi`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionGroup, inputs })
                });
                result = await res.json();
            }

            if (result.status === 'success') {
                // Delete live monitoring status on successful save
                fetch(`${api_url}/api/dashboard/live-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inspector: metadata.inspector })
                }).catch(e => console.error("Failed to delete live monitoring:", e));

                setProblemsListState([]);
                setTotalNgFrame(0);
                setTotalOk(0);
                setTotalScrap(0);
                setPendingPoint(null);
                setTranscript('');
                stopEfficiencyTimer();
                setEfficiencyItems([]);
                localStorage.removeItem('qc_voice_draft');
                localStorage.removeItem('qc_voice_active_session');
                localStorage.removeItem('qc_voice_last_interrupted_session');
                sidesDataRef.current = { kiri: null, kanan: null };
                
                // Reset metadata and part selection for new session
                setMetadata(prev => ({
                    ...prev,
                    inspector: '',
                    shift: '1',
                    linePos: '',
                    partNumber: '',
                    model: '',
                    date: new Date(Date.now() + new Date().getTimezoneOffset() * -60000).toISOString().split('T')[0]
                }));
                setSelectedPart(null);
                setPartPoints([]);
                setActiveSide('KIRI');
                activeSideRef.current = 'KIRI';
                setShowSetup(true); // Show Voice Setup for new session
                
                if (onSaveSuccess) onSaveSuccess();
            } else {
                alert("Gagal menyimpan data: " + result.message);
            }
        } catch (error) {
            alert("Kesalahan koneksi server: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        if (confirm("Apakah Anda yakin ingin membuang kemajuan inspeksi dan memulai ulang sesi ini?")) {
            // Stop speech recognition if listening
            if (window.VoiceRecognition && window.VoiceRecognition.isListening) {
                try {
                    window.VoiceRecognition.stop();
                } catch (e) { console.error("Failed to stop VoiceRecognition:", e); }
            }
            setIsListening(false);
            isListeningRef.current = false;

            // Delete live monitoring status on discard
            if (metadata.inspector) {
                fetch(`${api_url}/api/dashboard/live-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inspector: metadata.inspector })
                }).catch(e => console.error("Failed to delete live monitoring:", e));
            }

            // Delete temporary check times from DB on discard
            if (sessionIdRef.current) {
                fetch(`${api_url}/api/efficiency/session/${sessionIdRef.current}`, { method: 'DELETE' })
                    .catch(e => console.error("Failed to delete temp session check times:", e));
            }

            setProblemsListState([]);
            setTotalNgFrame(0);
            setTotalOk(0);
            setTotalScrap(0);
            setPendingPoint(null);
            setTranscript('');
            stopEfficiencyTimer();
            setEfficiencyItems([]);
            sidesDataRef.current = { kiri: null, kanan: null };
            setActiveSide('KIRI');
            localStorage.removeItem('qc_voice_draft');
            localStorage.removeItem('qc_voice_active_session');
            localStorage.removeItem('qc_voice_last_interrupted_session');
            setShowSetup(true);
            window.VoiceFeedback.playBeep(250, 0.4, 'sawtooth');
            speakFeedback("Dibersihkan");
        }
    };

    const totalProd = totalOk + totalNgFrame;

    // Calculate efficiency statistics for rendering
    const avgEff = efficiencyItems.length > 0
        ? Math.round(efficiencyItems.reduce((s, i) => s + i.efficiency, 0) / efficiencyItems.length)
        : 0;
    // Stroke dashoffset for circular progress ring (r=18, circumference = 2 * pi * r = 113)
    const strokeDashoffset = 113 - (113 * Math.min(100, avgEff)) / 100;
    const isOvertime = efficiencyElapsed > currentTaktTime;
    const progressWidth = Math.min(100, (efficiencyElapsed / currentTaktTime) * 100);

    if (showSetup) {
        if (!window.VoiceSetup) {
            return <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-slate-300 mb-4"></i>
                    <p className="text-sm font-bold text-slate-400">Memuat setup...</p>
                </div>
            </div>;
        }
        return React.createElement(window.VoiceSetup, { api_url, onComplete: handleSetupComplete });
    }

    return (
        <div className="space-y-6 flex flex-col min-h-screen">
            
            {/* Inject local style block for glowing row insertion animation */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes row-glow {
                    0% { background-color: rgba(249, 115, 22, 0.25); }
                    100% { background-color: transparent; }
                }
                .animate-row-glow {
                    animation: row-glow 2.5s ease-out;
                }
                .speech-active .voice-viz-bar {
                    animation: voice-wave-bounce 1s ease-out !important;
                }
                @keyframes voice-wave-bounce {
                    0% { height: 4px; }
                    30% { height: 42px; }
                    70% { height: 20px; }
                    100% { height: 4px; }
                }
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.65; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}} />

            {/* DRAFT NOTIFICATION BANNER */}
            {hasDraft && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex justify-between items-center shadow-sm shrink-0 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center"><i className="fas fa-file-waveform"></i></div>
                        <div>
                            <h4 className="text-xs font-black text-slate-800 tracking-tight">Draf Sesi Sebelumnya Ditemukan</h4>
                            <p className="text-[10px] font-bold text-slate-500">Anda memiliki progres inspeksi suara yang belum disimpan ke database.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleLoadDraft} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm">Lanjutkan Sesi</button>
                        <button onClick={handleClearDraft} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase">Abaikan</button>
                    </div>
                </div>
            )}

            {/* IDENTITY INPUT FORM CARD (Collapsible & Tablet Friendly) */}
            {isMetadataCollapsed ? (
                <div className={`bg-white rounded-3xl p-3 shadow-sm border-2 transition-all duration-300 shrink-0 animate-in fade-in duration-200 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
                    activeSide === 'KIRI' ? 'border-blue-500 shadow-blue-500/5' : 'border-purple-500 shadow-purple-500/5'
                }`}>
                    <span className="inline-flex bg-slate-100 rounded-xl p-0.5 border border-slate-200 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); switchSide('KIRI'); }} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${activeSide === 'KIRI' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>KIRI</button>
                        <button onClick={(e) => { e.stopPropagation(); switchSide('KANAN'); }} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${activeSide === 'KANAN' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>KANAN</button>
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600">
                        <span>Inspector: <strong className="text-slate-900">{metadata.inspector || '-'}</strong></span>
                        <span className="text-slate-300">|</span>
                        <span>Shift: <strong className="text-slate-900">{metadata.shift}</strong></span>
                        <span className="text-slate-300">|</span>
                        <span>Line: <strong className="text-slate-900">{metadata.linePos || '-'}</strong></span>
                        <span className="text-slate-300">|</span>
                        <span>Date: <strong className="text-slate-900">{metadata.date || '-'}</strong></span>
                        <span className="text-slate-300">|</span>
                        <span>Part: <strong className="text-slate-900">{metadata.partNumber ? `${metadata.partNumber} - ${metadata.model} - ${selectedPart?.part_name || ''}` : '-'}</strong></span>
                    </div>
                    <div className="flex gap-2 ml-auto">
                        <button 
                            onClick={() => { if (window.loadVoiceCommandsFromServer) window.loadVoiceCommandsFromServer(api_url); setShowVoiceGuidance(true); }}
                            className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 hover:bg-blue-100 transition-all active:scale-95 shadow-sm"
                        >
                            <i className="fas fa-book-open text-[9px]"></i> Panduan
                        </button>
                        <button 
                            onClick={() => setIsMetadataCollapsed(false)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all active:scale-95 border border-slate-200"
                        >
                            <i className="fas fa-lock-open text-[9px]"></i> Ubah
                        </button>
                        <button onClick={handleEndSession}
                            className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 hover:bg-red-100 transition-all active:scale-95 shadow-sm">
                            <i className="fas fa-sign-out-alt text-[9px]"></i> Ganti Part
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 grid grid-cols-2 md:grid-cols-12 gap-3 shrink-0 animate-in fade-in duration-200">
                    <div className="md:col-span-12 flex items-center gap-2 pb-2 border-b border-slate-100 mb-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mr-1">Sisi Inspeksi:</span>
                        <span className="inline-flex bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                            <button onClick={(e) => { e.stopPropagation(); switchSide('KIRI'); }} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${activeSide === 'KIRI' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>KIRI</button>
                            <button onClick={(e) => { e.stopPropagation(); switchSide('KANAN'); }} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${activeSide === 'KANAN' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>KANAN</button>
                        </span>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Inspector</label>
                        <input type="text" list="inspector-list" placeholder="Nama QC..."
                            value={metadata.inspector}
                            onChange={(e) => setMetadata({...metadata, inspector: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                        <datalist id="inspector-list">
                            {(window.INSPECTOR_NAMES || []).map(n => <option key={n} value={n} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Shift</label>
                        <input type="text" list="shift-list" placeholder="Shift (1/2/3)"
                            value={metadata.shift}
                            onChange={(e) => setMetadata({...metadata, shift: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                        <datalist id="shift-list">
                            <option value="1" />
                            <option value="2" />
                            <option value="3" />
                        </datalist>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Line Pos</label>
                        <input type="text" list="linepos-list" placeholder="Line (cth: 1)..."
                            value={metadata.linePos}
                            onChange={(e) => setMetadata({...metadata, linePos: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                        <datalist id="linepos-list">
                            {(window.LINE_POSITIONS || []).map(n => <option key={n} value={n} />)}
                        </datalist>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tanggal</label>
                        <input 
                            type="date" 
                            value={metadata.date} 
                            onChange={(e) => setMetadata({...metadata, date: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        />
                    </div>
                    {/* Part Pengecekan - shows active side part */}
                    <div className="relative md:col-span-3">
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                            Part Pengecekan
                        </label>
                        {metadata.partNumber ? (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                                    <i className="fas fa-check-circle text-blue-500 text-[10px]"></i>
                                    <div className="text-xs font-bold text-slate-700 truncate">
                                        {metadata.partNumber}
                                        <span className="text-[9px] text-slate-400 font-normal ml-1">- {metadata.model} - {selectedPart?.part_name || ''}</span>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedPart(null); setMetadata({...metadata, partNumber: '', model: ''}); }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
                            </div>
                        ) : (
                            <button onClick={() => setShowPartPickerModal(true)} className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-[0.99]">
                                <i className="fas fa-search text-[10px]"></i>
                                Pilih Part
                            </button>
                        )}
                    </div>
                    <div className="flex items-end gap-1 md:col-span-2">
                        <button 
                            onClick={() => { if (window.loadVoiceCommandsFromServer) window.loadVoiceCommandsFromServer(api_url); setShowVoiceGuidance(true); }}
                            className="flex-1 px-2 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl text-[8px] font-black uppercase flex items-center justify-center gap-1 hover:bg-blue-100 transition-all active:scale-95 shadow-sm shadow-blue-500/5 h-[34px]"
                        >
                            <i className="fas fa-book-open text-[9px]"></i>
                            Panduan
                        </button>
                        <button 
                            onClick={() => setIsMetadataCollapsed(true)}
                            disabled={!metadata.partNumber}
                            className="flex-1 px-2 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase flex items-center justify-center gap-1 hover:bg-slate-800 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 h-[34px] shadow-sm"
                            title="Kunci metadata dan mulai inspeksi"
                        >
                            <i className="fas fa-lock text-[9px]"></i>
                            Kunci
                        </button>
                        <button onClick={handleEndSession}
                            className="flex-1 px-2 py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl text-[8px] font-black uppercase flex items-center justify-center gap-1 hover:bg-red-100 transition-all active:scale-95 h-[34px] shadow-sm">
                            <i className="fas fa-sign-out-alt text-[9px]"></i>
                            Ganti Part
                        </button>
                    </div>
                </div>
            )}

            {/* LIVE COUNTERS PANEL */}
            <div className={`bg-white rounded-[2rem] p-5 shadow-sm grid grid-cols-6 gap-4 shrink-0 border-2 transition-all duration-300 ${
                activeSide === 'KIRI' 
                ? 'border-blue-500 shadow-blue-500/5' 
                : 'border-purple-500 shadow-purple-500/5'
            }`}>
                
                {/* TOTAL PRODUKSI */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-center flex flex-col justify-center shadow-sm select-none">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 leading-none">Total Produksi</div>
                    <div className="font-black text-slate-800 text-5xl tracking-tight">{totalProd}</div>
                </div>

                {/* TOTAL OK */}
                <div onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementOk(); }} className="bg-emerald-50 border border-emerald-100/80 rounded-2xl p-3 text-center flex flex-col justify-between shadow-sm select-none cursor-pointer active:scale-[0.98] transition-transform">
                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1 leading-none">Total OK</div>
                    <div className="flex items-center justify-between gap-3 mt-1 bg-white/80 rounded-xl px-2 py-1 border border-emerald-100/50 shadow-sm">
                        <button onClick={(e) => { e.stopPropagation(); handleUndoLastCycle(); }} className="w-10 h-10 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Kurangi">-</button>
                        <span className="font-black text-4xl text-emerald-700 tabular-nums">{totalOk}</span>
                        <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementOk(); }} className="w-10 h-10 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Tambah">+</button>
                    </div>
                </div>

                {/* SCRAP */}
                <div onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalScrap(prev => prev + 1); window.VoiceFeedback.playScrapBeep(); speakFeedback('Scrap'); }} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center flex flex-col justify-between shadow-sm select-none cursor-pointer active:scale-[0.98] transition-transform">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 leading-none">Scrap</div>
                    <div className="flex items-center justify-between gap-3 mt-1 bg-white/80 rounded-xl px-2 py-1 border border-slate-200/50 shadow-sm">
                        <button onClick={(e) => { e.stopPropagation(); setTotalScrap(prev => Math.max(0, prev - 1)); }} className="w-10 h-10 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Kurangi">-</button>
                        <span className="font-black text-4xl text-slate-700 tabular-nums">{totalScrap}</span>
                        <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalScrap(prev => prev + 1); window.VoiceFeedback.playScrapBeep(); speakFeedback('Scrap'); }} className="w-10 h-10 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Tambah">+</button>
                    </div>
                </div>

                {/* NG FRAME */}
                <div onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalNgFrame(prev => prev + 1); forceRecordEfficiency('NG', activeSide); window.VoiceFeedback.playNgFrameBeep(); speakFeedback('NG'); toggleSideIfOtherHasPart(); }} className="bg-red-50 border border-red-100/80 rounded-2xl p-3 text-center flex flex-col justify-between shadow-sm select-none cursor-pointer active:scale-[0.98] transition-transform">
                    <div className="text-[10px] font-black text-red-600 uppercase tracking-wider mb-1 leading-none">NG Frame</div>
                    <div className="flex items-center justify-between gap-3 mt-1 bg-white/80 rounded-xl px-2 py-1 border border-red-100/50 shadow-sm">
                        <button onClick={(e) => { e.stopPropagation(); handleUndoLastCycle(); }} className="w-10 h-10 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Kurangi">-</button>
                        <span className="font-black text-4xl text-red-700 tabular-nums">{totalNgFrame}</span>
                        <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalNgFrame(prev => prev + 1); forceRecordEfficiency('NG', activeSide); window.VoiceFeedback.playNgFrameBeep(); speakFeedback('NG'); toggleSideIfOtherHasPart(); }} className="w-10 h-10 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center font-black text-lg transition-all active:scale-90" title="Tambah">+</button>
                    </div>
                </div>

                {/* NG POINT */}
                <div className="bg-blue-50 border border-blue-100/80 rounded-2xl p-3 text-center flex flex-col justify-center shadow-sm select-none">
                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1 leading-none">NG Point</div>
                    <div className="font-black text-blue-600 text-5xl tracking-tight">{problemsList.length}</div>
                </div>

                {/* ABNORMALITY BUTTON */}
                <div
                    onClick={() => { setShowAbnormalPopup(true); setAbnormalCategory(null); window.VoiceFeedback.playBeep(523, 0.15); speakFeedback('Pilih jenis masalah'); }}
                    className="bg-red-50 border border-red-200/80 rounded-2xl p-3 text-center flex flex-col justify-center shadow-sm select-none cursor-pointer active:scale-[0.98] transition-transform hover:bg-red-100 hover:ring-2 hover:ring-red-400 group"
                >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 group-hover:bg-red-600 group-hover:text-white flex items-center justify-center text-sm transition-all shadow-inner">
                            <i className="fas fa-triangle-exclamation"></i>
                        </div>
                    </div>
                    <div className="text-[9px] font-black text-red-600 uppercase tracking-wider leading-none">Abnormality</div>
                    <div className="text-[7px] font-bold text-red-400 mt-1 leading-none">Klik / suara</div>
                </div>

            </div>

            {/* BOTTOM ROW: Split 60/40 (Visual Radar Map lg:col-span-7 vs Right Stack lg:col-span-5) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
                
                {/* LEFT SIDE: Visual Coordinate Map (Span 7) - ONLY card on the left! */}
                <div className="lg:col-span-7 flex flex-col h-full">
                    
                    {/* Visual Coordinates Map Radar */}
                    <div className="bg-slate-900 rounded-[2rem] border border-slate-800 shadow-md overflow-hidden flex flex-col flex-1 h-[556px] relative">
                        <div className="flex justify-between items-center bg-slate-800/80 px-4 py-2.5 text-white border-b border-slate-800 shrink-0">
                            <button onClick={() => setShowFullManualMode(true)} className="text-[7px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1.5">
                                <i className="fas fa-hand-pointer text-[8px]"></i> Full Manual
                            </button>
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 ml-auto">Visual Radar Peta Part</span>
                            <div className="flex items-center gap-1.5 z-10">
                                <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} className="bg-slate-700 hover:bg-slate-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold" title="Zoom Out"><i className="fas fa-minus text-[8px]"></i></button>
                                <span className="text-[8px] font-black text-slate-300 w-10 text-center">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(prev => Math.min(3.0, prev + 0.1))} className="bg-slate-700 hover:bg-slate-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold" title="Zoom In"><i className="fas fa-plus text-[8px]"></i></button>
                                <button onClick={() => setZoom(1.0)} className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-0.5 rounded-lg text-[8px] font-black uppercase" title="Reset Zoom">Reset</button>
                            </div>
                            {pendingPoint && (
                                <span className="text-[7px] font-black bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/20 animate-pulse">Menunggu Defect Poin #{pendingPoint}...</span>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4 relative custom-scrollbar-dark select-none">
                            {selectedPart && selectedPart.image_path ? (
                                <div 
                                    className="relative max-w-full shadow-2xl rounded-2xl overflow-hidden border border-slate-800/80 transition-transform duration-100"
                                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                                >
                                    <img 
                                        src={`${api_url}/${selectedPart.image_path}`} 
                                        className="max-h-[480px] w-auto block" 
                                        onDragStart={(e) => e.preventDefault()}
                                    />
                                    {partPoints.map((p, idx) => {
                                        const size = selectedPart.marker_size || 32;
                                        const isBlinking = lastDetectedPoint == p.check_no;
                                        const isPending = pendingPoint == p.check_no;
                                        const hasNgDraft = problemsList.some(item => item.checkNo == p.check_no);

                                        let colorClass = 'bg-blue-600/70 border-blue-300 text-white';
                                        if (hasNgDraft) {
                                            colorClass = 'bg-red-600/70 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]';
                                        }
                                        if (isPending) {
                                            colorClass = 'bg-orange-500 border-white text-white scale-110 z-30 ring-4 ring-orange-300 animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]';
                                        }
                                        if (isBlinking && !isPending) {
                                            colorClass = 'bg-orange-500 border-white text-white scale-110 z-30 ring-4 ring-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.8)] animate-pulse';
                                        }

                                        return (
                                            <div 
                                                key={idx}
                                                className={`absolute rounded-full flex items-center justify-center font-black transition-all border-2 ${colorClass}`}
                                                style={{
                                                    left: `${p.x_coord}%`,
                                                    top: `${p.y_coord}%`,
                                                    width: `${size}px`,
                                                    height: `${size}px`,
                                                    transform: 'translate(-50%, -50%)',
                                                    zIndex: (isBlinking || isPending) ? 50 : undefined,
                                                    fontSize: `${Math.max(8, Math.round(size * 0.38))}px`
                                                }}
                                                title={`Point #${p.check_no}`}
                                            >
                                                {isPending ? <i className="fas fa-circle-question text-xs animate-bounce"></i> : p.check_no}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center text-slate-500 p-8 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-slate-800/40 flex items-center justify-center text-slate-600 border border-slate-800 text-base">
                                        <i className="fas fa-compass-drafting animate-pulse"></i>
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Peta koordinat part belum termuat</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: Timer, Microphone, NG Table, & Action Buttons (Span 5) */}
                <div className="lg:col-span-5 flex flex-col gap-4 h-full">
                    
                    {/* 1. TIMER EFISIENSI */}
                    <div className={`rounded-3xl py-2 px-4 border transition-all duration-300 flex flex-col justify-center h-[100px] shrink-0 ${
                        efficiencyTimerRunning
                        ? isBreakPaused
                            ? 'bg-amber-950/45 border-amber-800/60 shadow-lg'
                            : isOvertime
                                ? 'bg-orange-950/20 border-orange-500/40 shadow-lg shadow-orange-500/5 animate-pulse-slow'
                                : 'bg-slate-900 border-slate-800 shadow-lg'
                        : 'bg-white border-slate-100 shadow-sm'
                    }`}>
                        <div className="flex flex-row items-center gap-4">
                            {/* Sisi Kiri (Donut Efisiensi) */}
                            <div className="w-[25%] flex flex-col items-center justify-center border-r border-slate-200/15 pr-2 select-none shrink-0">
                                <div className="relative w-12 h-12 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 48 48">
                                        <circle cx="24" cy="24" r="18" stroke={efficiencyTimerRunning ? "#334155" : "#e2e8f0"} strokeWidth="3.5" fill="transparent" />
                                        <circle cx="24" cy="24" r="18" stroke="#10b981" strokeWidth="3.5" fill="transparent" strokeDasharray="113" strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-500" />
                                    </svg>
                                    <div className="absolute flex flex-col items-center justify-center">
                                        <span className={`text-[10px] font-black tracking-tighter ${efficiencyTimerRunning ? 'text-white' : 'text-slate-700'}`}>{avgEff}%</span>
                                    </div>
                                </div>
                                <span className={`text-[7px] font-black uppercase tracking-widest mt-0.5 text-center ${efficiencyTimerRunning ? 'text-slate-400' : 'text-slate-500'}`}>{efficiencyItems.length} ITEMS</span>
                            </div>

                            {/* Sisi Kanan (Controls & Takt Time Bar) */}
                            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1">
                                        <i className="fas fa-stopwatch text-amber-400"></i>
                                        <span className={efficiencyTimerRunning ? 'text-slate-300' : 'text-slate-500'}>Timer Efisiensi</span>
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                                        Takt: <span className="text-amber-500 font-black">{currentTaktTime}s</span>
                                        <button onClick={() => {
                                            const newVal = prompt('Takt Time (detik):', currentTaktTime);
                                            if (newVal) setTaktTime(parseInt(newVal) || 60);
                                        }} className="text-slate-400 hover:text-amber-500 transition-colors">
                                            <i className="fas fa-pen text-[7px]"></i>
                                        </button>
                                    </span>
                                </div>

                                <div className="flex items-center gap-3">
                                                                    <button
                                        onClick={!efficiencyTimerRunning ? handleStartTimerAndMic : undefined}
                                        disabled={efficiencyTimerRunning}
                                        className={`px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shrink-0 text-sm font-black leading-none ${
                                            !efficiencyTimerRunning
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                                            : 'bg-emerald-800/40 text-emerald-400 border border-emerald-800/30 opacity-75'
                                        }`}
                                        title={!efficiencyTimerRunning ? 'Mulai Timer' : 'Timer Aktif'}
                                    >
                                        <i className={`fas ${!efficiencyTimerRunning ? 'fa-play' : 'fa-check'} text-xs`}></i>
                                        <span>{!efficiencyTimerRunning ? 'Mulai' : 'Aktif'}</span>
                                    </button>

                                    {/* Elapsed Time & Active Progress Bar */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className={`text-base font-black tabular-nums tracking-tight ${
                                                isOvertime
                                                    ? 'text-orange-400 animate-pulse'
                                                    : efficiencyTimerRunning
                                                        ? 'text-white'
                                                        : 'text-slate-700'
                                            }`}>
                                                {Math.floor(efficiencyElapsed / 60)}:{(Math.floor(efficiencyElapsed) % 60).toString().padStart(2, '0')}
                                                {isTimerPaused && <span className="text-[8px] text-amber-400 font-bold ml-1">(jeda)</span>}
                                            </span>
                                            <span className="text-[8px] font-bold text-slate-400">/{currentTaktTime}s</span>
                                        </div>
                                        <div className="w-full bg-slate-700/50 border border-slate-700/30 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-200 ${
                                                    isBreakPaused 
                                                        ? 'bg-amber-500' 
                                                        : isOvertime 
                                                            ? 'bg-orange-500 animate-pulse' 
                                                            : 'bg-emerald-500'
                                                } ${isTimerPaused ? 'opacity-50' : ''}`}
                                                style={{ width: `${progressWidth}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            stopEfficiencyTimer();
                                            setEfficiencyItems([]);
                                        }}
                                        className="w-8 h-8 rounded-xl bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-700/30"
                                        title="Reset Timer & Data"
                                        disabled={!efficiencyTimerRunning && efficiencyItems.length === 0}
                                    >
                                        <i className="fas fa-rotate-right text-xs"></i>
                                    </button>
                                </div>
                                
                                {/* Info & Manual Settings Bar */}
                                {(efficiencyTimerRunning || efficiencyItems.length > 0) && (
                                    <div className="flex items-center justify-between mt-0.5 text-[8px] border-t border-slate-200/10 pt-1">
                                        <div className="flex items-center gap-1.5">
                                            {isBreakPaused && (
                                                <span className="text-amber-400 font-bold flex items-center gap-0.5">
                                                    <i className="fas fa-mug-hot"></i> Istirahat
                                                </span>
                                            )}
                                            {isOvertime && !isBreakPaused && (
                                                <span className="text-orange-400 font-black flex items-center gap-0.5 animate-pulse">
                                                    <i className="fas fa-triangle-exclamation"></i> OVERTIME
                                                </span>
                                            )}
                                        </div>

                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. MIKROFON */}
                    <div className="bg-slate-900 rounded-3xl py-2.5 px-4 shadow-xl border border-white/5 flex flex-col justify-center relative overflow-hidden shrink-0">
                        <div className={`absolute -inset-10 opacity-15 filter blur-3xl pointer-events-none transition-all duration-75 ${
                            status === 'listening' ? 'bg-blue-600 animate-pulse' :
                            status === 'transcribing' ? 'bg-amber-500 animate-pulse' :
                            status === 'success' ? 'bg-emerald-500' :
                            status === 'error' ? 'bg-red-500' : 'bg-slate-500'
                        }`}></div>

                        <div className="flex items-center gap-3 z-10">
                            <div className="relative shrink-0">
                                {isListening && (
                                    <div className="absolute inset-0 rounded-full border-4 border-blue-500/30 animate-ping"></div>
                                )}
                                <button 
                                    onClick={toggleListening}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all duration-300 shadow-xl relative border-2 ${
                                        isListening 
                                        ? 'bg-blue-600 border-blue-400 text-white hover:bg-blue-700 scale-105 shadow-blue-500/20' 
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
                                </button>
                            </div>

                            {isListening && (
                                <div ref={visualizerContainerRef} className="flex items-end gap-[2px] h-6 py-1 shrink-0">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="voice-viz-bar w-[2.5px] bg-gradient-to-t from-blue-400 via-cyan-300 to-blue-200 rounded-full"
                                            style={{ height: '3px', animationDelay: `${i * 0.08}s` }}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <select
                                        value={selectedMicId || ''}
                                        onChange={e => handleMicChange(e.target.value)}
                                        className="flex-1 min-w-0 text-[9px] bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2 py-1 cursor-pointer appearance-none"
                                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", backgroundSize: "14px", paddingRight: "20px" }}
                                    >
                                        {micDevices.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}...`}</option>
                                        ))}
                                    </select>
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider ${
                                        isMuted
                                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                                            : !isListening 
                                                ? 'bg-slate-800 text-slate-500 border border-slate-700' 
                                                : pendingPoint 
                                                    ? 'bg-orange-500 text-white animate-pulse'
                                                    : status === 'transcribing'
                                                        ? 'bg-amber-500 text-white animate-pulse'
                                                        : status === 'success'
                                                            ? 'bg-emerald-500 text-white'
                                                            : status === 'error'
                                                                ? 'bg-red-500 text-white'
                                                                : 'bg-blue-500 text-white animate-pulse'
                                    }`}>
                                        {isMuted
                                            ? 'Diam'
                                            : !isListening 
                                                ? 'Muted' 
                                                : pendingPoint 
                                                    ? `#${pendingPoint}`
                                                    : status === 'transcribing'
                                                        ? 'Proses'
                                                        : status === 'success'
                                                            ? 'OK'
                                                            : status === 'error'
                                                                ? 'Ulangi'
                                                                : 'Dengar'}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            const nextState = !voiceValidation;
                                            setVoiceValidation(nextState);
                                            window.VoiceFeedback.playBeep(nextState ? 600 : 300, 0.15);
                                            if (nextState) {
                                                setTimeout(() => speakFeedback("Suara aktif"), 200);
                                            }
                                        }}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                                            voiceValidation 
                                            ? 'bg-blue-500/20 border-blue-400 text-blue-300' 
                                            : 'bg-slate-800 border-slate-700 text-slate-500'
                                        }`}
                                        title="Aktifkan Umpan Balik Validasi Suara AI (TTS)"
                                    >
                                        <i className={`fas ${voiceValidation ? 'fa-volume-high' : 'fa-volume-xmark'} text-[8px]`}></i>
                                        <span className="text-[7px] font-black uppercase">Feedback: {voiceValidation ? 'ON' : 'OFF'}</span>
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const nextState = !visualFeedback;
                                            setVisualFeedback(nextState);
                                            window.VoiceFeedback.playBeep(nextState ? 600 : 300, 0.15);
                                        }}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                                            visualFeedback 
                                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' 
                                            : 'bg-slate-800 border-slate-700 text-slate-500'
                                        }`}
                                        title="Tampilkan notifikasi visual saat perintah dijalankan"
                                    >
                                        <i className={`fas ${visualFeedback ? 'fa-eye' : 'fa-eye-slash'} text-[8px]`}></i>
                                        <span className="text-[7px] font-black uppercase">Visual: {visualFeedback ? 'ON' : 'OFF'}</span>
                                    </button>
                                </div>

                                <p className={`text-sm font-black tracking-tight leading-normal transition-all ${
                                    status === 'success' ? 'text-emerald-400 drop-shadow' :
                                    status === 'error' ? 'text-red-400 drop-shadow' :
                                    isListening ? 'text-yellow-300 drop-shadow' : 'text-slate-400'
                                }`}>
                                    {transcript || (isListening ? 'Silakan berbicara...' : 'Klik mic untuk mulai.')}
                                </p>
                                
                                {isMuted && (
                                    <span className="text-[8px] font-bold text-purple-400 leading-none">
                                        🤫 Mode diam — suara tidak diproses. Katakan "Lanjut Dengarkan" untuk aktif.
                                    </span>
                                )}
                                {!isMuted && isListening && !pendingPoint && (
                                    <span className="text-[8px] text-slate-600 leading-none">
                                        💡 Katakan "Jangan Dengarkan" untuk mode diam.
                                    </span>
                                )}
                                {pendingPoint && (
                                    <span className="text-[8px] font-bold text-orange-400 animate-pulse leading-none">
                                        👉 Sebut jenis cacat untuk poin {pendingPoint} (cth: "undercut").
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. Draf Temuan NG Table Card */}
                    <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100 flex flex-col h-[230px] overflow-hidden shrink-0">
                        <div className="flex justify-between items-center mb-3 shrink-0">
                            <div className="flex flex-col">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Draf Temuan NG ({problemsList.length})</h3>
                                <span className="text-[8px] font-bold text-slate-400 tracking-tight mt-0.5">(NG Terkini Muncul Teratas)</span>
                            </div>
                            <button
                                onClick={addBlankRow}
                                className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-xl text-[8px] font-black uppercase flex items-center gap-1 transition-all active:scale-95"
                                title="Tambah temuan NG baru"
                            >
                                <i className="fas fa-plus text-[8px]"></i>
                                Tambah
                            </button>
                        </div>

                        {/* Scrolling list section (HEIGHT FIXED TO AUTO SCROLL INTERNAL ONLY!) */}
                        <div className="h-[140px] overflow-y-auto mb-1 border border-slate-100 rounded-2xl custom-scrollbar bg-slate-50">
                            {problemsList.length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase tracking-widest font-black sticky top-0 border-b border-slate-200 z-10">
                                        <tr>
                                            <th className="p-3 w-16">Poin</th>
                                            <th className="p-3">Defect</th>
                                            <th className="p-3 text-center w-16">Kode</th>
                                            <th className="p-3 text-center w-16">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {problemsList.map((item, idx) => {
                                            const isNewest = idx === 0;
                                            return (
                                                <tr key={item.timestamp || idx} className={`hover:bg-blue-50/50 bg-white transition-colors ${isNewest ? 'animate-row-glow' : ''}`}>
                                                    <td className="p-2 w-16">
                                                        <input
                                                            type="text"
                                                            value={item.checkNo}
                                                            onChange={(e) => {
                                                                updateRow(idx, 'checkNo', e.target.value);
                                                                updateRow(idx, 'pointCheck', `Point #${e.target.value}`);
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            onClick={(e) => e.target.select()}
                                                            placeholder="#"
                                                            className="w-12 px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-center shadow-sm"
                                                        />
                                                    </td>
                                                    <td className="p-2 relative">
                                                        <input
                                                            type="text"
                                                            value={item.problem}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                updateRow(idx, 'problem', val);
                                                                setSuggestionSearchTerm(val);
                                                                setShowSuggestionRow(idx);
                                                                if (metadata.partNumber) fetchProblemSuggestions(val);
                                                                // Auto-detect defect code from typed text
                                                                const tVal = val.toLowerCase().trim();
                                                                const matchedGuidance = window.DEFECT_GUIDANCE?.find(g =>
                                                                    g.name.toLowerCase().includes(tVal) ||
                                                                    tVal.includes(g.name.toLowerCase()) ||
                                                                    g.keywords?.some(k => tVal.includes(k.toLowerCase()) || k.toLowerCase().includes(tVal))
                                                                );
                                                                if (matchedGuidance) {
                                                                    updateRow(idx, 'defectCode', matchedGuidance.code);
                                                                }
                                                            }}
                                                            onFocus={(e) => {
                                                                if (suggestionBlurRef.current) clearTimeout(suggestionBlurRef.current);
                                                                e.target.select();
                                                                setShowSuggestionRow(idx);
                                                                if (metadata.partNumber) fetchProblemSuggestions('');
                                                            }}
                                                            onBlur={() => {
                                                                suggestionBlurRef.current = setTimeout(() => setShowSuggestionRow(-1), 200);
                                                            }}
                                                            placeholder="Defect..."
                                                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white shadow-sm"
                                                        />
                                                        {showSuggestionRow === idx && metadata.partNumber && (
                                                            <div
                                                                className="absolute z-[110] left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto custom-scrollbar"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                            >
                                                                {problemSuggestions.length > 0 ? problemSuggestions.map((p, i) => (
                                                                    <div
                                                                        key={i}
                                                                        onClick={() => handleSelectSuggestion(idx, p.text)}
                                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0 text-xs"
                                                                    >
                                                                        <span className="font-bold text-slate-600">{p.text}</span>
                                                                        {p.type === 'history' && <span className="text-[7px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-black uppercase">Sering</span>}
                                                                    </div>
                                                                )) : (
                                                                    <div className="px-3 py-2 text-center text-xs text-slate-300 italic">Memuat...</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-2 text-center w-16">
                                                        <input
                                                            type="text"
                                                            value={item.defectCode}
                                                            onChange={(e) => {
                                                                const val = e.target.value.toUpperCase();
                                                                updateRow(idx, 'defectCode', val);
                                                                const matched = window.DEFECT_GUIDANCE?.find(g => g.code === val);
                                                                if (matched && !item.problem) {
                                                                    updateRow(idx, 'problem', matched.name);
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            onClick={(e) => e.target.select()}
                                                            placeholder="Kode"
                                                            className="w-12 px-1.5 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-black text-blue-700 outline-none focus:ring-1 focus:ring-blue-500 text-center uppercase shadow-sm"
                                                        />
                                                    </td>
                                                    <td className="p-2 text-center w-16">
                                                        <button 
                                                            onClick={() => setProblemsListState(prev => prev.filter((_, i) => i !== idx))}
                                                            className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 border border-red-100/50 flex items-center justify-center transition-all active:scale-95 shadow-sm"
                                                            title="Hapus Temuan Ini"
                                                        >
                                                             <i className="fas fa-times text-sm"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-xs p-6 text-center gap-2">
                                    <i className="fas fa-microphone-lines text-2xl text-blue-500 animate-pulse mb-1"></i>
                                    <span>Belum ada temuan NG terdaftar.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. Action Save & Reset Buttons Card (Positioned at the very bottom in single line!) */}
                    <div className="bg-white rounded-3xl p-3 border border-slate-100 flex flex-row gap-2 shrink-0">
                        <button 
                            onClick={handleSaveDraft}
                            disabled={isSaving || (problemsList.length === 0 && totalNgFrame === 0)}
                            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-black py-2.5 px-2 rounded-2xl text-[9px] uppercase tracking-wider transition-all active:scale-95 disabled:bg-slate-50 disabled:text-slate-300 flex items-center justify-center gap-1 border border-blue-200 truncate animate-pulse-slow"
                            title="Simpan Progres Sesi ke Memori Laptop (Offline)"
                        >
                            <i className="fas fa-floppy-disk text-[10px]"></i>
                            Draf
                        </button>

                        <button 
                            onClick={() => {
                                if (!metadata.inspector || !metadata.linePos) {
                                    alert("Harap lengkapi formulir metadata (Inspector, Line) terlebih dahulu!");
                                    return;
                                }
                                setShowSaveConfirm(true);
                            }}
                            disabled={isSaving || !metadata.inspector || !(metadata.partNumber || sidesDataRef.current['KIRI']?.metadata?.partNumber || sidesDataRef.current['KANAN']?.metadata?.partNumber)}
                            className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-2 rounded-2xl text-[9px] uppercase tracking-wider shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-1 transition-all active:scale-95 disabled:bg-slate-200 disabled:shadow-none truncate"
                            title="Simpan final laporan inspeksi ke Database MySQL"
                        >
                            {isSaving ? (
                                <i className="fas fa-spinner animate-spin"></i>
                            ) : (
                                <>
                                    <i className="fas fa-cloud-arrow-up text-[10px]"></i>
                                    Database
                                </>
                            )}
                        </button>

                        <button 
                            onClick={handleDiscard}
                            disabled={isSaving || (!metadata.inspector && problemsList.length === 0 && totalNgFrame === 0 && totalOk === 0 && totalScrap === 0)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black py-2.5 px-3 rounded-2xl text-[9px] uppercase tracking-wider transition-all active:scale-95 disabled:bg-slate-50 disabled:border-slate-200 disabled:text-slate-300 flex items-center justify-center gap-1 shrink-0"
                            title="Batalkan inspeksi saat ini dan bersihkan data"
                        >
                            <i className="fas fa-trash-can text-[10px]"></i>
                            Reset
                        </button>
                    </div>

                </div>

            </div>

            {/* VOICE GUIDANCE POPUP MODAL */}
            {showVoiceGuidance && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[10005] !mt-0 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-lg font-black tracking-tight uppercase">PANDUAN SUARA (VOICE QC)</h2>
                                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Daftar Perintah & Deteksi Defect</p>
                            </div>
                            <button onClick={() => setShowVoiceGuidance(false)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                            {/* General Voice Commands — dynamic from settings */}
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><i className="fas fa-bullhorn text-blue-500"></i> Perintah Suara Kuantitas</h3>
                                {(() => {
                                    const vm = window.VOICE_COMMANDS || {};
                                    const getKws = (type, fallback) => {
                                        const cmds = vm[type];
                                        return cmds && cmds.length > 0 ? cmds.map(c => c.keyword).join(', ') : fallback;
                                    };
                                    const gridCommands = [
                                        { type: 'ok', label: 'Tambah Total OK', bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-800', fallback: 'OK, OKE, BAGUS' },
                                        { type: 'ng_frame', label: 'Tambah NG Frame', bg: 'bg-red-50 border-red-100', text: 'text-red-800', fallback: 'REJECT, CACAT, NG' },
                                        { type: 'scrap', label: 'Tambah Scrap', bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', fallback: 'BUANG, SCRAP, DIBUANG' },
                                    ];
                                    const rowCommands = [
                                        { type: 'undo', icon: 'fa-undo', iconColor: 'text-orange-600', label: 'Hapus NG Terakhir (Undo)', bg: 'bg-orange-50 border-orange-100', labelText: 'text-orange-800', kwsText: 'text-slate-700', fallback: 'BATAL POINT, CANCEL POINT' },
                                        { type: 'batal_cycle', icon: 'fa-rotate-left', iconColor: 'text-red-600', label: 'Batal 1 Cycle (Undo Prod)', bg: 'bg-red-50 border-red-100', labelText: 'text-red-800', kwsText: 'text-slate-700', fallback: 'BATAL CYCLE, CANCEL CYCLE, UNDO' },
                                        { type: null, icon: 'fa-arrows-left-right', iconColor: 'text-cyan-600', label: 'Ganti Sisi (Kiri/Kanan)', bg: 'bg-cyan-50 border-cyan-100', labelText: 'text-cyan-800', kwsText: 'text-slate-700', kws: 'KE KANAN, KE KIRI, PINDAH KANAN' },
                                        { type: 'mute', icon: 'fa-microphone-slash', iconColor: 'text-purple-600', label: 'Mode Diam (Mute)', bg: 'bg-purple-50 border-purple-100', labelText: 'text-purple-800', kwsText: 'text-slate-700', fallback: 'DIAM, MUTE, HENING' },
                                        { type: 'unmute', icon: 'fa-microphone', iconColor: 'text-blue-600', label: 'Aktifkan Mic (Unmute)', bg: 'bg-blue-50 border-blue-100', labelText: 'text-blue-800', kwsText: 'text-slate-700', fallback: 'MENDENGARKAN, AKTIF, BANGUN' },
                                        { type: null, icon: 'fa-microphone-slash', iconColor: 'text-red-400', label: 'Hentikan Mic', bg: 'bg-slate-900 border-slate-700', labelText: 'text-slate-400', kwsText: 'text-slate-300', kws: 'STOP DENGARKAN, MATIKAN MIC, STOP MIC' },
                                    ];
                                    const cardClasses = 'rounded-xl p-2.5';
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                {gridCommands.map(c => (
                                                    <div key={c.type} className={`${c.bg} border ${cardClasses}`}>
                                                        <div className={`text-[9px] font-black ${c.text} uppercase tracking-wider mb-0.5`}>{c.label}</div>
                                                        <div className="text-xs font-bold text-slate-700">"{getKws(c.type, c.fallback)}"</div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                                {rowCommands.map((c, i) => (
                                                    <div key={i} className={`${c.bg} border ${cardClasses} flex items-center gap-2`}>
                                                        <i className={`fas ${c.icon} ${c.iconColor} text-xs`}></i>
                                                        <div>
                                                            <div className={`text-[8px] font-black ${c.labelText} uppercase tracking-wider`}>{c.label}</div>
                                                            <div className={`text-[10px] font-bold ${c.kwsText}`}>"{c.kws || getKws(c.type, c.fallback)}"</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Defects Guidance List */}
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><i className="fas fa-circle-exclamation text-red-500"></i> Daftar Deteksi Masalah (Defect)</h3>
                                <p className="text-[9px] font-bold text-slate-400 mb-4">Sebutkan kata kunci defect setelah nomor poin terdeteksi (Contoh: "Poin 5 Undercut" atau sebut nomornya "Poin 5" lalu katakan "Keropos").</p>
                                
                                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                    <div className="overflow-x-auto max-h-[40vh] custom-scrollbar">
                                        <table className="w-full text-left border-collapse text-[10px]">
                                            <thead className="bg-slate-900 text-white sticky top-0 font-black uppercase tracking-wider text-[9px] z-10">
                                                <tr>
                                                    <th className="p-3 text-center w-12">No</th>
                                                    <th className="p-3">Nama Problem</th>
                                                    <th className="p-3 text-center w-24">Code Problem</th>
                                                    <th className="p-3">Keyword</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {window.DEFECT_GUIDANCE && window.DEFECT_GUIDANCE.map((item, idx) => {
                                                    const keywords = item.keywords || [];
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                                                            <td className="p-2.5 font-bold text-slate-800">{item.name}</td>
                                                            <td className="p-2.5 text-center">
                                                                <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded font-black text-[10px] uppercase border border-blue-200/50">{item.code}</span>
                                                            </td>
                                                            <td className="p-2.5 font-bold text-slate-500 italic">{keywords.join(', ') || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                            <button onClick={() => setShowVoiceGuidance(false)} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md">
                                Tutup Panduan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Part Picker Modal */}
            {showPartPickerModal && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" onClick={() => setShowPartPickerModal(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[75vh] flex flex-col overflow-hidden border border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <i className="fas fa-database text-blue-600"></i> Pilih Part
                            </h3>
                            <button onClick={() => setShowPartPickerModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <div className="p-5 border-b border-slate-100 shrink-0">
                            <div className="relative">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input type="text" placeholder="Cari Part Number / Nama Part / Model..." value={partPickerSearch} onChange={(e) => setPartPickerSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" autoFocus />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 pt-3 custom-scrollbar">
                            {(() => {
                                const filtered = partsList.filter(p => {
                                    const q = partPickerSearch.toLowerCase().trim();
                                    if (!q) return true;
                                    return p.part_number.toLowerCase().includes(q) ||
                                           (p.part_name || '').toLowerCase().includes(q) ||
                                           (p.model || '').toLowerCase().includes(q);
                                });
                                const getGroupLabel = (part) => {
                                    const m = part.model || '-';
                                    if (m === 'D26A' && (part.part_name || '').toUpperCase().includes('FRONT')) return 'D26A Front';
                                    return m;
                                };
                                const grouped = {};
                                filtered.forEach(p => {
                                    const g = getGroupLabel(p);
                                    if (!grouped[g]) grouped[g] = [];
                                    grouped[g].push(p);
                                });
                                const sortedModels = Object.keys(grouped).sort();
                                if (sortedModels.length === 0) {
                                    return <div className="text-center py-10 text-slate-300 text-xs italic">Part tidak ditemukan</div>;
                                }
                                return sortedModels.map(model => {
                                    const parts = grouped[model];
                                    const isOpen = partPickerExpanded[model] === true;
                                    return (
                                        <div key={model} className="mb-2 border border-slate-200 rounded-2xl overflow-hidden">
                                            <button onClick={() => setPartPickerExpanded(prev => ({...prev, [model]: !prev[model]}))} className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] transition-transform ${isOpen ? 'bg-blue-600 text-white rotate-90' : 'bg-slate-200 text-slate-500'}`}>
                                                    <i className="fas fa-chevron-right"></i>
                                                </div>
                                                <span className="font-bold text-slate-700 text-[11px]">{model}</span>
                                                <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-bold ml-auto">{parts.length}</span>
                                            </button>
                                            {isOpen && (
                                                <div className="divide-y divide-slate-100">
                                                    {parts.map(p => (
                                                        <button key={p.part_number} onClick={() => {
                                                            setSelectedPart(p);
                                                            setMetadata({...metadata, partNumber: p.part_number, model: p.model || ''});
                                                            if (p.takt_time) setTaktTime(p.takt_time);
                                                            setPartPickerSearch('');
                                                            setShowPartPickerModal(false);
                                                        }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
                                                            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-black shrink-0">
                                                                <i className="fas fa-cube"></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-slate-800 truncate">{p.part_name || '-'}</p>
                                                                <p className="text-[8px] text-slate-400 font-mono truncate">{p.part_number}</p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {p.line && <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{p.line}</span>}
                                                                <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{p.model || '-'}</span>
                                                            </div>
                                                        </button>
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

            {/* ABNORMALITY SUCCESS TOAST */}
            {showAbnormalSuccess && (
                <div className="fixed top-6 right-6 z-[400] animate-in slide-in-from-top-4 duration-300">
                    <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/30">
                        <i className="fas fa-check-circle text-lg"></i>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest">Abnormalitas Tercatat</p>
                            <p className="text-[9px] font-bold text-emerald-100">{abnormalCategory} - {showAbnormalSuccess}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* CHECK PROGRESS LIVE ANALYTICS MODAL */}
            {showProgressModal && (
                <window.LivePartAnalyticsModal
                    part={{
                        part_number: metadata.partNumber,
                        part_name: selectedPart?.part_name || '',
                        model: metadata.model || '',
                        initialModel: metadata.model || ''
                    }}
                    api_url={api_url}
                    onClose={() => setShowProgressModal(false)}
                />
            )}

            {/* ABNORMALITY POPUP */}
            {/* DIAGNOSTIC POPUP */}
            {showDiagnostic && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => { setShowDiagnostic(false); }}>
                    <div className="bg-white rounded-[3rem] w-full max-w-lg mx-4 overflow-hidden shadow-2xl border border-blue-200 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
                                <i className="fas fa-microphone-slash text-3xl text-white"></i>
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-wide">Mic Tidak Aktif</h2>
                        </div>
                        <div className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            <p className="text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-line">{diagnosticMessage}</p>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-center gap-3">
                            <button
                                onClick={() => { setShowDiagnostic(false); }}
                                className="text-[10px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-wider transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAbnormalPopup && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => { setShowAbnormalPopup(false); setAbnormalCategory(null); }}>
                    <div className="bg-white rounded-[3rem] w-full max-w-lg mx-4 overflow-hidden shadow-2xl border border-red-200 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        <div className={`p-6 text-center ${abnormalCategory ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-slate-800 to-slate-900'}`}>
                            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
                                <i className="fas fa-triangle-exclamation text-3xl text-white"></i>
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-wide">Abnormalitas</h2>
                            <p className="text-[10px] text-white/70 font-bold mt-1">
                                {abnormalCategory ? `Kategori: ${abnormalCategory}` : 'Pilih jenis masalah'}
                            </p>
                        </div>

                        <div className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {!abnormalCategory ? (
                                /* LEVEL 1: 4M1E Buttons */
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { key: 'Man', icon: 'fa-user', color: 'bg-orange-500 hover:bg-orange-600', desc: 'Operator / SDM' },
                                        { key: 'Mesin', icon: 'fa-cogs', color: 'bg-blue-500 hover:bg-blue-600', desc: 'Peralatan / Mesin' },
                                        { key: 'Material', icon: 'fa-cube', color: 'bg-amber-500 hover:bg-amber-600', desc: 'Bahan Baku / Part' },
                                        { key: 'Metode', icon: 'fa-book', color: 'bg-purple-500 hover:bg-purple-600', desc: 'Cara Kerja / SOP' },
                                        { key: 'Environment', icon: 'fa-tree', color: 'bg-emerald-500 hover:bg-emerald-600', desc: 'Lingkungan Kerja' },
                                    ].map(item => (
                                        <button
                                            key={item.key}
                                            onClick={() => {
                                                setAbnormalCategory(item.key);
                                                const flatCats = window.ABNORMALITY_CATEGORIES_FLAT || [];
                                                const problems = flatCats.filter(c => c.category_4m1e === item.key && c.active);
                                                if (problems.length > 0) {
                                                    const names = problems.map(p => p.problem_name).join(', ');
                                                    speakFeedback(`${item.key}, sebutkan masalah, seperti ${names.substring(0, 100)}`);
                                                }
                                            }}
                                            className={`${item.color} text-white px-5 py-4 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98] shadow-md`}
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                                                <i className={`fas ${item.icon}`}></i>
                                            </div>
                                            <div className="text-left">
                                                <div className="text-base font-black uppercase">{item.key}</div>
                                                <div className="text-[10px] font-bold text-white/70">{item.desc}</div>
                                            </div>
                                            <i className="fas fa-chevron-right ml-auto text-white/50"></i>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                /* LEVEL 2: Problem list for selected 4M1E */
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setAbnormalCategory(null)}
                                        className="flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-slate-800 mb-3 transition-colors uppercase tracking-wider"
                                    >
                                        <i className="fas fa-arrow-left text-xs"></i> Kembali
                                    </button>
                                    {(() => {
                                        const flatCats = window.ABNORMALITY_CATEGORIES_FLAT || [];
                                        const problems = flatCats.filter(c => c.category_4m1e === abnormalCategory && c.active);
                                        if (problems.length === 0) {
                                            return <p className="text-center text-slate-400 font-bold py-8">Belum ada masalah terdaftar untuk {abnormalCategory}. Tambahkan di Settings &gt; 4M1E Abnormality.</p>;
                                        }
                                        return problems.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => recordAbnormality(p.problem_name)}
                                                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center text-xs group-hover:bg-red-600 group-hover:text-white transition-all">
                                                    <i className="fas fa-circle-exclamation"></i>
                                                </div>
                                                <span className="text-sm font-bold text-slate-800 group-hover:text-red-700 transition-colors">{p.problem_name}</span>
                                                {p.keywords && <span className="ml-auto text-[7px] text-slate-400 italic truncate max-w-[100px]">{p.keywords.split(',').slice(0, 2).join(', ')}</span>}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 flex justify-center">
                            <button
                                onClick={() => { setShowAbnormalPopup(false); setAbnormalCategory(null); }}
                                className="text-[10px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-wider transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BREAK POPUP */}
            {showBreakPopup && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/70 backdrop-blur-xl">
                    <div className="bg-white rounded-[3rem] w-full max-w-lg mx-4 overflow-hidden shadow-2xl border border-amber-200 animate-in zoom-in-95 duration-300">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
                            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                <i className="fas fa-mug-hot text-4xl text-white"></i>
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-wide">Waktu Istirahat</h2>
                        </div>
                        <div className="p-8 text-center">
                            <p className="text-3xl font-black text-slate-800 mb-2">{currentBreakInfo?.break_label || 'Istirahat'}</p>
                            <p className="text-lg font-bold text-slate-500 mb-6">
                                {currentBreakInfo?.start_time?.substring(0, 5)} — {currentBreakInfo?.end_time?.substring(0, 5)}
                            </p>
                            <button
                                onClick={handleBreakOneCycle}
                                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg uppercase rounded-2xl transition-all shadow-lg hover:shadow-emerald-600/30 active:scale-[0.99]"
                            >
                                <i className="fas fa-play mr-2"></i> Lanjutkan 1 Cycle
                            </button>
                            <p className="text-xs font-bold text-slate-400 mt-4">
                                Setelah menambah 1 data OK atau NG, popup ini akan muncul kembali
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* SAVE CONFIRMATION POPUP */}
            {showSaveConfirm && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/75 backdrop-blur-xl">
                    <div className="bg-slate-900 border border-slate-700/80 rounded-[2.5rem] w-full max-w-md mx-4 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-center">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white">
                            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
                                <i className="fas fa-cloud-arrow-up text-2xl text-white"></i>
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-wide">Konfirmasi Simpan</h2>
                            <p className="text-[10px] text-white/70 font-bold mt-1">Laporan inspeksi akan disimpan permanen ke database</p>
                        </div>
                        <div className="p-8 space-y-4">
                            <p className="text-xs font-bold text-slate-300 leading-relaxed">
                                Apakah Anda yakin ingin mengakhiri sesi dan menyimpan seluruh data pengecekan untuk Sisi Kiri & Kanan ke database?
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={async () => { setShowSaveConfirm(false); await handleSubmit(); }}
                                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <i className="fas fa-check"></i> Ya, Simpan
                                </button>
                                <button 
                                    onClick={() => setShowSaveConfirm(false)}
                                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-black text-xs uppercase rounded-xl transition-all border border-slate-700 active:scale-95"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FULL MANUAL MODE POPUP */}
            {showFullManualMode && (
                <div className="fixed top-0 left-0 w-screen h-screen z-[9999] !mt-0 flex flex-col bg-slate-950 animate-in fade-in duration-200">
                    <div className={`flex items-center justify-between px-6 py-2.5 shrink-0 gap-4 select-none transition-all duration-300 border-b ${
                        activeSide === 'KIRI'
                            ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/20 border-blue-600/80 shadow-[0_4px_12px_rgba(59,130,246,0.12)]'
                            : 'bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/20 border-purple-600/80 shadow-[0_4px_12px_rgba(168,85,247,0.12)]'
                    }`}>
                        {/* Left Part: Title & Side */}
                        <div className="flex items-center gap-2.5 shrink-0">
                            <button 
                                onClick={() => {
                                    if (!metadata.inspector || !metadata.linePos) {
                                        alert("Harap lengkapi formulir metadata (Inspector, Line) terlebih dahulu!");
                                        return;
                                    }
                                    setShowSaveConfirm(true);
                                }}
                                disabled={isSaving || !metadata.inspector || !(metadata.partNumber || sidesDataRef.current['KIRI']?.metadata?.partNumber || sidesDataRef.current['KANAN']?.metadata?.partNumber)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[9px] font-black uppercase flex items-center gap-1.5 tracking-wider shadow transition-all active:scale-95"
                                title="Simpan final laporan inspeksi ke Database MySQL"
                            >
                                {isSaving ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-cloud-arrow-up text-[9px]"></i>}
                                <span>SAVE</span>
                            </button>
                            <button onClick={() => switchSide(activeSide === 'KIRI' ? 'KANAN' : 'KIRI')} className="text-[9px] text-slate-400 hover:text-white transition-colors bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 font-bold">
                                Side: <strong className={activeSide === 'KIRI' ? 'text-blue-400' : 'text-purple-400'}>{activeSide}</strong>{selectedPart ? ` - ${selectedPart.part_name}` : ''}
                            </button>
                        </div>

                        {/* Center Part: Timer & Efficiency */}
                        <div className="flex items-center gap-3 bg-slate-950/40 px-3 py-1 rounded-xl border border-slate-800/80">
                            <div className="flex items-center gap-1 text-[8px] text-slate-400 font-bold">
                                <i className="fas fa-stopwatch text-amber-400"></i>
                                <span>Takt: <strong className="text-amber-500">{currentTaktTime}s</strong></span>
                            </div>
                            <button
                                onClick={!efficiencyTimerRunning ? handleStartTimerAndMic : undefined}
                                disabled={efficiencyTimerRunning}
                                className={`px-2 py-1 rounded-md flex items-center gap-1 text-[8px] font-black transition-all ${
                                    !efficiencyTimerRunning
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-emerald-800/40 text-emerald-400 opacity-75'
                                }`}
                            >
                                <i className={`fas ${!efficiencyTimerRunning ? 'fa-play' : 'fa-check'} text-[7px]`}></i>
                                <span>{!efficiencyTimerRunning ? 'Mulai' : 'Aktif'}</span>
                            </button>
                            <div className="text-[11px] font-black text-white tabular-nums tracking-tight">
                                <span className={isOvertime ? 'text-orange-400 animate-pulse' : 'text-white'}>{Math.floor(efficiencyElapsed / 60)}:{(Math.floor(efficiencyElapsed) % 60).toString().padStart(2, '0')}</span>
                                <span className="text-[8px] text-slate-500">/{currentTaktTime}s</span>
                            </div>
                            <div className="w-[80px] bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-200 ${isOvertime ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} style={{ width: `${progressWidth}%` }}></div>
                            </div>
                            <div className="text-[9px] font-black text-slate-300">{avgEff}% Eff</div>
                        </div>

                        {/* Mic & Voice Status (merged & simplified) */}
                        <div className="flex items-center gap-2 bg-slate-950/40 px-3 py-1 rounded-xl border border-slate-800/80 max-w-[280px]">
                            <button onClick={toggleListening} className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all border ${
                                isListening ? 'bg-blue-600 border-blue-400 text-white scale-105 animate-pulse' : 'bg-slate-850 border-slate-700 text-slate-400 hover:text-white'
                            }`}>
                                <i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-slash'} text-[10px]`}></i>
                            </button>
                            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider leading-none ${
                                isMuted ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                                : !isListening ? 'bg-slate-800 text-slate-500' 
                                : pendingPoint ? 'bg-orange-500 text-white animate-pulse'
                                : status === 'transcribing' ? 'bg-amber-500 text-white animate-pulse'
                                : status === 'success' ? 'bg-emerald-500 text-white'
                                : status === 'error' ? 'bg-red-500 text-white'
                                : 'bg-blue-500 text-white'
                            }`}>
                                {isMuted ? 'Diam' : !isListening ? 'Muted' : pendingPoint ? `#${pendingPoint}` : status === 'transcribing' ? 'Proses' : status === 'success' ? 'OK' : status === 'error' ? 'Ulang' : 'Dengar'}
                            </span>
                            <span className="text-[8px] text-slate-500 font-bold truncate flex-1 min-w-[60px] max-w-[120px]">{transcript || '—'}</span>
                        </div>

                        {/* Right Section: Abnormality, Panduan, Ganti Part & Ganti Mode */}
                        <div className="flex items-center gap-2.5 shrink-0">
                            {/* Abnormality Button */}
                            <button 
                                onClick={() => { setShowAbnormalPopup(true); setAbnormalCategory(null); window.VoiceFeedback.playBeep(523, 0.15); speakFeedback('Pilih jenis masalah'); }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-950/45 hover:bg-red-900/35 border border-red-800/45 hover:border-red-700 text-red-400 hover:text-red-300 text-[8px] font-black uppercase flex items-center gap-1 transition-all"
                            >
                                <i className="fas fa-triangle-exclamation"></i>
                                <span>Abnormality</span>
                            </button>

                            {/* Check Progress Button */}
                            <button 
                                onClick={() => setShowProgressModal(true)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-950/45 hover:bg-emerald-900/35 border border-emerald-800/45 hover:border-emerald-700 text-emerald-400 hover:text-emerald-300 text-[8px] font-black uppercase flex items-center gap-1 transition-all"
                            >
                                <i className="fas fa-chart-line"></i>
                                <span>Check Progress</span>
                            </button>

                            {/* Panduan Button */}
                                    <button 
                                        onClick={() => { if (window.loadVoiceCommandsFromServer) window.loadVoiceCommandsFromServer(api_url); setShowVoiceGuidance(true); }}
                                        className="px-2.5 py-1.5 rounded-lg bg-blue-950/45 hover:bg-blue-900/35 border border-blue-800/45 hover:border-blue-700 text-blue-400 hover:text-blue-300 text-[8px] font-black uppercase flex items-center gap-1 transition-all"
                                    >
                                        <i className="fas fa-book-open"></i>
                                        <span>Panduan</span>
                                    </button>

                                    {/* Reset Sesi / Ganti Part Button */}
                                    <button 
                                        onClick={handleDiscard}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-650 hover:bg-red-750 text-white text-[8px] font-black uppercase flex items-center gap-1 transition-all shadow"
                                        title="Batalkan inspeksi saat ini, bersihkan data, dan pilih part baru"
                                    >
                                        <i className="fas fa-trash-can"></i>
                                        <span>RESET</span>
                                    </button>
                                </div>
                            </div>

                    {/* Main Content: Map + Counters */}
                    <div className="flex-1 flex gap-0 min-h-0">
                        {/* Radar Map */}
                        <div className="flex-1 flex flex-col min-w-0">
                            <div className={`flex-1 overflow-auto flex items-center justify-center p-4 custom-scrollbar-dark select-none relative transition-colors duration-350 ${
                                activeSide === 'KIRI' 
                                    ? 'bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950' 
                                    : 'bg-gradient-to-br from-purple-950 via-purple-900 to-slate-950'
                            }`}>
                                {/* Floating Zoom Controls */}
                                <div className="absolute bottom-6 left-6 z-[50] flex items-center gap-1 bg-slate-900/95 backdrop-blur border border-slate-750 px-2.5 py-1.5 rounded-xl shadow-2xl select-none">
                                    <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center text-xs font-bold bg-slate-850 hover:bg-slate-750 rounded-lg transition-colors" title="Zoom Out"><i className="fas fa-minus"></i></button>
                                    <span className="text-[10px] font-black text-slate-350 w-10 text-center">{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(prev => Math.min(3.0, prev + 0.1))} className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center text-xs font-bold bg-slate-850 hover:bg-slate-750 rounded-lg transition-colors" title="Zoom In"><i className="fas fa-plus"></i></button>
                                    <button onClick={() => setZoom(1.0)} className="text-[9px] text-slate-400 hover:text-white font-black bg-slate-850 hover:bg-slate-750 px-2.5 py-1 rounded-lg ml-1 transition-colors uppercase tracking-wider" title="Reset Zoom">Reset</button>
                                </div>

                                {/* Floating Current Cycle NG Panel */}
                                {Array.isArray(currentCycleNgPoints) && currentCycleNgPoints.filter(Boolean).length > 0 && (
                                    <div 
                                        ref={panelRef}
                                        onMouseDown={handleMouseDown}
                                        style={{
                                            position: 'absolute',
                                            top: `${ngPanelPos.y}px`,
                                            right: `${ngPanelPos.x}px`,
                                            zIndex: 60,
                                        }}
                                        className="w-72 rounded-2xl border border-red-500/30 bg-slate-900/90 backdrop-blur shadow-2xl transition-shadow flex flex-col text-slate-100 font-sans cursor-default select-none animate-in fade-in zoom-in-95 duration-200"
                                    >
                                        {/* Header / Drag Handle */}
                                        <div className="drag-handle flex items-center justify-between p-3 border-b border-slate-800 bg-red-950/20 rounded-t-2xl cursor-move">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Cacat Cycle Ini ({currentCycleNgPoints.filter(Boolean).length})</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setIsNgPanelCollapsed(!isNgPanelCollapsed); }}
                                                    className="w-5 h-5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-[10px]"
                                                >
                                                    <i className={`fas ${isNgPanelCollapsed ? 'fa-expand' : 'fa-compress'}`}></i>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Body */}
                                        {!isNgPanelCollapsed ? (
                                            <div className="p-3 max-h-60 overflow-y-auto space-y-2 custom-scrollbar-dark">
                                                {currentCycleNgPoints.filter(Boolean).map((item, idx) => (
                                                    <div key={item.timestamp || idx} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/40 border border-slate-850 hover:border-red-500/20 transition-colors group">
                                                        <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-[9px] font-black tracking-wide shrink-0">Point {item.checkNo || ''}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold text-slate-200 truncate">{item.problem || 'Menunggu problem...'}</div>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteCycleNgPoint(item); }}
                                                            className="w-5 h-5 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors text-[9px]"
                                                            title="Hapus cacat ini"
                                                        >
                                                            <i className="fas fa-trash text-[9px]"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-2 text-center text-[9px] font-black text-red-400 bg-red-500/5 rounded-b-2xl">
                                                {currentCycleNgPoints.filter(Boolean).map(item => `#${item.checkNo || ''}`).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedPart && selectedPart.image_path ? (
                                    <div className="relative max-w-full shadow-2xl rounded-2xl overflow-hidden border border-slate-800/80" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
                                        <img src={`${api_url}/${selectedPart.image_path}`} className="max-h-[88vh] max-w-full block" onDragStart={(e) => e.preventDefault()} />
                                        {partPoints.map((p, idx) => {
                                            const size = selectedPart.marker_size || 32;
                                            const hasNgDraft = problemsList.some(item => item.checkNo == p.check_no);
                                            let colorClass = hasNgDraft ? 'bg-red-600/70 border-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-blue-600/70 border-blue-300 text-white';
                                            return (
                                                <div key={idx} onClick={() => {
                                                    if (!metadata.partNumber) return;
                                                    setManualPointClick(p);
                                                    setManualProblemSearch('');
                                                    fetch(`${api_url}/api/settings/problem-list-with-frequency?part_number=${metadata.partNumber}`)
                                                        .then(r => r.json())
                                                        .then(res => { if (res.status === 'success') setManualProblemList(res.data); })
                                                        .catch(() => setManualProblemList([]));
                                                }} className={`absolute rounded-full flex items-center justify-center font-black border-2 cursor-pointer ${colorClass} hover:ring-4 hover:ring-amber-300 hover:z-30 transition-all`}
                                                    style={{ left: `${p.x_coord}%`, top: `${p.y_coord}%`, width: `${size}px`, height: `${size}px`, transform: 'translate(-50%, -50%)', fontSize: `${Math.max(8, Math.round(size * 0.38))}px` }}
                                                    title={`Point #${p.check_no}`}
                                                >{p.check_no}</div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-600 flex flex-col items-center gap-2">
                                        <i className="fas fa-compass-drafting text-3xl animate-pulse"></i>
                                        <span className="text-[10px] font-bold">Pilih Part terlebih dahulu</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Live Counters Vertical */}
                        <div className={`w-[180px] shrink-0 flex flex-col gap-4 p-4 overflow-y-auto transition-all duration-300 border-l ${
                            activeSide === 'KIRI'
                                ? 'bg-gradient-to-b from-slate-900 to-blue-950/20 border-blue-600/80 shadow-[-4px_0_12px_rgba(59,130,246,0.12)]'
                                : 'bg-gradient-to-b from-slate-900 to-purple-950/20 border-purple-600/80 shadow-[-4px_0_12px_rgba(168,85,247,0.12)]'
                        }`}>
                            {/* TOTAL PRODUKSI */}
                            <div 
                                onClick={handleFinishCycle}
                                className={`border rounded-2xl p-3 text-center transition-all duration-300 cursor-pointer active:scale-[0.98] hover:brightness-110 ${
                                    activeSide === 'KIRI'
                                        ? 'bg-blue-950/30 border-blue-900/40 text-blue-200'
                                        : 'bg-purple-950/30 border-purple-900/40 text-purple-200'
                                }`}
                                title="Klik untuk menyelesaikan 1 cycle part (Auto OK/NG)"
                            >
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Total Produksi</div>
                                <div className="font-black text-3xl text-slate-200 tabular-nums mt-0.5">{totalProd}</div>
                            </div>
                            <div className={`border rounded-2xl p-4 text-center transition-all duration-300 border-emerald-500/50 hover:border-emerald-400 ${
                                activeSide === 'KIRI'
                                    ? 'bg-blue-950/30 hover:bg-blue-900/30'
                                    : 'bg-purple-950/30 hover:bg-purple-900/30'
                            }`} onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementOk(); }}>
                                <div className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Total OK</div>
                                <div className="font-black text-4xl text-emerald-400 tabular-nums mt-1">{totalOk}</div>
                                <div className="flex justify-center gap-4 mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); handleUndoLastCycle(); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>-</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementOk(); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>+</button>
                                </div>
                            </div>
                            <div className={`border rounded-2xl p-4 text-center transition-all duration-300 ${
                                activeSide === 'KIRI'
                                    ? 'bg-blue-950/30 border-blue-900/40 hover:bg-blue-900/30'
                                    : 'bg-purple-950/30 border-purple-900/40 hover:bg-purple-900/30'
                            }`} onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalScrap(prev => prev + 1); window.VoiceFeedback.playScrapBeep(); speakFeedback('Scrap'); }}>
                                <div className="text-[9px] font-black text-white uppercase tracking-wider">Scrap</div>
                                <div className="font-black text-4xl text-white tabular-nums mt-1">{totalScrap}</div>
                                <div className="flex justify-center gap-4 mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); setTotalScrap(prev => Math.max(0, prev - 1)); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>-</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); setTotalScrap(prev => prev + 1); window.VoiceFeedback.playScrapBeep(); speakFeedback('Scrap'); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>+</button>
                                </div>
                            </div>
                            <div className={`border rounded-2xl p-4 text-center transition-all duration-300 border-red-500/50 hover:border-red-400 ${
                                activeSide === 'KIRI'
                                    ? 'bg-blue-950/30 hover:bg-blue-900/30'
                                    : 'bg-purple-950/30 hover:bg-purple-900/30'
                            }`} onClick={() => { if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementNgFrame(); }}>
                                <div className="text-[9px] font-black text-red-400 uppercase tracking-wider">NG Frame</div>
                                <div className="font-black text-4xl text-red-400 tabular-nums mt-1">{totalNgFrame}</div>
                                <div className="flex justify-center gap-4 mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); handleUndoLastCycle(); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>-</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (Date.now() - voiceCooldownRef.current < 6000) return; voiceCooldownRef.current = Date.now(); handleIncrementNgFrame(); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                                        activeSide === 'KIRI' ? 'bg-blue-800/50 hover:bg-blue-700/50 text-blue-300' : 'bg-purple-800/50 hover:bg-purple-700/50 text-purple-300'
                                    }`}>+</button>
                                </div>
                            </div>
                             <div 
                                 onClick={() => {
                                     if (!metadata.partNumber) {
                                         alert("Silakan pilih part terlebih dahulu!");
                                         return;
                                     }
                                     setShowPointSelectorGrid(true);
                                 }}
                                 className={`border rounded-2xl p-4 text-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-md ${
                                     activeSide === 'KIRI'
                                         ? 'bg-blue-950/30 border-blue-900/40 hover:bg-blue-900/20'
                                         : 'bg-purple-950/30 border-purple-900/40 hover:bg-purple-900/20'
                                 }`}
                                 title="Klik untuk memilih nomor titik welding secara manual lewat Grid"
                             >
                                 <div className="text-[9px] font-black text-blue-400 uppercase tracking-wider flex items-center justify-center gap-1">
                                     <i className="fas fa-grip"></i> NG Point
                                 </div>
                                 <div className={`font-black text-4xl tabular-nums mt-1 ${
                                     activeSide === 'KIRI' ? 'text-blue-400' : 'text-purple-400'
                                 }`}>{problemsList.length}</div>
                             </div>
                        </div>
                    </div>

                    {/* Full-Screen Manual Point Selection Grid (Backup Method) */}
                    {showPointSelectorGrid && (
                        <div className="fixed inset-0 z-[205] bg-slate-950/95 backdrop-blur-xl flex flex-col p-8 md:p-12 animate-in fade-in duration-200 select-none">
                            {/* Header */}
                            <div className="flex justify-between items-center shrink-0 border-b border-slate-850 pb-6 mb-6">
                                <div className="flex flex-col gap-1.5">
                                    <h2 className="text-2xl font-black text-white uppercase tracking-wider flex items-center gap-3">
                                        <i className="fas fa-grip text-amber-500"></i>
                                        Pilih Nomor Titik Welding
                                    </h2>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        Sisi: <strong className={activeSide === 'KIRI' ? 'text-blue-400' : 'text-purple-400'}>{activeSide}</strong> — Part: <span className="text-slate-200">{selectedPart ? selectedPart.part_name : ''}</span> ({partPoints.length} Titik)
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setShowPointSelectorGrid(false)}
                                    className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <i className="fas fa-xmark text-sm"></i>
                                    <span>Tutup</span>
                                </button>
                            </div>

                            {/* Grid container */}
                            <div className="flex-1 min-h-0 flex items-center justify-center">
                                {partPoints.length > 0 ? (
                                    <div className={`grid w-full h-full max-h-[70vh] gap-3 ${
                                        partPoints.length <= 15 ? 'grid-cols-5' :
                                        partPoints.length <= 30 ? 'grid-cols-6' :
                                        partPoints.length <= 50 ? 'grid-cols-8' :
                                        partPoints.length <= 80 ? 'grid-cols-10' : 'grid-cols-12'
                                    }`}>
                                        {[...partPoints].sort((a, b) => parseInt(a.check_no) - parseInt(b.check_no)).map((p, idx) => {
                                            const hasNgDraft = problemsList.some(item => item.checkNo == p.check_no);
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        setManualPointClick(p);
                                                        setManualProblemSearch('');
                                                        fetch(`${api_url}/api/settings/problem-list-with-frequency?part_number=${metadata.partNumber}`)
                                                            .then(r => r.json())
                                                            .then(res => { if (res.status === 'success') setManualProblemList(res.data); })
                                                            .catch(() => setManualProblemList([]));
                                                        setShowPointSelectorGrid(false);
                                                    }}
                                                    className={`w-full h-full flex items-center justify-center font-black rounded-2xl text-lg md:text-2xl border-2 transition-all active:scale-95 duration-100 ${
                                                        hasNgDraft
                                                        ? 'bg-red-650 hover:bg-red-750 border-red-500 text-white shadow-lg shadow-red-600/30'
                                                        : activeSide === 'KIRI'
                                                        ? 'bg-slate-900 hover:bg-blue-600/20 border-slate-800 hover:border-blue-500 text-blue-400 hover:text-white'
                                                        : 'bg-slate-900 hover:bg-purple-600/20 border-slate-800 hover:border-purple-500 text-purple-400 hover:text-white'
                                                    }`}
                                                >
                                                    {p.check_no}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-slate-500 text-sm font-bold">Tidak ada titik welding untuk part ini</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Problem Selection Popup (on point click) */}
                    {manualPointClick && (
                        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 md:p-6" onClick={() => { setManualPointClick(null); setManualProblemList([]); }}>
                            <div className="bg-slate-900 border border-slate-700/80 rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[85vh] max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/50 shrink-0">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                                                <i className="fas fa-map-pin text-amber-500"></i>
                                                Terpilih: Point #{manualPointClick.check_no}
                                            </h3>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Silakan pilih jenis cacat/problem pada titik ini</p>
                                    </div>
                                    <button onClick={() => { setManualPointClick(null); setManualProblemList([]); }} className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm transition-all border border-slate-700 shadow-lg"><i className="fas fa-times"></i></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar-dark">
                                    {manualProblemList.length === 0 ? (
                                        <div className="text-center py-12 text-slate-500 text-[10px] font-bold uppercase tracking-widest animate-pulse">Memuat daftar problem...</div>
                                    ) : (() => {
                                        const filtered = manualProblemList.filter(g => {
                                            const q = manualProblemSearch.toLowerCase().trim();
                                            if (!q) return true;
                                            return g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q) || (g.keywords || '').toLowerCase().includes(q);
                                        });
                                        const top5 = filtered.slice(0, 5);
                                        const rest = filtered.slice(5);
                                        return (
                                            <>
                                                {top5.length > 0 && (
                                                    <div className="mb-6">
                                                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-3 px-1"><i className="fas fa-star mr-1"></i>Paling Sering Muncul</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {top5.map(g => (
                                                                <button key={g.id} onClick={() => {
                                                                    const pointNo = manualPointClick.check_no;
                                                                    const defectName = g.name;
                                                                    const defectCode = g.code;
                                                                    const fbText = g.feedback_text || defectName.split('(')[0].replace(/Welding/g, '').trim();
                                                                    const newNG = {
                                                                        checkNo: pointNo.toString(),
                                                                        pointCheck: `Point #${pointNo}`,
                                                                        problem: defectName,
                                                                        defectCode: defectCode,
                                                                        qty: 1,
                                                                        location: { x: manualPointClick.x_coord, y: manualPointClick.y_coord },
                                                                        pageIndex: 0,
                                                                        confidence: 100,
                                                                        lowConfidenceReason: "",
                                                                        timestamp: Date.now()
                                                                    };
                                                                    setProblemsListState(prev => [newNG, ...prev]);
                                                                    setManualPointClick(null);
                                                                    setManualProblemList([]);
                                                                    window.VoiceFeedback.playPointNgBeep();
                                                                    speakFeedback(`titik ${pointNo}, ${fbText}`);
                                                                }} className="w-full text-left p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition-all flex items-center gap-3 h-16 group">
                                                                    <span className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black shrink-0 group-hover:scale-105 transition-transform">{g.code}</span>
                                                                    <span className="flex-1 text-xs font-bold text-white truncate">{g.name}</span>
                                                                    <span className="text-[10px] text-amber-500/70 font-black shrink-0">{(g.part_frequency || 0) + (g.global_frequency || 0)}×</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {rest.length > 0 && (
                                                    <div>
                                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1"><i className="fas fa-list mr-1"></i>Kategori Lainnya</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {rest.map(g => (
                                                                <button key={g.id} onClick={() => {
                                                                    const pointNo = manualPointClick.check_no;
                                                                    const defectName = g.name;
                                                                    const defectCode = g.code;
                                                                    const fbText = g.feedback_text || defectName.split('(')[0].replace(/Welding/g, '').trim();
                                                                    const newNG = {
                                                                        checkNo: pointNo.toString(),
                                                                        pointCheck: `Point #${pointNo}`,
                                                                        problem: defectName,
                                                                        defectCode: defectCode,
                                                                        qty: 1,
                                                                        location: { x: manualPointClick.x_coord, y: manualPointClick.y_coord },
                                                                        pageIndex: 0,
                                                                        confidence: 100,
                                                                        lowConfidenceReason: "",
                                                                        timestamp: Date.now()
                                                                    };
                                                                    setProblemsListState(prev => [newNG, ...prev]);
                                                                    setManualPointClick(null);
                                                                    setManualProblemList([]);
                                                                    window.VoiceFeedback.playPointNgBeep();
                                                                    speakFeedback(`titik ${pointNo}, ${fbText}`);
                                                                }} className="w-full text-left p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-slate-650 transition-all flex items-center gap-3 h-16 group">
                                                                    <span className="w-10 h-10 rounded-xl bg-slate-700 text-slate-400 flex items-center justify-center text-xs font-black shrink-0 group-hover:scale-105 transition-transform">{g.code}</span>
                                                                    <span className="flex-1 text-xs font-bold text-slate-200 group-hover:text-white truncate">{g.name}</span>
                                                                    <span className="text-[10px] text-slate-500 font-black shrink-0">{(g.part_frequency || 0) + (g.global_frequency || 0)}×</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {filtered.length === 0 && (
                                                    <div className="text-center py-12 text-slate-500 text-xs font-bold uppercase tracking-wider italic">Problem tidak ditemukan</div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                {/* Quick OK button */}
                                <div className="px-8 py-5 border-t border-slate-800 bg-slate-900/50 shrink-0">
                                    <button onClick={() => { setManualPointClick(null); setManualProblemList([]); }} className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20">
                                        <i className="fas fa-check text-sm"></i> OK — Lewati Point #{manualPointClick.check_no} (Semua OK)
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ZOMBIE RELOAD OVERLAY */}
            {showReloadOverlay && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/70 backdrop-blur-xl">
                    <div className="bg-white rounded-[3rem] w-full max-w-md mx-4 overflow-hidden shadow-2xl border border-red-200 animate-in zoom-in-95 duration-300 text-center">
                        <div className="bg-gradient-to-r from-red-500 to-rose-500 p-6">
                            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                <i className="fas fa-microphone-slash text-4xl text-white"></i>
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-wide">Mic Bermasalah</h2>
                        </div>
                        <div className="p-8 space-y-3">
                            <p className="text-base font-bold text-slate-600 mb-4">
                                Mikrofon berhenti merespon. Coba restart mic terlebih dahulu.
                            </p>
                            <button onClick={handleRestartMic}
                                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg uppercase rounded-2xl transition-all shadow-lg hover:shadow-emerald-600/30 active:scale-[0.99]">
                                <i className="fas fa-microphone mr-2"></i> Restart Mic
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VISUAL FEEDBACK POPUP */}
            {showVisualFeedback && (
                <div className="fixed inset-0 z-[10000] !mt-0 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
                    {!visualFeedbackSecondary ? (
                        <div className={`w-full max-w-sm mx-6 rounded-3xl shadow-2xl border-2 overflow-hidden animate-in zoom-in-95 duration-200 ${
                            visualFeedbackData.type === 'success'
                                ? 'bg-emerald-600 border-emerald-400'
                                : 'bg-red-600 border-red-400'
                        }`}>
                            <div className="p-10 text-center">
                                <div className={`w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center ${
                                    visualFeedbackData.type === 'success'
                                        ? 'bg-emerald-500/40'
                                        : 'bg-red-500/40'
                                }`}>
                                    <i className={`fas ${
                                        visualFeedbackData.type === 'success'
                                            ? 'fa-check-circle'
                                            : 'fa-circle-exclamation'
                                    } text-6xl text-white`}></i>
                                </div>
                                <h2 className={`text-3xl font-black uppercase tracking-wider mb-3 ${
                                    visualFeedbackData.type === 'success'
                                        ? 'text-emerald-50'
                                        : 'text-red-50'
                                }`}>
                                    {visualFeedbackData.type === 'success' ? 'Berhasil' : 'Gagal'}
                                </h2>
                                <p className="text-xl font-bold text-white/90 leading-relaxed">
                                    {visualFeedbackData.message}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-4 w-full max-w-lg mx-6">
                            {/* Card 1 — Point NG */}
                            <div className={`flex-1 rounded-3xl shadow-2xl border-2 overflow-hidden animate-in zoom-in-95 duration-200 ${
                                visualFeedbackData.type === 'success'
                                    ? 'bg-emerald-600 border-emerald-400'
                                    : 'bg-red-600 border-red-400'
                            }`}>
                                <div className="p-6 text-center">
                                    <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                                        visualFeedbackData.type === 'success'
                                            ? 'bg-emerald-500/40'
                                            : 'bg-red-500/40'
                                    }`}>
                                        <i className={`fas ${
                                            visualFeedbackData.type === 'success'
                                                ? 'fa-check-circle'
                                                : 'fa-circle-exclamation'
                                        } text-4xl text-white`}></i>
                                    </div>
                                    <p className="text-lg font-bold text-white/90 leading-snug">
                                        {visualFeedbackData.message}
                                    </p>
                                </div>
                            </div>
                            {/* Card 2 — Frame NG */}
                            <div className={`flex-1 rounded-3xl shadow-2xl border-2 overflow-hidden animate-in zoom-in-95 duration-200 ${
                                visualFeedbackSecondary.type === 'success'
                                    ? 'bg-amber-600 border-amber-400'
                                    : 'bg-red-600 border-red-400'
                            }`}>
                                <div className="p-6 text-center">
                                    <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                                        visualFeedbackSecondary.type === 'success'
                                            ? 'bg-amber-500/40'
                                            : 'bg-red-500/40'
                                    }`}>
                                        <i className={`fas ${
                                            visualFeedbackSecondary.type === 'success'
                                                ? 'fa-exclamation-triangle'
                                                : 'fa-circle-exclamation'
                                        } text-4xl text-white`}></i>
                                    </div>
                                    <p className="text-lg font-bold text-white/90 leading-snug">
                                        {visualFeedbackSecondary.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}

window.VoiceTab = VoiceTab;
