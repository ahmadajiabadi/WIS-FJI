const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getPool } = require('../config/db');
const { verifyToken, permit } = require('../middleware/auth');

// All user management routes require admin role
router.use('/users', verifyToken, permit('admin'));

// GET /api/users — list all users
router.get('/users', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, full_name, role, permissions, is_active, created_at FROM users ORDER BY is_active DESC, full_name ASC'
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/users — create user
router.post('/users', async (req, res) => {
    try {
        const { username, password, full_name, role, permissions, is_active } = req.body;
        if (!username || !full_name || !role) {
            return res.status(400).json({ status: 'error', message: 'Username, full_name, and role are required' });
        }
        const pool = getPool();

        // Check duplicate username
        const [dup] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (dup.length > 0) {
            return res.status(409).json({ status: 'error', message: 'Username already exists' });
        }

        let hashedPw = null;
        if (password) {
            hashedPw = await bcrypt.hash(password, 10);
        }

        const perms = Array.isArray(permissions) ? JSON.stringify(permissions) : null;
        await pool.query(
            'INSERT INTO users (username, password, full_name, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPw, full_name, role, perms, is_active !== undefined ? (is_active ? 1 : 0) : 1]
        );

        res.json({ status: 'success', message: 'User created' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT /api/users/:id — update user
router.put('/users/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { id } = req.params;
        const { username, password, full_name, role, permissions, is_active } = req.body;

        // Cannot change own role to non-admin (prevent lockout)
        const [curr] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
        if (curr.length === 0) return res.status(404).json({ status: 'error', message: 'User not found' });

        // Prevent removing admin role from self
        if (parseInt(id) === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ status: 'error', message: 'Cannot remove your own admin role' });
        }

        const sets = [];
        const vals = [];
        if (username !== undefined) { sets.push('username = ?'); vals.push(username); }
        if (full_name !== undefined) { sets.push('full_name = ?'); vals.push(full_name); }
        if (role !== undefined) { sets.push('role = ?'); vals.push(role); }
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            sets.push('password = ?');
            vals.push(hash);
        }
        if (permissions !== undefined) {
            sets.push('permissions = ?');
            if (Array.isArray(permissions)) {
                vals.push(JSON.stringify(permissions));
            } else {
                vals.push(null);
            }
        }
        if (is_active !== undefined) { sets.push('is_active = ?'); vals.push(is_active ? 1 : 0); }

        if (sets.length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });

        vals.push(id);
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);

        res.json({ status: 'success', message: 'User updated' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE /api/users/:id — hard delete
router.delete('/users/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { id } = req.params;

        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ status: 'error', message: 'Cannot delete yourself' });
        }

        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ status: 'error', message: 'User not found' });

        res.json({ status: 'success', message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
