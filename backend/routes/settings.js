const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

// 1. GET all voice guides
router.get('/settings/voice-guides', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM voice_guides ORDER BY code ASC, id ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. POST create voice guide
router.post('/settings/voice-guides', async (req, res) => {
    try {
        const pool = getPool();
        const { code, name, keywords, feedback_text } = req.body;
        if (!code || !name || !keywords) {
            return res.status(400).json({ status: 'error', message: 'code, name, keywords wajib diisi' });
        }
        const [result] = await pool.query('INSERT INTO voice_guides (code, name, keywords, feedback_text) VALUES (?, ?, ?, ?)', [code.toUpperCase(), name, keywords, feedback_text || '']);
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. PUT update voice guide
router.put('/settings/voice-guides/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { code, name, keywords, feedback_text } = req.body;
        await pool.query('UPDATE voice_guides SET code = ?, name = ?, keywords = ?, feedback_text = ? WHERE id = ?', [code.toUpperCase(), name, keywords, feedback_text || '', req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 4. DELETE voice guide
router.delete('/settings/voice-guides/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM voice_guides WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 5. GET problem list with frequency (from check_sheet_details)
router.get('/settings/problem-list-with-frequency', async (req, res) => {
    try {
        const pool = getPool();
        const partNumber = req.query.part_number || null;

        const [guides] = await pool.query('SELECT * FROM voice_guides ORDER BY code ASC, id ASC');

        let partFrequency = {};
        let globalFrequency = {};

        if (partNumber) {
            const [partRows] = await pool.query(
                `SELECT problem, COUNT(*) as freq FROM check_sheet_details d
                 JOIN check_sheets s ON d.check_sheet_id = s.id
                 WHERE s.part_number = ? AND problem IS NOT NULL AND problem != '-' AND problem != ''
                 GROUP BY problem ORDER BY freq DESC`,
                [partNumber]
            );
            partRows.forEach(r => { partFrequency[r.problem] = r.freq; });
        }

        const [globalRows] = await pool.query(
            `SELECT problem, COUNT(*) as freq FROM check_sheet_details
             WHERE problem IS NOT NULL AND problem != '-' AND problem != ''
             GROUP BY problem ORDER BY freq DESC`
        );
        globalRows.forEach(r => { globalFrequency[r.problem] = r.freq; });

        const data = guides.map(g => {
            const pf = partFrequency[g.name] || 0;
            const gf = globalFrequency[g.name] || 0;
            return {
                ...g,
                part_frequency: pf,
                global_frequency: gf,
                total_frequency: pf + gf
            };
        });

        data.sort((a, b) => b.total_frequency - a.total_frequency);

        res.json({ status: 'success', data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ========== VOICE COMMANDS (Quantity: OK, NG Frame, Scrap, Undo) ==========

// 5. GET all voice commands grouped by type
router.get('/settings/voice-commands', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM voice_commands ORDER BY command_type ASC, id ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 6. POST create voice command keyword
router.post('/settings/voice-commands', async (req, res) => {
    try {
        const pool = getPool();
        const { command_type, keyword, feedback_text } = req.body;
        if (!command_type || !keyword) {
            return res.status(400).json({ status: 'error', message: 'command_type dan keyword wajib diisi' });
        }
        const validTypes = ['ok', 'ng_frame', 'finish', 'scrap', 'undo', 'mute', 'unmute', 'batal_cycle'];
        if (!validTypes.includes(command_type)) {
            return res.status(400).json({ status: 'error', message: 'command_type tidak valid' });
        }
        const [result] = await pool.query('INSERT INTO voice_commands (command_type, keyword, feedback_text) VALUES (?, ?, ?)', [command_type, keyword.toLowerCase().trim(), feedback_text || '']);
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 7. DELETE voice command keyword
router.delete('/settings/voice-commands/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM voice_commands WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ========== TIMER BREAKS (Efficiency Timer Schedule) ==========

// 8. GET all timer breaks
router.get('/settings/timer-breaks', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM timer_breaks ORDER BY start_time ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 9. POST create timer break
router.post('/settings/timer-breaks', async (req, res) => {
    try {
        const pool = getPool();
        const { break_label, start_time, end_time, active, monday, tuesday, wednesday, thursday, friday, saturday, sunday } = req.body;
        if (!break_label || !start_time || !end_time) {
            return res.status(400).json({ status: 'error', message: 'break_label, start_time, end_time wajib diisi' });
        }
        const [result] = await pool.query(
            'INSERT INTO timer_breaks (break_label, start_time, end_time, active, monday, tuesday, wednesday, thursday, friday, saturday, sunday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                break_label, start_time, end_time,
                active !== undefined ? (active ? 1 : 0) : 1,
                monday !== undefined ? (monday ? 1 : 0) : 1,
                tuesday !== undefined ? (tuesday ? 1 : 0) : 1,
                wednesday !== undefined ? (wednesday ? 1 : 0) : 1,
                thursday !== undefined ? (thursday ? 1 : 0) : 1,
                friday !== undefined ? (friday ? 1 : 0) : 1,
                saturday !== undefined ? (saturday ? 1 : 0) : 0,
                sunday !== undefined ? (sunday ? 1 : 0) : 0,
            ]
        );
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 10. PUT update timer break
router.put('/settings/timer-breaks/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { break_label, start_time, end_time, active, monday, tuesday, wednesday, thursday, friday, saturday, sunday } = req.body;
        await pool.query(
            'UPDATE timer_breaks SET break_label = ?, start_time = ?, end_time = ?, active = ?, monday = ?, tuesday = ?, wednesday = ?, thursday = ?, friday = ?, saturday = ?, sunday = ? WHERE id = ?',
            [
                break_label, start_time, end_time,
                active !== undefined ? (active ? 1 : 0) : 1,
                monday !== undefined ? (monday ? 1 : 0) : 1,
                tuesday !== undefined ? (tuesday ? 1 : 0) : 1,
                wednesday !== undefined ? (wednesday ? 1 : 0) : 1,
                thursday !== undefined ? (thursday ? 1 : 0) : 1,
                friday !== undefined ? (friday ? 1 : 0) : 1,
                saturday !== undefined ? (saturday ? 1 : 0) : 0,
                sunday !== undefined ? (sunday ? 1 : 0) : 0,
                req.params.id
            ]
        );
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 11. DELETE timer break
router.delete('/settings/timer-breaks/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM timer_breaks WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
