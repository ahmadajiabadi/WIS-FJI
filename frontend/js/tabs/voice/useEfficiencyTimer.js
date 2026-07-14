function useEfficiencyTimer(api_url) {
    const savedSessionId = (() => { try { return localStorage.getItem('qc_efficiency_session_id'); } catch(e) { return null; } })();
    const savedSessionStart = (() => { try { const d = localStorage.getItem('qc_efficiency_session_start'); return d ? Number(d) : null; } catch(e) { return null; } })();
    const savedTimerStart = (() => { try { const d = localStorage.getItem('qc_efficiency_timer_start'); return d ? Number(d) : null; } catch(e) { return null; } })();

    const [efficiencyTimerRunning, setEfficiencyTimerRunning] = React.useState(!!savedSessionId);
    const [efficiencyElapsed, setEfficiencyElapsed] = React.useState(0);
    const savedEffItems = (() => { try { const d = localStorage.getItem('qc_efficiency_items'); return d ? JSON.parse(d) : []; } catch(e) { return []; } })();
    const savedTaktTime = (() => { try { const d = localStorage.getItem('qc_takt_time'); return d ? parseInt(d) : 60; } catch(e) { return 60; } })();
    const [efficiencyItems, _setEfficiencyItems] = React.useState(savedEffItems);
    const [currentTaktTime, setCurrentTaktTime] = React.useState(savedTaktTime);
    const [isTimerPaused, _setIsTimerPaused] = React.useState(false);
    const [manualTriggerReset, setManualTriggerReset] = React.useState(false);
    const efficiencyItemsRef = React.useRef(savedEffItems);
    const isTimerPausedRef = React.useRef(false);

    const setEfficiencyItems = (val) => {
        const next = typeof val === 'function' ? val(efficiencyItemsRef.current) : val;
        _setEfficiencyItems(next);
        efficiencyItemsRef.current = next;
        try { localStorage.setItem('qc_efficiency_items', JSON.stringify(next)); } catch(e) {}
    };

    const setIsTimerPaused = (val) => {
        const next = typeof val === 'function' ? val(isTimerPausedRef.current) : val;
        _setIsTimerPaused(next);
        isTimerPausedRef.current = next;
    };

    const efficiencyTimerStartRef = React.useRef(savedTimerStart);
    const efficiencyTimerIntervalRef = React.useRef(null);
    const currentTaktTimeRef = React.useRef(savedTaktTime);
    const breaksListRef = React.useRef([]);
    const efficiencyTimerRunningRef = React.useRef(!!savedSessionId);
    const sessionIdRef = React.useRef(savedSessionId);
    const sessionStartRef = React.useRef(savedSessionStart);

    const loadBreaksList = React.useCallback(async () => {
        try {
            const res = await fetch(`${api_url}/api/settings/timer-breaks`);
            const result = await res.json();
            if (result.status === 'success') breaksListRef.current = result.data;
        } catch (e) {
            console.error("Failed to load breaks:", e);
        }
    }, [api_url]);

    const checkIsBreakTime = React.useCallback(() => {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayCol = dayNames[now.getDay()];
        for (const b of breaksListRef.current) {
            if (!b.active) continue;
            if (!b[todayCol]) continue;
            const startParts = b.start_time.split(':');
            const endParts = b.end_time.split(':');
            const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
            const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return true;
        }
        return false;
    }, []);

    const setTaktTime = (val) => {
        const v = parseInt(val) || 60;
        setCurrentTaktTime(v);
        currentTaktTimeRef.current = v;
        try { localStorage.setItem('qc_takt_time', String(v)); } catch(e) {}
    };

    const recordEfficiencyItem = React.useCallback((judgment, side) => {
        const now = Date.now();
        const startTime = efficiencyTimerStartRef.current;
        if (!startTime) return;
        const durationMs = now - startTime;
        const durationSec = durationMs / 1000;
        const takt = currentTaktTimeRef.current;
        const eff = Math.min(100, Math.round((takt / Math.max(durationSec, 1)) * 100));
        const item = { duration: durationSec, taktTime: takt, efficiency: eff, timestamp: now, side, judgment };
        setEfficiencyItems(prev => [...prev, item]);
        if (window.__onCheckRecorded) window.__onCheckRecorded(startTime, now, durationSec, takt, eff, judgment, sessionIdRef.current, side);
    }, []);

    const undoLastEfficiency = React.useCallback(async () => {
        const items = [...efficiencyItemsRef.current];
        if (items.length === 0) return null;
        
        const lastItem = items[items.length - 1];
        const newItems = items.slice(0, -1);
        setEfficiencyItems(newItems);
        efficiencyItemsRef.current = newItems;
        try { localStorage.setItem('qc_efficiency_items', JSON.stringify(newItems)); } catch(e) {}

        // Rollback timer start to the start time of the deleted check
        const startTime = lastItem.timestamp - lastItem.duration * 1000;
        efficiencyTimerStartRef.current = startTime;
        try { localStorage.setItem('qc_efficiency_timer_start', String(startTime)); } catch(e) {}
        setEfficiencyElapsed((Date.now() - startTime) / 1000);

        // Delete from database using sessionIdRef.current
        if (sessionIdRef.current) {
            try {
                const res = await fetch(`${api_url}/api/efficiency/session/${sessionIdRef.current}/last`, { method: 'DELETE' });
                const result = await res.json();
                console.log("Database undo status:", result);
            } catch(e) {
                console.error("Failed to delete last check from database:", e);
            }
        }
        return lastItem;
    }, []);

    const resetEfficiencyTimer = React.useCallback(() => {
        setEfficiencyElapsed(0);
        const t = Date.now();
        efficiencyTimerStartRef.current = t;
        try { localStorage.setItem('qc_efficiency_timer_start', String(t)); } catch(e) {}
    }, []);

    React.useEffect(() => {
        currentTaktTimeRef.current = currentTaktTime;
    }, [currentTaktTime]);

    const genId = () => { try { return crypto.randomUUID(); } catch(e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } };

    const startEfficiencyTimer = React.useCallback(async () => {
        if (efficiencyTimerRunningRef.current) return;
        await loadBreaksList();
        let sId = sessionIdRef.current;
        if (!sId) {
            sId = genId();
            sessionIdRef.current = sId;
            try { localStorage.setItem('qc_efficiency_session_id', sId); } catch(e) {}
        }
        let sStart = sessionStartRef.current;
        if (!sStart) {
            sStart = Date.now();
            sessionStartRef.current = sStart;
            try { localStorage.setItem('qc_efficiency_session_start', String(sStart)); } catch(e) {}
        }
        let tStart = efficiencyTimerStartRef.current;
        if (!tStart) {
            tStart = Date.now();
            efficiencyTimerStartRef.current = tStart;
            try { localStorage.setItem('qc_efficiency_timer_start', String(tStart)); } catch(e) {}
        }
        setEfficiencyElapsed(0);
        setEfficiencyTimerRunning(true);
        efficiencyTimerRunningRef.current = true;

        if (efficiencyTimerIntervalRef.current) clearInterval(efficiencyTimerIntervalRef.current);
        efficiencyTimerIntervalRef.current = setInterval(() => {
            if (!efficiencyTimerStartRef.current) return;
            setEfficiencyElapsed((Date.now() - efficiencyTimerStartRef.current) / 1000 + Math.random() * 1e-8);
        }, 200);
    }, [loadBreaksList]);

    const pauseStartTimeRef = React.useRef(null);

    const stopEfficiencyTimer = React.useCallback(() => {
        if (efficiencyTimerIntervalRef.current) {
            clearInterval(efficiencyTimerIntervalRef.current);
            efficiencyTimerIntervalRef.current = null;
        }
        setEfficiencyTimerRunning(false);
        efficiencyTimerRunningRef.current = false;
        setIsTimerPaused(false);
        setEfficiencyElapsed(0);
        efficiencyTimerStartRef.current = null;
        pauseStartTimeRef.current = null;
        sessionIdRef.current = null;
        sessionStartRef.current = null;
        try {
            localStorage.removeItem('qc_efficiency_session_id');
            localStorage.removeItem('qc_efficiency_session_start');
            localStorage.removeItem('qc_efficiency_timer_start');
            localStorage.removeItem('qc_efficiency_items');
            localStorage.removeItem('qc_takt_time');
        } catch(e) {}
    }, []);

    const pauseEfficiencyTimer = React.useCallback(() => {
        if (!efficiencyTimerRunningRef.current || isTimerPausedRef.current) return;
        if (efficiencyTimerIntervalRef.current) {
            clearInterval(efficiencyTimerIntervalRef.current);
            efficiencyTimerIntervalRef.current = null;
        }
        pauseStartTimeRef.current = Date.now();
        setIsTimerPaused(true);
    }, []);

    const resumeEfficiencyTimer = React.useCallback(() => {
        if (!efficiencyTimerRunningRef.current || !isTimerPausedRef.current) return;
        if (pauseStartTimeRef.current && efficiencyTimerStartRef.current) {
            const pauseDuration = Date.now() - pauseStartTimeRef.current;
            efficiencyTimerStartRef.current += pauseDuration;
        }
        pauseStartTimeRef.current = null;
        setIsTimerPaused(false);
        if (efficiencyTimerIntervalRef.current) clearInterval(efficiencyTimerIntervalRef.current);
        efficiencyTimerIntervalRef.current = setInterval(() => {
            if (!efficiencyTimerStartRef.current) return;
            setEfficiencyElapsed((Date.now() - efficiencyTimerStartRef.current) / 1000 + Math.random() * 1e-8);
        }, 200);
    }, []);

    const handleOkEfficiency = React.useCallback((side) => {
        if (!efficiencyTimerRunningRef.current || !efficiencyTimerStartRef.current || isTimerPausedRef.current) return;
        recordEfficiencyItem('OK', side);
        resetEfficiencyTimer();
    }, [recordEfficiencyItem, resetEfficiencyTimer]);

    const handleNgFrameEfficiency = React.useCallback((side) => {
        if (!efficiencyTimerRunningRef.current || !efficiencyTimerStartRef.current || isTimerPausedRef.current) return;
        recordEfficiencyItem('NG', side);
        resetEfficiencyTimer();
    }, [recordEfficiencyItem, resetEfficiencyTimer]);

    const handleManualOkEfficiency = React.useCallback((side) => {
        if (!manualTriggerReset || !efficiencyTimerRunningRef.current || !efficiencyTimerStartRef.current || isTimerPausedRef.current) return;
        recordEfficiencyItem('OK', side);
        resetEfficiencyTimer();
    }, [manualTriggerReset, recordEfficiencyItem, resetEfficiencyTimer]);

    const handleManualNgFrameEfficiency = React.useCallback((side) => {
        if (!manualTriggerReset || !efficiencyTimerRunningRef.current || !efficiencyTimerStartRef.current || isTimerPausedRef.current) return;
        recordEfficiencyItem('NG', side);
        resetEfficiencyTimer();
    }, [manualTriggerReset, recordEfficiencyItem, resetEfficiencyTimer]);

    const forceRecordEfficiency = React.useCallback((judgment, side) => {
        if (!efficiencyTimerRunningRef.current) {
            startEfficiencyTimer().then(() => {
                recordEfficiencyItem(judgment, side);
                resetEfficiencyTimer();
            });
            return;
        }
        if (!efficiencyTimerStartRef.current) return;
        recordEfficiencyItem(judgment, side);
        resetEfficiencyTimer();
    }, [recordEfficiencyItem, resetEfficiencyTimer, startEfficiencyTimer]);

    React.useEffect(() => {
        if (efficiencyTimerRunningRef.current && efficiencyTimerStartRef.current) {
            loadBreaksList();
            if (efficiencyTimerIntervalRef.current) clearInterval(efficiencyTimerIntervalRef.current);
            efficiencyTimerIntervalRef.current = setInterval(() => {
                if (!efficiencyTimerStartRef.current) return;
                setEfficiencyElapsed((Date.now() - efficiencyTimerStartRef.current) / 1000 + Math.random() * 1e-8);
            }, 200);
        }
        return () => {
            if (efficiencyTimerIntervalRef.current) clearInterval(efficiencyTimerIntervalRef.current);
        };
    }, [loadBreaksList]);

    return {
        efficiencyTimerRunning,
        efficiencyElapsed,
        efficiencyItems,
        currentTaktTime,
        isTimerPaused,
        manualTriggerReset,
        efficiencyItemsRef,
        efficiencyTimerRunningRef,
        efficiencyTimerStartRef,
        currentTaktTimeRef,
        isTimerPausedRef,
        sessionIdRef,
        sessionStartRef,

        setEfficiencyItems,
        setIsTimerPaused,
        setEfficiencyTimerRunning,
        setEfficiencyElapsed,
        setCurrentTaktTime,
        setManualTriggerReset,

        breaksListRef,
        loadBreaksList,
        checkIsBreakTime,
        setTaktTime,
        recordEfficiencyItem,
        resetEfficiencyTimer,
        startEfficiencyTimer,
        stopEfficiencyTimer,
        pauseEfficiencyTimer,
        resumeEfficiencyTimer,
        handleOkEfficiency,
        handleNgFrameEfficiency,
        handleManualOkEfficiency,
        handleManualNgFrameEfficiency,
        forceRecordEfficiency,
        undoLastEfficiency,
    };
}
window.useEfficiencyTimer = useEfficiencyTimer;
