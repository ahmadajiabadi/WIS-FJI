window.VoiceFeedback = (function() {
    let audioCtx = null;
    let ttsPrimed = false;
    let voicesLoaded = false;
    let pendingVoices = [];
    let ttsKeepAliveId = null;
    let ttsSpeaking = false;

    // ---------- AudioContext (for beeps) ----------

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    async function playBeep(frequency, duration, type = 'sine') {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            console.error("Web Audio API error:", e);
        }
    }

    // ---------- Audio Warmup (fix mobile suspended AudioContext) ----------

    async function warmupAudio() {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
            const silentBuf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = silentBuf;
            const gain = ctx.createGain();
            gain.gain.value = 0;
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start();
        } catch (e) {
            console.warn("Audio warmup failed:", e);
        }
    }

    // ---------- Voice loading (fix empty voices on mobile) ----------

    function ensureVoicesLoaded() {
        if (voicesLoaded) return;
        const synth = window.speechSynthesis;
        if (!synth) return;
        const voices = synth.getVoices();
        if (voices.length > 0) {
            voicesLoaded = true;
            pendingVoices = voices;
            return;
        }
        synth.onvoiceschanged = () => {
            voicesLoaded = true;
            pendingVoices = synth.getVoices();
        };
    }

    // ---------- TTS Prime (fix silent SpeechSynthesis on mobile) ----------

    function primeTTS() {
        try {
            const synth = window.speechSynthesis;
            if (!synth) return;
            ensureVoicesLoaded();
            synth.cancel();
            const dummy = new SpeechSynthesisUtterance(' ');
            dummy.volume = 0.01;
            dummy.rate = 1;
            dummy.pitch = 1;
            synth.speak(dummy);
            ttsPrimed = true;
        } catch (e) {
            console.warn("TTS prime failed:", e);
        }
    }

    // ---------- TTS Keepalive (Chrome Android kills speech after ~10s idle) ----------

    function startTTSKeepAlive() {
        stopTTSKeepAlive();
        scheduleKeepAlive();
    }

    let keepAliveTimer = null;
    function scheduleKeepAlive() {
        if (keepAliveTimer) clearTimeout(keepAliveTimer);
        keepAliveTimer = setTimeout(() => {
            const synth = window.speechSynthesis;
            if (!synth || synth.speaking || !ttsPrimed || ttsSpeaking) {
                scheduleKeepAlive();
                return;
            }
            synth.cancel();
            const ping = new SpeechSynthesisUtterance(' ');
            ping.volume = 0.001;
            ping.rate = 1;
            ping.pitch = 1;
            synth.speak(ping);
            scheduleKeepAlive();
        }, 25000);
    }

    function stopTTSKeepAlive() {
        if (ttsKeepAliveId) {
            clearInterval(ttsKeepAliveId);
            ttsKeepAliveId = null;
        }
        if (keepAliveTimer) {
            clearTimeout(keepAliveTimer);
            keepAliveTimer = null;
        }
    }

    function stopTTSKeepAlive() {
        if (ttsKeepAliveId) {
            clearInterval(ttsKeepAliveId);
            ttsKeepAliveId = null;
        }
    }

    // ---------- Public API ----------

    return {
        playBeep,
        playPointNgBeep: () => {
            playBeep(880, 0.06);
            setTimeout(() => playBeep(1046, 0.06), 70);
        },
        playNgFrameBeep: () => {
            playBeep(523, 0.12, 'triangle');
            setTimeout(() => playBeep(349, 0.15, 'triangle'), 80);
        },
        playOkBeep: () => {
            playBeep(523, 0.08);
            setTimeout(() => playBeep(659, 0.08), 80);
            setTimeout(() => playBeep(784, 0.12), 160);
        },
        playScrapBeep: () => {
            playBeep(440, 0.2, 'sawtooth');
        },

        warmupAudio,
        primeTTS,
        startTTSKeepAlive,
        stopTTSKeepAlive,

        speakFeedback: (text, enabled = true) => {
            if (!enabled || !text) return;
            try {
                const synth = window.speechSynthesis;
                if (!synth) return;
                ensureVoicesLoaded();
                // Pause keepalive while speaking to avoid interference
                stopTTSKeepAlive();
                synth.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'id-ID';
                utterance.pitch = 1.15;
                utterance.rate = 1.5;
                const foundVoice = pendingVoices.find(
                    v => v.lang.includes('id') || v.name.toLowerCase().includes('indonesia')
                );
                if (foundVoice) utterance.voice = foundVoice;
                ttsSpeaking = true;
                utterance.onend = () => {
                    ttsSpeaking = false;
                    startTTSKeepAlive();
                };
                utterance.onerror = () => {
                    ttsSpeaking = false;
                    startTTSKeepAlive();
                };
                synth.speak(utterance);
                // Fallback: restart keepalive if onend never fires
                setTimeout(() => {
                    if (ttsSpeaking) {
                        ttsSpeaking = false;
                        startTTSKeepAlive();
                    }
                }, 5000);
            } catch (e) {
                console.error("TTS Speech Synthesis failed:", e);
                ttsSpeaking = false;
                startTTSKeepAlive();
            }
        },

        triggerSpeechBounce: (containerEl) => {
            if (!containerEl) return;
            containerEl.classList.add('speech-active');
            setTimeout(() => containerEl.classList.remove('speech-active'), 1000);
        },
    };
})();
