window.VoiceRecognitionNative = (function() {
    let activeConfig = null;
    let userWantsListening = false;
    let soundGen = 0;
    let pendingRestart = null;
    let listeners = [];
    let zombieCallbacks = [];

    function removeAllListeners() {
        listeners.forEach(function(l) {
            try { if (l.remove) l.remove(); } catch(e) {}
        });
        listeners = [];
    }

    function getSpeechRecognition() {
        try {
            return Capacitor.Plugins.SpeechRecognition;
        } catch(e) {
            return null;
        }
    }

    function attachAndStart(gen, config, useOnDevice) {
        if (gen !== soundGen || !userWantsListening) return;
        var sr = getSpeechRecognition();
        if (!sr) { stop(); return; }
        removeAllListeners();
        var configRef = config;

        var partialHandler = function(event) {
            if (gen !== soundGen || !userWantsListening) return;
            var text = (event.matches && event.matches[0]) || '';
            if (text && configRef.onTranscript) {
                configRef.onTranscript(text, true);
            }
        };
        sr.addListener('partialResults', partialHandler).then(function(l) { listeners.push(l); });

        var stateHandler = function(event) {
            if (gen !== soundGen || !userWantsListening) return;
            var state = event.state || '';
            if (state === 'started' || event.status === 'started') {
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('listening');
            } else if (state === 'stopped' || event.status === 'stopped') {
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('idle');
                if (userWantsListening && gen === soundGen) {
                    scheduleRestart(gen, configRef, useOnDevice);
                }
            }
        };
        sr.addListener('listeningState', stateHandler).then(function(l) { listeners.push(l); });

        var errorHandler = function(event) {
            if (gen !== soundGen) return;
            if (configRef && configRef.onStatusChange) configRef.onStatusChange('error');
            if (event.code === 'notAllowed') {
                userWantsListening = false;
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('idle');
                return;
            }
            if (userWantsListening && gen === soundGen && configRef) {
                scheduleRestart(gen, configRef, useOnDevice);
            }
        };
        sr.addListener('error', errorHandler).then(function(l) { listeners.push(l); });

        var readyHandler = function() {
            if (gen !== soundGen || !userWantsListening) return;
            scheduleRestart(gen, configRef, useOnDevice);
        };
        sr.addListener('readyForNextSession', readyHandler).then(function(l) { listeners.push(l); });

        sr.start({
            language: 'id-ID',
            maxResults: 1,
            partialResults: true,
            popup: false,
            useOnDeviceRecognition: !!useOnDevice,
        }).catch(function(err) {
            if (gen === soundGen && configRef && configRef.onStatusChange) {
                configRef.onStatusChange('error');
            }
        });
    }

    function scheduleRestart(gen, config, useOnDevice) {
        if (pendingRestart) clearTimeout(pendingRestart);
        pendingRestart = setTimeout(function() {
            pendingRestart = null;
            if (gen === soundGen && userWantsListening && config) {
                attachAndStart(gen, config, useOnDevice);
            }
        }, 100);
    }

    function ensureMicPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.resolve(false);
        }
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
            stream.getTracks().forEach(function(t) { t.stop(); });
            return true;
        }).catch(function() {
            return false;
        });
    }

    function start(config) {
        activeConfig = config;
        if (userWantsListening) return;

        var gen = ++soundGen;
        userWantsListening = true;

        var sr = getSpeechRecognition();
        if (!sr) { stop(); return; }

        // First: get mic permission via getUserMedia
        ensureMicPermission().then(function(granted) {
            if (gen !== soundGen) return;
            if (!granted) {
                if (config && config.onStatusChange) config.onStatusChange('error');
                userWantsListening = false;
                return;
            }

            // Check if speech recognition is available
            sr.available().then(function(availResult) {
                if (gen !== soundGen) return;
                if (!availResult.available) {
                    if (config && config.onDiagnostic) {
                        config.onDiagnostic('Speech Recognition tidak tersedia di device ini. Install Google Speech Services dari Play Store, atau gunakan mode Rekam.');
                    }
                    if (config && config.onStatusChange) config.onStatusChange('error');
                    userWantsListening = false;
                    return;
                }

                // Try on-device recognition first (Android 13+, no Google Services needed)
                attachAndStart(gen, config, true);
            }).catch(function() {
                // Fallback: try anyway
                if (gen === soundGen) attachAndStart(gen, config, false);
            });
        });
    }

    function stop() {
        soundGen++;
        userWantsListening = false;
        if (pendingRestart) { clearTimeout(pendingRestart); pendingRestart = null; }
        removeAllListeners();
        var sr = getSpeechRecognition();
        if (sr) { try { sr.stop(); } catch(e) {} }
        if (activeConfig && activeConfig.onStatusChange) activeConfig.onStatusChange('idle');
        activeConfig = null;
    }

    return {
        start: start,
        stop: stop,
        restart: function() {
            var cfg = activeConfig;
            stop();
            setTimeout(function() { if (cfg) start(cfg); }, 250);
        },
        getDevices: function() {
            return Promise.resolve([
                { deviceId: 'default', label: 'Default Microphone', kind: 'audioinput' }
            ]);
        },
        setDevice: function() {},
        get isListening() { return userWantsListening; },

        onZombie: function(cb) { zombieCallbacks.push(cb); },
        clearZombieCallbacks: function() { zombieCallbacks = []; },
        setZombieStatusCallback: function() {},
        getZombieStatusCallback: function() { return null; },
    };
})();
