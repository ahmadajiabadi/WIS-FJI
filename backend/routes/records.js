const express = require('express');
const { getPool } = require('../config/db');
const upload = require('../middlewares/upload');

const router = express.Router();

async function recalculateSheetEfficiency(connection, timestart, timeend, total_checks, takt_time_sec, dateStr, partNumber = null, sessionId = null) {
    if (!timestart || !timeend || !total_checks || !takt_time_sec) return 0;
    try {
        let isDualSide = false;
        let pairedPartNumber = null;
        if (partNumber) {
            const [partRows] = await connection.query('SELECT paired_part_number FROM part_master WHERE part_number = ? LIMIT 1', [partNumber]);
            if (partRows.length > 0) {
                pairedPartNumber = partRows[0].paired_part_number;
                isDualSide = !!pairedPartNumber;
            }
        }

        let startMs = new Date(timestart).getTime();
        let endMs = new Date(timeend).getTime();
        let checksCount = total_checks;
        let finalTakt = takt_time_sec;

        if (isDualSide && sessionId) {
            const [sessionChecks] = await connection.query(
                'SELECT MIN(check_start) as min_ts, MAX(check_end) as max_ts, COUNT(*) as cnt FROM part_check_times WHERE session_id = ?',
                [sessionId]
            );
            if (sessionChecks.length > 0 && sessionChecks[0].cnt > 0) {
                startMs = new Date(sessionChecks[0].min_ts).getTime();
                endMs = new Date(sessionChecks[0].max_ts).getTime();
                checksCount = sessionChecks[0].cnt / 2; // actual pairs
                finalTakt = takt_time_sec * 2; // combined target takt
            }
        }

        if (isNaN(startMs) || isNaN(endMs)) return 0;
        const spanMin = (endMs - startMs) / 60000;
        
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay() + 1;
        const [breaks] = await connection.query(
            `SELECT start_time, end_time FROM timer_breaks WHERE 
                CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                AND active = 1`,
            [dayOfWeek]
        );
        
        let breakMin = 0;
        const dayStartMs = new Date(dateStr + 'T00:00:00').getTime();
        breaks.forEach(b => {
            const partsStart = (b.start_time || '00:00:00').split(':');
            const partsEnd = (b.end_time || '00:00:00').split(':');
            const bStart = dayStartMs + (parseInt(partsStart[0]) * 60 + parseInt(partsStart[1])) * 60000;
            const bEnd = dayStartMs + (parseInt(partsEnd[0]) * 60 + parseInt(partsEnd[1])) * 60000;
            const overlapStart = Math.max(startMs, bStart);
            const overlapEnd = Math.min(endMs, bEnd);
            if (overlapEnd > overlapStart) breakMin += (overlapEnd - overlapStart) / 60000;
        });
        
        const activeMin = Math.max(0, spanMin - breakMin);
        const expected = Math.floor((activeMin * 60) / finalTakt);
        return expected > 0 ? Math.min(100, Math.round((checksCount / expected) * 100)) : 0;
    } catch(e) {
        console.error("Error recalculating sheet efficiency:", e);
        return 0;
    }
}

// 1. Get List of Records
router.get('/records', async (req, res) => {
    try {
        const pool = getPool();
        const { month, year, partNumber, model, startDate, endDate, linePos } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const offset = (page - 1) * limit;

        let baseWhere = '';
        const baseParams = [];

        if (month && month !== 'all') {
            baseWhere += ' AND MONTH(date) = ?';
            baseParams.push(month);
        }
        if (year) {
            baseWhere += ' AND YEAR(date) = ?';
            baseParams.push(year);
        }
        if (partNumber) {
            baseWhere += ' AND (part_number LIKE ? OR part_name LIKE ?)';
            baseParams.push(`%${partNumber}%`, `%${partNumber}%`);
        }
        if (model) {
            baseWhere += ' AND model LIKE ?';
            baseParams.push(`%${model}%`);
        }
        if (startDate) {
            baseWhere += ' AND date >= ?';
            baseParams.push(startDate);
        }
        if (endDate) {
            baseWhere += ' AND date <= ?';
            baseParams.push(endDate);
        }

        // Get distinct lines matching periodical and other filters
        const [lineRows] = await pool.query(
            `SELECT DISTINCT line_pos FROM check_sheets WHERE 1=1 ${baseWhere} ORDER BY line_pos ASC`,
            baseParams
        );
        const availableLines = lineRows.map(r => r.line_pos).filter(Boolean);

        let whereClause = baseWhere;
        const params = [...baseParams];
        if (linePos) {
            whereClause += ' AND line_pos = ?';
            params.push(linePos);
        }

        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM check_sheets WHERE 1=1' + whereClause, params);
        const total = countResult[0].total;

        const query = 'SELECT * FROM check_sheets WHERE 1=1' + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?';
        const [rows] = await pool.query(query, [...params, limit, offset]);

        res.json({ 
            status: 'success', 
            data: rows,
            availableLines,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Get Detail of a Record
router.get('/records/:id', async (req, res) => {
    try {
        const pool = getPool();
        const [header] = await pool.query('SELECT * FROM check_sheets WHERE id = ?', [req.params.id]);
        if (header.length === 0) return res.status(404).json({ status: 'error', message: 'Record not found' });
        const [details] = await pool.query('SELECT * FROM check_sheet_details WHERE check_sheet_id = ?', [req.params.id]);

            res.json({
                status: 'success', data: {
                    meta: { id: header[0].id, partName: header[0].part_name, partNumber: header[0].part_number, model: header[0].model, nama: header[0].inspector, shift: header[0].shift, linePos: header[0].line_pos, date: header[0].date },
                    summary: { 
                        totalProduksi: header[0].total_prod, 
                        totalOK: header[0].total_ok, 
                        totalNG: header[0].total_ng, 
                        totalNGPoint: header[0].total_ng_point, 
                        totalScrap: header[0].total_scrap,
                        confidenceScore: header[0].confidence_score !== null ? Number(header[0].confidence_score) : 100,
                        totalCheckTime: header[0].total_check_time || 0,
                        totalChecks: header[0].total_checks || 0,
                        efficiency: header[0].efficiency || 0
                    },
                details: details.map(d => ({ 
                    checkNo: d.check_no, 
                    pointCheck: d.point_check, 
                    problem: d.problem, 
                    defectCode: d.defect_code, 
                    qty: d.qty, 
                    location: typeof d.location === 'string' ? JSON.parse(d.location) : d.location, 
                    pageIndex: (d.page_index !== null ? Number(d.page_index) : 0),
                    confidence: d.confidence !== null ? Number(d.confidence) : 100,
                    lowConfidenceReason: d.low_confidence_reason || ""
                })),
                image_path: header[0].image_path,
                notes: header[0].notes || ""
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2b. Upload Image for Manual Input
router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No file uploaded' });
        }
        const relativePath = 'uploads/' + req.file.filename;
        res.json({ status: 'success', imagePath: relativePath });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. Save Manual Check Sheet
router.post('/save', async (req, res) => {
    const pool = getPool();
    const { meta, summary, details, image_path, notes, input_mode, efficiency } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        let finalEfficiency = null;
        if (input_mode === 'voice' && efficiency) {
            finalEfficiency = efficiency.efficiency !== undefined ? efficiency.efficiency : 0;
            if (efficiency.timestart && efficiency.timeend) {
                finalEfficiency = await recalculateSheetEfficiency(
                    connection,
                    efficiency.timestart,
                    efficiency.timeend,
                    efficiency.total_checks,
                    efficiency.takt_time_sec,
                    meta.date || new Date().toISOString().split('T')[0],
                    meta.partNumber,
                    efficiency.session_id
                );
            }
        }
        const calculatedNGPoint = (details || []).reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);

        const [headerResult] = await connection.query(`
            INSERT INTO check_sheets (part_name, part_number, model, inspector, shift, line_pos, date, total_prod, total_ok, total_ng, total_ng_point, total_scrap, image_path, notes, confidence_score, input_mode, total_check_time, total_checks, efficiency, timestart, timeend, takt_time_sec)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            meta.partName || '', 
            meta.partNumber || '', 
            meta.model || '', 
            meta.nama || '', 
            meta.shift || '', 
            meta.linePos || '', 
            meta.date || null, 
            parseInt(summary.totalProduksi) || 0, 
            parseInt(summary.totalOK) || 0, 
            parseInt(summary.totalNG) || 0, 
            calculatedNGPoint, 
            parseInt(summary.totalScrap) || 0, 
            image_path || null, 
            notes || '',
            (summary.confidenceScore !== undefined && summary.confidenceScore !== null) ? parseInt(summary.confidenceScore) : 100,
            input_mode || 'manual',
            efficiency?.total_check_time || 0,
            efficiency?.total_checks || 0,
            finalEfficiency,
            efficiency?.timestart || null,
            efficiency?.timeend || null,
            efficiency?.takt_time_sec || 60
        ]);
        const checkSheetId = headerResult.insertId;
        if (details && details.length > 0) {
            const detailValues = details.map(d => [
                checkSheetId, 
                d.pointCheck || '', 
                d.checkNo || '', 
                d.problem || '', 
                d.defectCode || '', 
                parseInt(d.qty) || 0, 
                JSON.stringify(d.location || null), 
                (d.pageIndex !== undefined && d.pageIndex !== null ? d.pageIndex : 0),
                (d.confidence !== undefined && d.confidence !== null) ? parseInt(d.confidence) : 100,
                d.lowConfidenceReason || null
            ]);
            await connection.query('INSERT INTO check_sheet_details (check_sheet_id, point_check, check_no, problem, defect_code, qty, location, page_index, confidence, low_confidence_reason) VALUES ?', [detailValues]);
        }
        // Link part_check_times rows to this check sheet via session_id
        if (efficiency?.session_id) {
            await connection.query('UPDATE part_check_times SET check_sheet_id = ? WHERE session_id = ?', [checkSheetId, efficiency.session_id]);
        }
        await connection.commit();
        res.json({ status: 'success', id: checkSheetId });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        connection.release();
    }
});

// 3b. Save Multi (Dual-Side) Check Sheet - for Voice QC Kanan/Kiri
router.post('/save-multi', async (req, res) => {
    const pool = getPool();
    const { sessionGroup, inputs } = req.body;
    if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
        return res.status(400).json({ status: 'error', message: 'inputs array diperlukan' });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const ids = [];
        for (const input of inputs) {
            const { meta, summary, details, image_path, notes, input_mode, side, efficiency } = input;
            let finalEfficiency = null;
            if (input_mode === 'voice' && efficiency) {
                finalEfficiency = efficiency.efficiency !== undefined ? efficiency.efficiency : 0;
                if (efficiency.timestart && efficiency.timeend) {
                    finalEfficiency = await recalculateSheetEfficiency(
                        connection,
                        efficiency.timestart,
                        efficiency.timeend,
                        efficiency.total_checks,
                        efficiency.takt_time_sec,
                        meta.date || new Date().toISOString().split('T')[0],
                        meta.partNumber,
                        efficiency.session_id
                    );
                }
            }
            const calculatedNGPoint = (details || []).reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);

            const [headerResult] = await connection.query(`
                INSERT INTO check_sheets (part_name, part_number, model, inspector, shift, line_pos, side, session_group, date, total_prod, total_ok, total_ng, total_ng_point, total_scrap, image_path, notes, confidence_score, input_mode, total_check_time, total_checks, efficiency, timestart, timeend, takt_time_sec)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                meta.partName || '',
                meta.partNumber || '',
                meta.model || '',
                meta.nama || '',
                meta.shift || '',
                meta.linePos || '',
                side || null,
                sessionGroup || null,
                meta.date || null,
                parseInt(summary.totalProduksi) || 0,
                parseInt(summary.totalOK) || 0,
                parseInt(summary.totalNG) || 0,
                calculatedNGPoint,
                parseInt(summary.totalScrap) || 0,
                image_path || null,
                notes || '',
                (summary.confidenceScore !== undefined && summary.confidenceScore !== null) ? parseInt(summary.confidenceScore) : 100,
                input_mode || 'voice',
                efficiency?.total_check_time || 0,
                efficiency?.total_checks || 0,
                finalEfficiency,
                efficiency?.timestart || null,
                efficiency?.timeend || null,
                efficiency?.takt_time_sec || 60
            ]);
            const checkSheetId = headerResult.insertId;
            ids.push(checkSheetId);
            // Link part_check_times rows to this check sheet via session_id
            if (efficiency?.session_id) {
                const linkParams = [checkSheetId, efficiency.session_id];
                let linkWhere = 'session_id = ?';
                // For multi-side, filter by side so each side gets its own items
                if (side) { linkWhere += ' AND side = ?'; linkParams.push(side); }
                await connection.query(`UPDATE part_check_times SET check_sheet_id = ? WHERE ${linkWhere}`, linkParams);
            }
            if (details && details.length > 0) {
                const detailValues = details.map(d => [
                    checkSheetId,
                    d.pointCheck || '',
                    d.checkNo || '',
                    d.problem || '',
                    d.defectCode || '',
                    parseInt(d.qty) || 0,
                    JSON.stringify(d.location || null),
                    (d.pageIndex !== undefined && d.pageIndex !== null ? d.pageIndex : 0),
                    (d.confidence !== undefined && d.confidence !== null) ? parseInt(d.confidence) : 100,
                    d.lowConfidenceReason || null
                ]);
                await connection.query('INSERT INTO check_sheet_details (check_sheet_id, point_check, check_no, problem, defect_code, qty, location, page_index, confidence, low_confidence_reason) VALUES ?', [detailValues]);
            }
        }
        await connection.commit();
        res.json({ status: 'success', ids });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        connection.release();
    }
});

// 4. Update Existing Record
router.put('/records/:id', async (req, res) => {
    const pool = getPool();
    const { meta, summary, details, notes } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Update header
        await connection.query(`
            UPDATE check_sheets 
            SET part_name = ?, part_number = ?, model = ?, inspector = ?, shift = ?, line_pos = ?, date = ?, 
                total_prod = ?, total_ok = ?, total_ng = ?, total_ng_point = ?, total_scrap = ?, notes = ?,
                confidence_score = ?
            WHERE id = ?
        `, [
            meta.partName, 
            meta.partNumber, 
            meta.model, 
            meta.nama, 
            meta.shift, 
            meta.linePos || '', 
            meta.date, 
            summary.totalProduksi, 
            summary.totalOK, 
            summary.totalNG, 
            summary.totalNGPoint, 
            summary.totalScrap, 
            notes, 
            (summary.confidenceScore !== undefined && summary.confidenceScore !== null) ? parseInt(summary.confidenceScore) : 100,
            req.params.id
        ]);

        // Refresh details
        await connection.query("DELETE FROM check_sheet_details WHERE check_sheet_id = ?", [req.params.id]);
        if (details && details.length > 0) {
            const detailValues = details.map(d => [
                req.params.id, 
                d.pointCheck || '', 
                d.checkNo || '', 
                d.problem || '', 
                d.defectCode || '', 
                parseInt(d.qty) || 0, 
                JSON.stringify(d.location || null), 
                (d.pageIndex !== undefined && d.pageIndex !== null ? d.pageIndex : 0),
                (d.confidence !== undefined && d.confidence !== null) ? parseInt(d.confidence) : 100,
                d.lowConfidenceReason || null
            ]);
            await connection.query('INSERT INTO check_sheet_details (check_sheet_id, point_check, check_no, problem, defect_code, qty, location, page_index, confidence, low_confidence_reason) VALUES ?', [detailValues]);
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

// 5. Delete Record (cascade to check_sheet_details and part_check_times)
router.get('/delete/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query('DELETE FROM part_check_times WHERE check_sheet_id = ?', [req.params.id]);
        await pool.query('DELETE FROM check_sheet_details WHERE check_sheet_id = ?', [req.params.id]);
        await pool.query('DELETE FROM check_sheets WHERE id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 6. Analytics Global Summary (KPIs)
router.get('/analytics/summary', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(`
            SELECT 
                SUM(total_prod) as grand_total_prod,
                SUM(total_ok) as grand_total_ok,
                SUM(total_ng) as grand_total_ng,
                SUM(total_ng_point) as grand_total_ng_point,
                SUM(total_scrap) as grand_total_scrap,
                COUNT(id) as total_documents
            FROM check_sheets
        `);
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 7. Analytics Pareto Defect Problem
router.get('/analytics/pareto', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(`
            SELECT problem, SUM(qty) as total_qty
            FROM check_sheet_details
            WHERE problem != 'Tidak ada data NG (All OK)' AND problem != '-'
            GROUP BY problem
            ORDER BY total_qty DESC
        `);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 8. Monthly Recap Report for CSV / Excel
router.get('/reports/monthly', async (req, res) => {
    try {
        const pool = getPool();
        const { month, year, partNumber, model, startDate, endDate } = req.query;
        let query = `
            SELECT 
                cs.id,
                DAY(cs.date) as date_day,
                cs.date,
                cs.shift,
                cs.total_prod,
                cs.total_ng,
                cs.total_scrap,
                cs.inspector,
                csd.check_no as point,
                csd.defect_code as defect,
                csd.qty,
                cs.part_number
            FROM check_sheets cs
            LEFT JOIN check_sheet_details csd ON cs.id = csd.check_sheet_id
            WHERE 1=1
        `;
        const params = [];

        if (month && month !== 'all') {
            query += " AND MONTH(cs.date) = ?";
            params.push(month);
        }
        if (year) {
            query += " AND YEAR(cs.date) = ?";
            params.push(year);
        }
        if (partNumber) {
            query += " AND cs.part_number = ?";
            params.push(partNumber);
        }
        if (model) {
            query += " AND cs.model LIKE ?";
            params.push(`%${model}%`);
        }
        if (startDate) {
            query += " AND cs.date >= ?";
            params.push(startDate);
        }
        if (endDate) {
            query += " AND cs.date <= ?";
            params.push(endDate);
        }

        query += " ORDER BY cs.date ASC, cs.shift ASC, cs.id ASC";

        const [rows] = await pool.query(query, params);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 9. Autocomplete Suggestions for Problems
router.get('/suggestions/problems', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber } = req.query;
        let partSpecificProblems = [];

        if (partNumber) {
            const [partRows] = await pool.query(`
                SELECT problem, COUNT(*) as freq
                FROM check_sheet_details d
                JOIN check_sheets s ON d.check_sheet_id = s.id
                WHERE s.part_number = ? 
                  AND problem != 'Tidak ada data NG (All OK)' 
                  AND problem != '-'
                  AND problem IS NOT NULL
                GROUP BY problem
                ORDER BY freq DESC
                LIMIT 10
            `, [partNumber]);
            partSpecificProblems = partRows.map(r => ({ text: r.problem, type: 'history' }));
        }

        const [globalRows] = await pool.query(`
            SELECT problem, COUNT(*) as freq
            FROM check_sheet_details
            WHERE problem != 'Tidak ada data NG (All OK)' 
              AND problem != '-'
              AND problem IS NOT NULL
            GROUP BY problem
            ORDER BY freq DESC
            LIMIT 20
        `);
        const globalProblems = globalRows.map(r => ({ text: r.problem, type: 'global' }));

        // Combine and unique
        const seen = new Set();
        const combined = [...partSpecificProblems, ...globalProblems].filter(p => {
            const low = p.text.toLowerCase().trim();
            if (seen.has(low)) return false;
            seen.add(low);
            return true;
        });

        res.json({ status: 'success', data: combined });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
