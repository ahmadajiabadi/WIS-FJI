window.VoiceRecognitionNative = (function() {
    let activeConfig = null;
    let userWantsListening = false;
    let soundGen = 0;
    let pendingRestart = null;
    let listeners = [];

    // Stub callbacks for compatibility with VoiceTab.js
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

    function attachAndStart(gen, config) {
        if (gen !== soundGen || !userWantsListening) return;

        var sr = getSpeechRecognition();
        if (!sr) { stop(); return; }

        removeAllListeners();

        var configRef = config;

        // Listen for partial results — treat as final transcript
        var partialHandler = function(event) {
            if (gen !== soundGen || !userWantsListening) return;
            var text = (event.matches && event.matches[0]) || '';
            if (text && configRef.onTranscript) {
                configRef.onTranscript(text, true);
            }
        };
        sr.addListener('partialResults', partialHandler).then(function(l) { listeners.push(l); });

        // Listen for listening state changes
        var stateHandler = function(event) {
            if (gen !== soundGen || !userWantsListening) return;
            var state = event.state || '';
            if (state === 'started' || event.status === 'started') {
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('listening');
            } else if (state === 'stopped' || event.status === 'stopped') {
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('idle');
                // Auto-restart for continuous mode
                if (userWantsListening && gen === soundGen) {
                    scheduleRestart(gen, configRef);
                }
            }
        };
        sr.addListener('listeningState', stateHandler).then(function(l) { listeners.push(l); });

        // Listen for errors
        var errorHandler = function(event) {
            if (gen !== soundGen) return;
            if (configRef && configRef.onStatusChange) configRef.onStatusChange('error');

            if (event.code === 'notAllowed') {
                userWantsListening = false;
                if (configRef && configRef.onStatusChange) configRef.onStatusChange('idle');
                return;
            }

            if (userWantsListening && gen === soundGen && configRef) {
                scheduleRestart(gen, configRef);
            }
        };
        sr.addListener('error', errorHandler).then(function(l) { listeners.push(l); });

        // Ready for next session
        var readyHandler = function() {
            if (gen !== soundGen || !userWantsListening) return;
            scheduleRestart(gen, configRef);
        };
        sr.addListener('readyForNextSession', readyHandler).then(function(l) { listeners.push(l); });

        // Start the native recognizer
        sr.start({
            language: 'id-ID',
            maxResults: 1,
            partialResults: true,
            popup: false,
        }).catch(function(err) {
            if (gen === soundGen && configRef && configRef.onStatusChange) {
                configRef.onStatusChange('error');
            }
        });
    }

    function scheduleRestart(gen, config) {
        if (pendingRestart) clearTimeout(pendingRestart);
        pendingRestart = setTimeout(function() {
            pendingRestart = null;
            if (gen === soundGen && userWantsListening && config) {
                attachAndStart(gen, config);
            }
        }, 100);
    }

    function start(config) {
        activeConfig = config;
        if (userWantsListening) return;

        var gen = ++soundGen;
        userWantsListening = true;

        var sr = getSpeechRecognition();
        if (!sr) { stop(); return; }

        // Check & request permissions if needed
        sr.checkPermissions().then(function(result) {
            if (gen !== soundGen) return;
            if (result.speechRecognition !== 'granted') {
                sr.requestPermissions().then(function(permResult) {
                    if (gen !== soundGen) return;
                    if (permResult.speechRecognition !== 'granted') {
                        if (config && config.onStatusChange) config.onStatusChange('error');
                        userWantsListening = false;
                        return;
                    }
                    attachAndStart(gen, config);
                });
            } else {
                attachAndStart(gen, config);
            }
        }).catch(function() {
            // Fallback: try to start anyway
            if (gen === soundGen) attachAndStart(gen, config);
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

        // Stub for VoiceTab.js compatibility
        onZombie: function(cb) { zombieCallbacks.push(cb); },
        clearZombieCallbacks: function() { zombieCallbacks = []; },
        setZombieStatusCallback: function() {},
        getZombieStatusCallback: function() { return null; },
    };
})();
