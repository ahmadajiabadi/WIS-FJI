window.VoiceRecognition = (function() {
    // Jika Capacitor native speech recognition tersedia, gunakan native
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.SpeechRecognition && window.VoiceRecognitionNative) {
        return window.VoiceRecognitionNative;
    }

    let recognizer = null;
    let restartTimeoutId = null;
    let restartInterval = null;
    let isListening = false;
    let activeConfig = null;
    let selectedDeviceId = null;
    let audioStream = null;
    let zombieCallbacks = [];
    let lastResultTime = 0;
    let watchdogInterval = null;
    let recognizerGen = 0;
    let lastStartTime = 0;
    let lastRestartAttempt = 0;

    let zombieStatusCallback = null;
    function onZombie(cb) { zombieCallbacks.push(cb); }
    function clearZombieCallbacks() { zombieCallbacks = []; }
    function setZombieStatusCallback(cb) { zombieStatusCallback = cb; }
    function getZombieStatusCallback() { return zombieStatusCallback; }

    function startWatchdog() {
        stopWatchdog();
        lastResultTime = Date.now();
        watchdogInterval = setInterval(() => {
            if (!isListening) { stopWatchdog(); return; }
            if (Date.now() - lastResultTime > 60000) {
                console.warn('[VOICE] No results for 60s — zombie detected');
                stopWatchdog();
                stopPeriodicRestart();
                isListening = false;
                if (recognizer) {
                    try { recognizer.abort(); } catch (e) {}
                }
                releaseStream();
                zombieCallbacks.forEach(fn => fn());
            }
        }, 5000);
    }

    function stopWatchdog() {
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
    }

    function startPeriodicRestart() {
        stopPeriodicRestart();
        scheduleNextRestart(25 * 60 * 1000);
    }

    function scheduleNextRestart(delay) {
        stopPeriodicRestart();
        restartInterval = setTimeout(() => {
            if (!isListening || !recognizer) { startPeriodicRestart(); return; }
            const config = activeConfig;
            if (!config) { startPeriodicRestart(); return; }
            // Jika user baru bicara (< 5 detik), postpone 30 detik
            if (Date.now() - lastResultTime < 5000) {
                scheduleNextRestart(30 * 1000);
                return;
            }
            console.log('[VOICE] Periodic restart — mencegah Chrome timeout');
            stop();
            setTimeout(() => {
                if (config) start(config);
            }, 250);
        }, delay);
    }

    function stopPeriodicRestart() {
        if (restartInterval) { clearTimeout(restartInterval); restartInterval = null; }
    }

    function releaseStream() {
        if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
    }

    let onDeviceAutoSelected = null;
    function setAutoSelectCallback(cb) { onDeviceAutoSelected = cb; }

    function autoSelectUsbMic(devices) {
        const usbMics = devices.filter(d => {
            const label = (d.label || '').toLowerCase();
            return label.includes('usb') || label.includes('external') || label.includes('lavalier');
        });
        if (usbMics.length > 0 && usbMics[0].deviceId !== selectedDeviceId) {
            selectedDeviceId = usbMics[0].deviceId;
            if (!isListening) releaseStream();
            if (onDeviceAutoSelected) onDeviceAutoSelected(selectedDeviceId, usbMics[0].label);
        }
    }

    function getDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices)
            return Promise.resolve([]);
        return navigator.mediaDevices.enumerateDevices()
            .then(d => d.filter(x => x.kind === 'audioinput'))
            .catch(() => []);
    }

    function setDevice(deviceId) {
        selectedDeviceId = deviceId || null;
        if (selectedDeviceId && !isListening) releaseStream();
        if (onDeviceAutoSelected) onDeviceAutoSelected(selectedDeviceId, '');
    }

    if (navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener('devicechange', () => {
            getDevices().then(d => autoSelectUsbMic(d));
        });
    }

    function primeAudio() {
        releaseStream();
        const constraints = selectedDeviceId
            ? { audio: { deviceId: { exact: selectedDeviceId } } }
            : { audio: true };
        navigator.mediaDevices.getUserMedia(constraints)
            .then(s => {
                s.getTracks().forEach(t => t.stop());
            }).catch(() => {});
    }

    function start(config) {
        activeConfig = config;
        const gen = ++recognizerGen;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (config.onDiagnostic) {
                config.onDiagnostic('Browser/WebView ini tidak memiliki Speech Recognition API (webkitSpeechRecognition).\n\nUntuk mengecek ketersediaan:\n1. Buka Chrome, buka halaman ini\n2. Ketik di console: !!window.webkitSpeechRecognition\n3. Jika hasilnya true, berarti tersedia. Jika false/undefined, tidak tersedia.\n\nSaran:\n- Gunakan Google Chrome (bukan WebView APK)\n- Buka halaman via HTTPS, bukan HTTP\n- Install Google via Play Store');
            } else {
                alert("Maaf, browser Anda tidak mendukung Speech Recognition. Gunakan Google Chrome!");
            }
            return;
        }

        // Hold getUserMedia stream agar green icon tetap menyala (tdk restart)
        primeAudio();

        // Buat instance baru jika belum ada — reuse instance yang sama
        // karena Chrome Android tidak bisa handle banyak SpeechRecognition instance
        if (!recognizer) {
            recognizer = new SpeechRecognition();
            recognizer.continuous = true;
            recognizer.interimResults = false;
            recognizer.lang = 'id-ID';
        }

        const myGen = gen;

        // Re-attach handler setiap kali start() agar myGen selalu sinkron
        recognizer.onstart = () => {
            lastStartTime = Date.now();
            if (restartTimeoutId) { clearTimeout(restartTimeoutId); restartTimeoutId = null; }
            if (!isListening) {
                isListening = true;
                if (activeConfig.onStatusChange) activeConfig.onStatusChange('listening');
            }
            startWatchdog();
            startPeriodicRestart();
        };

        recognizer.onresult = (event) => {
            lastResultTime = Date.now();
            const idx = event.results.length - 1;
            const result = event.results[idx];
            const confidence = result[0].confidence;
            if (confidence < 0.3) return;
            const transcript = result[0].transcript;
            if (activeConfig.onTranscript) {
                activeConfig.onTranscript(transcript, result.isFinal);
            }
        };

        recognizer.onerror = (e) => {
            if (e.error !== 'no-speech') {
                if (activeConfig.onStatusChange) activeConfig.onStatusChange('error');
                if (window.VoiceFeedback)
                    window.VoiceFeedback.playBeep(180, 0.3, 'sawtooth');
                if (e.error === 'not-allowed') {
                    console.warn('[VOICE] Mic permission denied — not retrying');
                    isListening = false;
                    stopWatchdog();
                    stopPeriodicRestart();
                    if (activeConfig && activeConfig.onStatusChange) activeConfig.onStatusChange('idle');
                } else if (isListening) {
                    console.warn('[VOICE] Error detected — immediate restart:', e.error);
                    const cfg = activeConfig;
                    stop();
                    setTimeout(() => { if (cfg) start(cfg); }, 250);
                }
            }
        };

        recognizer.onend = () => {
            if (myGen !== recognizerGen) return;
            if (!isListening || !recognizer) {
                isListening = false;
                stopWatchdog();
                if (activeConfig && activeConfig.onStatusChange) activeConfig.onStatusChange('idle');
                return;
            }

            // Restart guard: prevent double-restart loop (max 1 restart per 1500ms)
            const sinceLastRestart = Date.now() - lastRestartAttempt;
            if (sinceLastRestart < 1500) return;
            lastRestartAttempt = Date.now();

            const msSinceStart = Date.now() - lastStartTime;
            if (msSinceStart > 500) {
                // Legitimate silence timeout — restart immediately (gap minimal)
                try { recognizer.start(); } catch (e) {
                    restartTimeoutId = setTimeout(() => {
                        if (myGen !== recognizerGen) return;
                        if (isListening && recognizer) {
                            try { recognizer.start(); }
                            catch (e2) { if (isListening) start(activeConfig); }
                        }
                    }, 500);
                }
            } else {
                // Chrome bug (<500ms lifespan) — must delay restart
                restartTimeoutId = setTimeout(() => {
                    if (myGen !== recognizerGen) return;
                    if (isListening && recognizer) {
                        try { recognizer.start(); }
                        catch (e) { if (isListening) start(activeConfig); }
                    }
                }, 200);
            }
        };

        isListening = true;
        if (activeConfig.onStatusChange) activeConfig.onStatusChange('listening');
        try { recognizer.start(); } catch (e) {
            console.warn('[VOICE] Failed to start recognizer, creating new:', e);
            try { recognizer.abort(); } catch (ex) {}
            recognizer = null;
            if (isListening) {
                setTimeout(() => { if (isListening) start(activeConfig); }, 300);
            }
        }
    }

    function stop() {
        isListening = false;
        stopWatchdog();
        stopPeriodicRestart();
        if (restartTimeoutId) { clearTimeout(restartTimeoutId); restartTimeoutId = null; }
        // Keep recognizer reference — don't null it out!
        // Chrome Android can't create multiple instances per page session
        if (recognizer) {
            try { recognizer.abort(); } catch (e) {}
        }
        releaseStream();
        if (activeConfig && activeConfig.onStatusChange) activeConfig.onStatusChange('idle');
    }

    function restart() {
        const config = activeConfig;
        if (!config) return;
        stop();
        setTimeout(() => {
            start(config);
        }, 250);
    }

    return {
        start: start,
        stop: stop,
        restart: restart,
        getDevices: getDevices,
        setDevice: setDevice,
        onZombie: onZombie,
        clearZombieCallbacks: clearZombieCallbacks,
        setZombieStatusCallback: setZombieStatusCallback,
        getZombieStatusCallback: getZombieStatusCallback,
        get isListening() { return isListening; },
    };
})();
