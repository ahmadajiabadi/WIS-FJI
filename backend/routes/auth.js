const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getPool } = require('../config/db');
const { signToken, verifyToken } = require('../middleware/auth');

// GET /api/auth/users — daftar user aktif (tanpa password)
router.get('/auth/users', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, full_name, role, COALESCE(password IS NOT NULL AND password != "", 0) AS has_password FROM users WHERE is_active = 1 ORDER BY full_name'
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });

        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, password, full_name, role, permissions, is_active FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        if (rows.length === 0) {
            return res.status(401).json({ status: 'error', message: 'User not found' });
        }
        const user = rows[0];

        // If user has password, verify it
        if (user.password) {
            if (!password) return res.status(400).json({ status: 'error', message: 'Password required' });
            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return res.status(401).json({ status: 'error', message: 'Wrong password' });
        }

        // Build permission list
        const roleDefaults = {
            admin: ['scan','voice','database','dashboard','live-monitoring','asakai','linestop','master','ppic','settings','users'],
            qa: ['scan','database','dashboard','live-monitoring','asakai'],
            qc_welding: ['scan','voice','database','dashboard','live-monitoring','linestop'],
            welding: ['scan','database','dashboard','linestop'],
            ppic: ['ppic','database','dashboard'],
            operator_admin: ['scan','database'],
        };
        let permissions = roleDefaults[user.role] || ['scan','database'];
        // Override with stored permissions if set
        if (user.permissions !== null && user.permissions !== undefined) {
            try {
                const stored = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
                if (Array.isArray(stored) && stored.length > 0) {
                    permissions = stored;
                }
            } catch (e) {
                console.warn('[AUTH] Failed to parse permissions for user', user.username, ':', user.permissions, e.message);
            }
        }

        const token = signToken({
            id: user.id,
            username: user.username,
            role: user.role,
        });

        res.json({
            status: 'success',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    permissions,
                }
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/auth/me — verify token & return current user
router.get('/auth/me', verifyToken, async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, password, full_name, role, permissions, is_active FROM users WHERE id = ? AND is_active = 1',
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(401).json({ status: 'error', message: 'User not found' });
        }
        const user = rows[0];
        const roleDefaults = {
            admin: ['scan','voice','database','dashboard','live-monitoring','asakai','linestop','master','ppic','settings','users'],
            qa: ['scan','database','dashboard','live-monitoring','asakai'],
            qc_welding: ['scan','voice','database','dashboard','live-monitoring','linestop'],
            welding: ['scan','database','dashboard','linestop'],
            ppic: ['ppic','database','dashboard'],
            operator_admin: ['scan','database'],
        };
        let permissions = roleDefaults[user.role] || ['scan','database'];
        if (user.permissions !== null && user.permissions !== undefined) {
            try {
                const stored = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
                if (Array.isArray(stored) && stored.length > 0) {
                    permissions = stored;
                }
            } catch (e) {
                console.warn('[AUTH] Failed to parse permissions for user', user.username, ':', user.permissions, e.message);
            }
        }
        res.json({
            status: 'success',
            data: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                permissions,
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
