const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// ==================== INSPECTORS ====================

// GET all inspectors
router.get('/settings/inspectors', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM inspectors ORDER BY name ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST create inspector
router.post('/settings/inspectors', async (req, res) => {
    try {
        const pool = getPool();
        const { name, active } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nama inspector wajib diisi' });
        }
        const [result] = await pool.query(
            'INSERT INTO inspectors (name, active) VALUES (?, ?)',
            [name.trim(), active !== undefined ? (active ? 1 : 0) : 1]
        );
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT update inspector
router.put('/settings/inspectors/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { name, active } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nama inspector wajib diisi' });
        }
        await pool.query(
            'UPDATE inspectors SET name = ?, active = ? WHERE id = ?',
            [name.trim(), active !== undefined ? (active ? 1 : 0) : 1, req.params.id]
        );
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE inspector
router.delete('/settings/inspectors/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM inspectors WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ==================== LINE POSITIONS ====================

// GET all line positions
router.get('/settings/line-positions', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM line_positions ORDER BY name ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST create line position
router.post('/settings/line-positions', async (req, res) => {
    try {
        const pool = getPool();
        const { name, active } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nama line/pos wajib diisi' });
        }
        const [result] = await pool.query(
            'INSERT INTO line_positions (name, active) VALUES (?, ?)',
            [name.trim(), active !== undefined ? (active ? 1 : 0) : 1]
        );
        res.json({ status: 'success', id: result.insertId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT update line position
router.put('/settings/line-positions/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { name, active } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nama line/pos wajib diisi' });
        }
        await pool.query(
            'UPDATE line_positions SET name = ?, active = ? WHERE id = ?',
            [name.trim(), active !== undefined ? (active ? 1 : 0) : 1, req.params.id]
        );
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE line position
router.delete('/settings/line-positions/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM line_positions WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
