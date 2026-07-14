const express = require('express');
const router = express.Router();

router.post('/ai/chat', async (req, res) => {
    try {
        const { message, history, context } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ status: 'error', message: 'API Key Gemini tidak ditemukan di .env' });
        }

        const contents = [];

        // System Instruction defining the AI persona and injecting the dashboard data context
        const systemInstruction = `
            Anda adalah Asisten Analisis QC Digital & Data Scientist Mekanik Senior (QC Scanner Pro).
            Tugas Anda adalah membantu pimpinan (management) dan engineers menganalisis performa mesin (Line/Pos), part bermasalah, dan pola defect (Pareto) berdasarkan data nyata.
            
            Kamus Kode Defect Resmi (Official Defect Codes Dictionary) di Pabrik kami:
            - A: Welding Undercut (Memotong Part)
            - B: Welding Over Lap (Tembus/Berlebih)
            - C: Welding Pit/Blow Hole (Keropos)
            - D: Welding Hole (Berlubang)
            - E: Welding Burn-through (Meleleh)
            - F: Welding Bead skip (Welding Putus)
            - G: Welding Bead width (Pergeseran Welding)
            - H: Dimensi Spot bolt Tidak STD
            - I: Spot Bolt Pecah/Retak
            - J: Spot Bolt Ada GAP
            - K: Spot Bolt Ada Burry
            - L: Part Tidak Terpasang
            - M: Others (Defect lainnya)

            Berikut adalah data Dashboard / Part Analytics terfilter yang sedang aktif di layar user saat ini:
            ${JSON.stringify(context, null, 2)}
            
            PANDUAN VISUALISASI CHAT (SANGAT PENTING):
            Anda dapat menyematkan grafik interaktif atau visualisasi langsung di dalam balon chat dengan mengetikkan tag kustom ini pada BARIS BARU terpisah (jangan digabung dengan teks lain):
            - Tulis '[CHART: PARETO]' di baris baru untuk merender diagram batang Pareto Defect interaktif yang real-time.
            - Tulis '[CHART: TREND]' di baris baru untuk merender diagram garis Tren NG Ratio harian interaktif.
            - Tulis '[HOTSPOT: X]' (misalnya '[HOTSPOT: 23]') di baris baru jika Anda sedang menyarankan perbaikan pada titik check point nomor X tertentu.
            Gunakan tag ini setiap kali Anda menganalisis Pareto, Tren, atau Hotspot tertentu agar respon Anda sangat visual, premium, dan informatif!

            ATURAN KOMUNIKASI & ANALISIS:
            1. Jawablah menggunakan Bahasa Indonesia yang sangat profesional, taktis, ramah, dan mudah dipahami oleh pimpinan perusahaan.
            2. Gunakan format Markdown yang rapi (bolding, bullet points, numbering, tables jika relevan) agar respon ter-render dengan sangat premium.
            3. Berikan saran perbaikan konkret/actionable dan penetapan skala prioritas perbaikan mesin (Line/Pos) untuk menekan angka defect.
            4. Hubungkan rekomendasi Anda dengan data angka (misal rasio defect %, jumlah NG, target yield) yang ada pada context di atas agar analisis konkret dan presisi.
            5. Jaga jawaban tetap padat, informatif, dan langsung ke akar permasalahan (hindari basa-basi berlebih).
        `;

        // Construct history if available
        if (history && history.length > 0) {
            history.forEach(h => {
                contents.push({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.content || h.text }]
                });
            });
        }

        // Add user prompt
        contents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        // Models to try in order of preference
        const models = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-pro'];
        let responseText = null;
        let modelUsed = null;
        let lastError = null;

        for (const model of models) {
            try {
                const payload = {
                    contents: contents,
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    }
                };

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    responseText = result.candidates[0].content.parts[0].text;
                    modelUsed = model;
                    break;
                } else if (result.error) {
                    lastError = result.error.message;
                }
            } catch (err) {
                lastError = err.message;
            }
        }

        if (responseText) {
            return res.json({
                status: 'success',
                reply: responseText,
                modelUsed: modelUsed
            });
        } else {
            return res.status(500).json({ status: 'error', message: lastError || 'Gagal menghubungi Gemini API.' });
        }

    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});
module.exports = router;
