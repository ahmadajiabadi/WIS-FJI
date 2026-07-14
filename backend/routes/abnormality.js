const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

// ========== 4M1E CATEGORIES CRUD ==========

// GET all abnormality categories (grouped by 4M1E)
router.get('/settings/abnormality-categories', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT * FROM abnormality_categories ORDER BY FIELD(category_4m1e, "Man","Mesin","Material","Metode","Environment"), sort_order ASC, id ASC'
        );
        const grouped = { Man: [], Mesin: [], Material: [], Metode: [], Environment: [] };
        rows.forEach(r => {
            if (!grouped[r.category_4m1e]) grouped[r.category_4m1e] = [];
            grouped[r.category_4m1e].push(r);
        });
        res.json({ status: 'success', data: rows, grouped });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST create abnormality category
router.post('/settings/abnormality-categories', async (req, res) => {
    try {
        const pool = getPool();
        const { category_4m1e, problem_name, keywords, sort_order } = req.body;
        if (!category_4m1e || !problem_name) {
            return res.status(400).json({ status: 'error', message: 'category_4m1e dan problem_name wajib diisi' });
        }
        const validCategories = ['Man', 'Mesin', 'Material', 'Metode', 'Environment'];
        if (!validCategories.includes(category_4m1e)) {
            return res.status(400).json({ status: 'error', message: 'category_4m1e tidak valid' });
        }
        const [result] = await pool.query(
            'INSERT INTO abnormality_categories (category_4m1e, problem_name, keywords, sort_order) VALUES (?, ?, ?, ?)',
            [category_4m1e, problem_name, keywords || '', sort_order || 0]
        );
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT update abnormality category
router.put('/settings/abnormality-categories/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { category_4m1e, problem_name, keywords, sort_order, active } = req.body;
        const validCategories = ['Man', 'Mesin', 'Material', 'Metode', 'Environment'];
        if (category_4m1e && !validCategories.includes(category_4m1e)) {
            return res.status(400).json({ status: 'error', message: 'category_4m1e tidak valid' });
        }
        await pool.query(
            'UPDATE abnormality_categories SET category_4m1e = ?, problem_name = ?, keywords = ?, sort_order = ?, active = ? WHERE id = ?',
            [
                category_4m1e,
                problem_name,
                keywords || '',
                sort_order || 0,
                active !== undefined ? (active ? 1 : 0) : 1,
                req.params.id
            ]
        );
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE abnormality category
router.delete('/settings/abnormality-categories/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM abnormality_categories WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ========== ABNORMALITY RECORDS ==========

// POST record abnormality
router.post('/abnormality', async (req, res) => {
    try {
        const pool = getPool();
        const { date, inspector, part_number, model, shift, line_pos, side, category_4m1e, problem_category } = req.body;
        if (!category_4m1e || !problem_category) {
            return res.status(400).json({ status: 'error', message: 'category_4m1e dan problem_category wajib diisi' });
        }
        const now = new Date();
        const recordDate = date || now.toISOString().split('T')[0];
        const recordTime = now.toTimeString().split(' ')[0].substring(0, 5);
        const [result] = await pool.query(
            'INSERT INTO abnormality_records (date, time, inspector, part_number, model, shift, line_pos, side, category_4m1e, problem_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [recordDate, recordTime, inspector || '', part_number || '', model || '', shift || '', line_pos || '', side || '', category_4m1e, problem_category]
        );
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET abnormality records
router.get('/abnormality', async (req, res) => {
    try {
        const pool = getPool();
        const { date, startDate, endDate, partNumber, shift, inspector, limit: queryLimit } = req.query;
        let sql = 'SELECT * FROM abnormality_records WHERE 1=1';
        const params = [];
        if (date) { sql += ' AND date = ?'; params.push(date); }
        if (startDate) { sql += ' AND date >= ?'; params.push(startDate); }
        if (endDate) { sql += ' AND date <= ?'; params.push(endDate); }
        if (partNumber) { sql += ' AND part_number LIKE ?'; params.push(`%${partNumber}%`); }
        if (shift) { sql += ' AND shift = ?'; params.push(shift); }
        if (inspector) { sql += ' AND inspector LIKE ?'; params.push(`%${inspector}%`); }
        sql += ' ORDER BY date DESC, time DESC';
        const limit = parseInt(queryLimit) || 200;
        sql += ' LIMIT ?';
        params.push(limit);
        const [rows] = await pool.query(sql, params);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET abnormality stats for Asakai dashboard
router.get('/abnormality/stats', async (req, res) => {
    try {
        const pool = getPool();
        const { date } = req.query;
        if (!date) return res.status(400).json({ status: 'error', message: 'date parameter required' });

        const [rows] = await pool.query(
            `SELECT category_4m1e, problem_category, COUNT(*) as qty
             FROM abnormality_records
             WHERE date = ?
             GROUP BY category_4m1e, problem_category
             ORDER BY qty DESC LIMIT 10`,
            [date]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
