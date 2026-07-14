const express = require('express');
const { getPool } = require('../config/db');
const router = express.Router();

// POST /api/linestops/save — create or update
router.post('/linestops/save', async (req, res) => {
    try {
        const pool = getPool();
        const { id, part_number, model, line_pos, date, shift, loss_start, loss_end, category_4m, stop_reason, corrective_action, notes, linked_abnormality_id, created_by } = req.body;

        if (!date || !loss_start || !loss_end) {
            return res.json({ status: 'error', message: 'date, loss_start, loss_end required' });
        }

        // Calculate duration in minutes
        const startMs = new Date(loss_start).getTime();
        const endMs = new Date(loss_end).getTime();
        const durationMin = Math.round((endMs - startMs) / 60000 * 10) / 10;

        if (id) {
            await pool.query(
                `UPDATE line_stops SET part_number=?, model=?, line_pos=?, date=?, shift=?, loss_start=?, loss_end=?, duration_min=?, category_4m=?, stop_reason=?, corrective_action=?, notes=?, linked_abnormality_id=? WHERE id=?`,
                [part_number || '', model || '', line_pos || '', date, shift || '', loss_start, loss_end, durationMin, category_4m || '', stop_reason || '', corrective_action || '', notes || '', linked_abnormality_id || null, id]
            );
            res.json({ status: 'success', data: { id } });
        } else {
            const [result] = await pool.query(
                `INSERT INTO line_stops (part_number, model, line_pos, date, shift, loss_start, loss_end, duration_min, category_4m, stop_reason, corrective_action, notes, linked_abnormality_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [part_number || '', model || '', line_pos || '', date, shift || '', loss_start, loss_end, durationMin, category_4m || '', stop_reason || '', corrective_action || '', notes || '', linked_abnormality_id || null, created_by || '']
            );
            res.json({ status: 'success', data: { id: result.insertId } });
        }
    } catch (e) {
        console.error('Line stop save error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// GET /api/linestops — query line stops
router.get('/linestops', async (req, res) => {
    try {
        const pool = getPool();
        const { date, linePos, partNumber } = req.query;

        let where = 'WHERE 1=1';
        const params = [];
        if (date) { where += ' AND ls.date = ?'; params.push(date); }
        if (linePos) { where += ' AND ls.line_pos = ?'; params.push(linePos); }
        if (partNumber) { where += ' AND ls.part_number = ?'; params.push(partNumber); }

        const [rows] = await pool.query(
            `SELECT ls.*, ar.category_4m1e as abn_category, ar.problem_category as abn_problem
             FROM line_stops ls
             LEFT JOIN abnormality_records ar ON ls.linked_abnormality_id = ar.id
             ${where} ORDER BY ls.loss_start ASC`,
            params
        );
        res.json({ status: 'success', data: rows });
    } catch (e) {
        console.error('Line stop query error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// DELETE /api/linestops/:id
router.delete('/linestops/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM line_stops WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (e) {
        console.error('Line stop delete error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// GET /api/linestops/abnormality-suggest — find inspector abnormalities in a time range
router.get('/linestops/abnormality-suggest', async (req, res) => {
    try {
        const pool = getPool();
        const { date, linePos, startTime, endTime } = req.query;

        if (!date) return res.json({ status: 'error', message: 'date required' });

        let where = 'WHERE date = ?';
        const params = [date];
        if (linePos) { where += ' AND line_pos = ?'; params.push(linePos); }
        if (startTime && endTime) {
            where += ' AND time >= ? AND time <= ?';
            params.push(startTime, endTime);
        } else if (startTime) {
            where += ' AND time >= ?';
            params.push(startTime);
        } else if (endTime) {
            where += ' AND time <= ?';
            params.push(endTime);
        }

        const [rows] = await pool.query(
            `SELECT id, time, inspector, category_4m1e, problem_category FROM abnormality_records ${where} ORDER BY time ASC`,
            params
        );
        res.json({ status: 'success', data: rows });
    } catch (e) {
        console.error('Abnormality suggest error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

module.exports = router;
