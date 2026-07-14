const express = require('express');
const { getPool } = require('../config/db');
const XLSX = require('xlsx');
const upload = require('../middlewares/upload');

const router = express.Router();

// GET /api/ppic/plans?date=YYYY-MM-DD
router.get('/ppic/plans', async (req, res) => {
    try {
        const pool = getPool();
        const { date } = req.query;
        if (!date) return res.status(400).json({ status: 'error', message: 'date required' });
        const [rows] = await pool.query(
            'SELECT * FROM ppic_plans WHERE tanggal = ? ORDER BY model, part_number',
            [date]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/ppic/plans — batch upsert by date only (no shift)
router.post('/ppic/plans', async (req, res) => {
    try {
        const pool = getPool();
        const { tanggal, plans } = req.body;
        if (!tanggal || !plans || !Array.isArray(plans)) {
            return res.status(400).json({ status: 'error', message: 'Invalid request' });
        }
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            // Delete existing plans for this date
            await conn.query('DELETE FROM ppic_plans WHERE tanggal = ?', [tanggal]);
            // Insert new plans
            if (plans.length > 0) {
                const values = plans.map(p => [
                    tanggal,
                    p.part_number, p.part_name || '',
                    p.model || '', p.line || '',
                    parseInt(p.qty_planning) || 0
                ]);
                await conn.query(
                    'INSERT INTO ppic_plans (tanggal, part_number, part_name, model, line, qty_planning) VALUES ?',
                    [values]
                );
            }
            await conn.commit();
            res.json({ status: 'success', saved: plans.length });
        } catch (err2) {
            await conn.rollback();
            throw err2;
        } finally {
            conn.release();
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/ppic/plans/template
router.get('/ppic/plans/template', (req, res) => {
    try {
        const headers = [['Part Number', 'Model', 'Qty Planning']];
        const sampleData = [['CS-PART-01', 'D26A', 100]];
        const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename=ppic_plan_template.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/ppic/plans/download
router.get('/ppic/plans/download', async (req, res) => {
    try {
        const pool = getPool();
        const { date } = req.query;
        if (!date) return res.status(400).json({ status: 'error', message: 'date required' });
        
        const [rows] = await pool.query(`
            SELECT 
                p.tanggal as Date, 
                p.part_number as \`Part Number\`, 
                p.part_name as \`Part Name\`, 
                p.model as Model, 
                p.line as Line, 
                COALESCE(pm.side_type, 'umum') as Sisi,
                p.qty_planning as \`Qty Planning\`
            FROM ppic_plans p
            LEFT JOIN part_master pm ON p.part_number = pm.part_number AND p.model = pm.model
            WHERE p.tanggal = ?
            ORDER BY p.model, p.part_number
        `, [date]);
        
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PPIC Plans');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', `attachment; filename=ppic_plans_${date}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/ppic/plans/upload
router.post('/ppic/plans/upload', upload.single('file'), async (req, res) => {
    try {
        const pool = getPool();
        const { date } = req.body;
        if (!date) return res.status(400).json({ status: 'error', message: 'date required' });
        if (!req.file) return res.status(400).json({ status: 'error', message: 'file required' });
        
        const wb = XLSX.readFile(req.file.path);
        const wsName = wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wsName]);
        
        const plans = [];
        for (const row of data) {
            const partNoKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'partnumber');
            const modelKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'model');
            const qtyKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'qtyplanning');
            
            if (!partNoKey) continue;
            
            const partNumber = String(row[partNoKey] || '').trim();
            const model = modelKey ? String(row[modelKey] || '').trim() : '-';
            const qty = qtyKey ? parseInt(row[qtyKey]) || 0 : 0;
            
            if (!partNumber || qty <= 0) continue;
            
            const [parts] = await pool.query('SELECT part_name, line FROM part_master WHERE part_number = ? AND model = ?', [partNumber, model]);
            const partName = parts.length > 0 ? parts[0].part_name : '';
            const line = parts.length > 0 ? parts[0].line : '';
            
            plans.push([
                date,
                partNumber,
                partName,
                model,
                line,
                qty
            ]);
        }
        
        const fs = require('fs');
        try {
            fs.unlinkSync(req.file.path);
        } catch (e) {}
        
        if (plans.length === 0) {
            return res.json({ status: 'error', message: 'No valid planning records found in file' });
        }
        
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM ppic_plans WHERE tanggal = ?', [date]);
            await conn.query(
                'INSERT INTO ppic_plans (tanggal, part_number, part_name, model, line, qty_planning) VALUES ?',
                [plans]
            );
            await conn.commit();
            res.json({ status: 'success', saved: plans.length });
        } catch (err2) {
            await conn.rollback();
            throw err2;
        } finally {
            conn.release();
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
