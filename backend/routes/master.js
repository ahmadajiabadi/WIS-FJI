const express = require('express');
const { getPool } = require('../config/db');
const upload = require('../middlewares/upload');

const router = express.Router();

// 1. Get All Master Parts
router.get('/master/parts', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM part_master ORDER BY part_number ASC, model ASC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Add/Update Master Part (with optional single image upload)
router.post('/master/parts', upload.single('image'), async (req, res) => {
    try {
        const pool = getPool();
        const { part_number, part_name, model, line, marker_size, total_points, takt_time, side_type } = req.body;
        const imagePath = req.file ? 'uploads/' + req.file.filename : req.body.image_path;

        await pool.query(`
            INSERT INTO part_master (part_number, part_name, model, \`line\`, image_path, marker_size, total_points, takt_time, side_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                part_name = VALUES(part_name),
                line = VALUES(line),
                image_path = COALESCE(VALUES(image_path), image_path),
                marker_size = VALUES(marker_size),
                total_points = VALUES(total_points),
                takt_time = VALUES(takt_time),
                side_type = VALUES(side_type)
        `, [part_number, part_name, model, line || null, imagePath, marker_size || 32, parseInt(total_points) || 0, parseInt(takt_time) || 60, side_type || 'umum']);

        res.json({ status: 'success', image_path: imagePath });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2b. Pair/Unpair parts bidirectionally
router.post('/master/parts/pair', async (req, res) => {
    try {
        const pool = getPool();
        const { part_number, model, paired_part_number, paired_model } = req.body;
        
        if (!paired_part_number) {
            const [rows] = await pool.query('SELECT paired_part_number, paired_model FROM part_master WHERE part_number = ? AND model = ?', [part_number, model]);
            if (rows.length > 0 && rows[0].paired_part_number) {
                const oldPairNo = rows[0].paired_part_number;
                const oldPairModel = rows[0].paired_model;
                await pool.query('UPDATE part_master SET paired_part_number = NULL, paired_model = NULL WHERE part_number = ? AND model = ?', [oldPairNo, oldPairModel]);
            }
            await pool.query('UPDATE part_master SET paired_part_number = NULL, paired_model = NULL WHERE part_number = ? AND model = ?', [part_number, model]);
            return res.json({ status: 'success' });
        }

        const [currRows] = await pool.query('SELECT paired_part_number, paired_model FROM part_master WHERE part_number = ? AND model = ?', [part_number, model]);
        if (currRows.length > 0 && currRows[0].paired_part_number) {
            await pool.query('UPDATE part_master SET paired_part_number = NULL, paired_model = NULL WHERE part_number = ? AND model = ?', [currRows[0].paired_part_number, currRows[0].paired_model]);
        }

        const [targetRows] = await pool.query('SELECT paired_part_number, paired_model FROM part_master WHERE part_number = ? AND model = ?', [paired_part_number, paired_model]);
        if (targetRows.length > 0 && targetRows[0].paired_part_number) {
            await pool.query('UPDATE part_master SET paired_part_number = NULL, paired_model = NULL WHERE part_number = ? AND model = ?', [targetRows[0].paired_part_number, targetRows[0].paired_model]);
        }

        await pool.query('UPDATE part_master SET paired_part_number = ?, paired_model = ? WHERE part_number = ? AND model = ?', [paired_part_number, paired_model, part_number, model]);
        await pool.query('UPDATE part_master SET paired_part_number = ?, paired_model = ? WHERE part_number = ? AND model = ?', [part_number, model, paired_part_number, paired_model]);

        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. Delete Master Part
router.delete('/master/parts/:partNumber', async (req, res) => {
    try {
        const pool = getPool();
        const { model } = req.query;
        if (model) {
            await pool.query('DELETE FROM part_check_points WHERE part_number = ? AND model = ?', [req.params.partNumber, model]);
            await pool.query('DELETE FROM part_master WHERE part_number = ? AND model = ?', [req.params.partNumber, model]);
        } else {
            await pool.query('DELETE FROM part_check_points WHERE part_number = ?', [req.params.partNumber]);
            await pool.query('DELETE FROM part_master WHERE part_number = ?', [req.params.partNumber]);
        }
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 4. Get Part Name by Part Number (optional ?model= filter)
router.get('/parts/:partNumber', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber } = req.params;
        const { model } = req.query;
        let query = 'SELECT part_name, model FROM part_master WHERE part_number = ?';
        const params = [partNumber];
        if (model) {
            query += ' AND model = ?';
            params.push(model);
        }
        const [rows] = await pool.query(query, params);
        if (rows.length > 0) {
            res.json({ status: 'success', data: rows.length === 1 ? rows[0] : rows });
        } else {
            res.json({ status: 'not_found' });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 5. Get Check Points for a Part (optional ?side=KIRI|KANAN, ?model=)
router.get('/master/points/:partNumber', async (req, res) => {
    try {
        const pool = getPool();
        const { side, model } = req.query;
        let query = 'SELECT * FROM part_check_points WHERE part_number = ?';
        const params = [req.params.partNumber];
        if (model) {
            query += ' AND model = ?';
            params.push(model);
        }
        if (side) {
            query += ' AND (side = ? OR side IS NULL)';
            params.push(side);
        }
        query += ' ORDER BY CAST(check_no AS UNSIGNED) ASC';
        const [rows] = await pool.query(query, params);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 6. Save Custom Check Points for a Part (optional side, optional model)
router.post('/master/points', async (req, res) => {
    const pool = getPool();
    const { part_number, model, points, side } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Delete existing points for this part + side combo
        let deleteQuery = 'DELETE FROM part_check_points WHERE part_number = ?';
        let deleteParams = [part_number];
        if (model) {
            deleteQuery += ' AND model = ?';
            deleteParams.push(model);
        }
        if (side) {
            deleteQuery += ' AND side = ?';
            deleteParams.push(side);
        }
        await connection.query(deleteQuery, deleteParams);
        
        if (points && points.length > 0) {
            const values = points.map(p => [part_number, model || '-', side || null, p.check_no, p.x_coord, p.y_coord]);
            await connection.query('INSERT INTO part_check_points (part_number, model, side, check_no, x_coord, y_coord) VALUES ?', [values]);
        }
        
        await connection.commit();
        res.json({ status: 'success' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        connection.release();
    }
});

// 7. Enhanced Part-Specific Analytics (Heatmap, trends, defect codes distributions, paretos, and history logs)
router.get('/master/analytics/:partNumber', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber } = req.params;
        const { startDate, endDate, lines, model, shift } = req.query;
        
        // Build Date Filter Clause
        let dateFilter = "";
        let params = [partNumber];
        if (startDate && endDate) {
            dateFilter = " AND s.date BETWEEN ? AND ?";
            params.push(startDate, endDate);
        } else {
            dateFilter = " AND s.date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)";
        }

        // Build Line Filter Clause
        let lineFilter = "";
        let lineValues = [];
        if (lines) {
            const lineArr = lines.split(',').map(l => l.trim()).filter(Boolean);
            if (lineArr.length > 0) {
                const hasHyphen = lineArr.includes('-');
                const cleanLines = lineArr.filter(l => l !== '-');
                if (cleanLines.length > 0) {
                    if (hasHyphen) {
                        lineFilter = ` AND (s.line_pos IN (${cleanLines.map(() => '?').join(',')}) OR s.line_pos IS NULL OR s.line_pos = '')`;
                    } else {
                        lineFilter = ` AND s.line_pos IN (${cleanLines.map(() => '?').join(',')})`;
                    }
                    lineValues = cleanLines;
                } else if (hasHyphen) {
                    lineFilter = " AND (s.line_pos IS NULL OR s.line_pos = '')";
                }
            }
        }

        // Build Model Filter Clause
        let modelFilter = "";
        if (model) {
            modelFilter = " AND s.model = ?";
        }

        // Build Shift Filter Clause
        let shiftFilter = "";
        if (shift) {
            shiftFilter = " AND s.shift = ?";
        }

        // Get available lines for this part within date range (independent of model filter)
        let availFilterParams = [partNumber];
        let availFilter = "";
        if (startDate && endDate) {
            availFilter = " AND date BETWEEN ? AND ?";
            availFilterParams.push(startDate, endDate);
        } else {
            availFilter = " AND date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)";
        }
        const [availableLineRows] = await pool.query(`
            SELECT DISTINCT line_pos FROM check_sheets
            WHERE part_number = ? ${availFilter}
              AND line_pos IS NOT NULL AND line_pos != ''
            ORDER BY line_pos
        `, availFilterParams);
        const availableLines = availableLineRows.map(r => r.line_pos);

        // Get available models for this part within date range (independent of line filter)
        const [availableModelRows] = await pool.query(`
            SELECT DISTINCT model FROM check_sheets
            WHERE part_number = ? ${availFilter}
              AND model IS NOT NULL AND model != ''
            ORDER BY model
        `, availFilterParams);
        const availableModels = availableModelRows.map(r => r.model);

        // Apply line, model and shift filters to shared params
        params.push(...lineValues);
        if (model) params.push(model);
        if (shift) params.push(shift);

        // 1. Summary for Heatmap
        const [pointsSummary] = await pool.query(`
            SELECT 
                d.check_no,
                SUM(d.qty) as total_qty
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? 
              AND d.qty > 0 ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            GROUP BY d.check_no
        `, params);

        // 2. Monthly Trend by Defect Code
        const [trend] = await pool.query(`
            SELECT 
                DATE_FORMAT(s.date, '%Y-%m') as month,
                d.defect_code,
                SUM(d.qty) as count
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? AND d.qty > 0 ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            GROUP BY month, d.defect_code
            ORDER BY month ASC
        `, params);

        // 3. Code Distribution
        const [distribution] = await pool.query(`
            SELECT 
                d.defect_code,
                SUM(d.qty) as count
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? AND d.qty > 0 ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            GROUP BY d.defect_code
        `, params);

        // 4. Summary KPIs
        const summaryParams = [partNumber];
        let summaryDateFilter = "";
        if (startDate && endDate) {
            summaryDateFilter = " AND s.date BETWEEN ? AND ?";
            summaryParams.push(startDate, endDate);
        }
        summaryParams.push(...lineValues);
        if (model) summaryParams.push(model);
        if (shift) summaryParams.push(shift);
        const [sheetRows] = await pool.query(`
            SELECT s.id FROM check_sheets s
            WHERE s.part_number = ? ${summaryDateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
        `, summaryParams);

        let summaryObj = { total_scans: 0, total_prod: 0, total_ng_qty: 0, total_ng_point: 0, max_points: 0 };
        if (sheetRows.length > 0) {
            const sheetIds = sheetRows.map(r => r.id);
            const [actualRows] = await pool.query(
                `SELECT 
                    COUNT(*) as total_prod,
                    SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as total_ng
                FROM part_check_times
                WHERE check_sheet_id IN (?) AND part_number = ?`,
                [sheetIds, partNumber]
            );
            const [ngPointRows] = await pool.query(
                `SELECT SUM(qty) as total_ng_point FROM check_sheet_details WHERE check_sheet_id IN (?)`,
                [sheetIds]
            );
            const [ptsRows] = await pool.query(
                `SELECT COALESCE(
                    (SELECT total_points FROM part_master WHERE part_number = ? LIMIT 1),
                    (SELECT COUNT(DISTINCT check_no) FROM part_check_points WHERE part_number = ?),
                    0
                ) as pts`,
                [partNumber, partNumber]
            );
            const pts = ptsRows[0].pts || 0;
            const prod = actualRows[0].total_prod || 0;
            
            summaryObj = {
                total_scans: sheetRows.length,
                total_prod: prod,
                total_ng_qty: actualRows[0].total_ng || 0,
                total_ng_point: ngPointRows[0].total_ng_point || 0,
                max_points: prod * pts
            };
        }
        const summary = [summaryObj];

        // 5. Full History with details
        const [history] = await pool.query(`
            SELECT 
                s.date, s.shift, s.inspector as nama, 
                d.problem, d.defect_code, d.check_no, d.qty
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? AND d.qty > 0 ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            ORDER BY s.date DESC
            LIMIT 100
        `, params);

        // 6. Problems Summary for Pareto Chart
        const [problemsSummary] = await pool.query(`
            SELECT 
                d.problem,
                SUM(d.qty) as total_qty
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? 
              AND d.qty > 0 
              AND d.problem != 'Tidak ada data NG (All OK)' 
              AND d.problem != '-'
              AND d.problem IS NOT NULL
              ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            GROUP BY d.problem
            ORDER BY total_qty DESC
        `, params);

        // 7. Line/Pos breakdown for this part
        const [linesSummary] = await pool.query(`
            SELECT 
                s.line_pos,
                SUM(d.qty) as total_qty
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            WHERE s.part_number = ? 
              AND d.qty > 0 
              AND s.line_pos IS NOT NULL 
              AND s.line_pos != ''
              ${dateFilter} ${lineFilter} ${modelFilter} ${shiftFilter}
            GROUP BY s.line_pos
            ORDER BY total_qty DESC
        `, params);

        // 8. Available shifts for this part within date range
        const [availableShiftRows] = await pool.query(`
            SELECT DISTINCT shift FROM check_sheets
            WHERE part_number = ? ${availFilter}
              AND shift IS NOT NULL AND shift != ''
            ORDER BY shift
        `, availFilterParams);
        const availableShifts = availableShiftRows.map(r => r.shift);

        res.json({ 
            status: 'success', 
            points: pointsSummary,
            problems: problemsSummary,
            trend: trend,
            distribution: distribution,
            summary: summary[0] || {},
            history: history,
            lines: linesSummary,
            availableLines: availableLines,
            availableModels: availableModels,
            availableShifts: availableShifts
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 8. Import from List Part Update.xlsx
router.post('/master/import-excel', async (req, res) => {
    try {
        const XLSX = require('xlsx');
        const path = require('path');
        const pool = getPool();

        const filePath = path.join(__dirname, '..', '..', 'List Part Update.xlsx');
        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ status: 'error', message: 'File List Part Update.xlsx tidak ditemukan di root project' });
        }
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // rows[0] = header: [No., Model, Line, Part Number, Part Name]
        // Data starts from rows[1]
        let total = 0, skipped = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const no = (row[0] || '').toString().trim();
            const model = (row[1] || '').toString().trim();
            const line = (row[2] || '').toString().trim();
            const partNumber = (row[3] || '').toString().trim();
            const partName = (row[4] || '').toString().trim();

            if (!partNumber) { skipped++; continue; }

            const modelKey = model || '-';
            const lineVal = line || null;

            await pool.query(`
                INSERT INTO part_master (part_number, part_name, model, \`line\`)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE part_name = VALUES(part_name), \`line\` = VALUES(\`line\`)
            `, [partNumber, partName, modelKey, lineVal]);

            total++;
        }

        res.json({
            status: 'success',
            message: `Import selesai. ${total} record diproses, ${skipped} baris kosong dilewati.`
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
