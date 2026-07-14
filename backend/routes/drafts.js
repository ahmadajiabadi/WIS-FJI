const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../config/db');
const { performAiScan } = require('../utils/ai');
const upload = require('../middlewares/upload');

const router = express.Router();

// 1. Instant AI Scan (Direct scan without background queue)
router.post('/scan', async (req, res) => {
    try {
        const { image, mimeType, images, customApiKey } = req.body;
        let finalImages = images || [];
        if (image && mimeType && finalImages.length === 0) {
            finalImages.push({ base64: image, mimeType });
        }

        const result = await performAiScan(finalImages, customApiKey);
        if (result.success) {
            res.json({ status: 'success', data: result.data, modelUsed: `Gemini: ${result.modelUsed}` });
        } else {
            res.status(500).json({ status: 'error', message: result.message });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Batch Upload (Pushes files into pending queue)
router.post('/upload-batch', upload.array('files'), async (req, res) => {
    try {
        const pool = getPool();
        const files = req.files;
        const { mode } = req.body; // 'separate' or 'combined'
        if (!files || files.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No files uploaded' });
        }

        if (mode === 'combined') {
            const relativePaths = files.map(file => 'uploads/' + file.filename);
            await pool.query("INSERT INTO scan_drafts (image_path, status) VALUES (?, 'pending')", [JSON.stringify(relativePaths)]);
            res.json({ status: 'success', message: `1 draft gabungan (${files.length} halaman) dimasukkan ke antrean.` });
        } else {
            const insertPromises = files.map(file => {
                const relativePath = 'uploads/' + file.filename;
                return pool.query("INSERT INTO scan_drafts (image_path, status) VALUES (?, 'pending')", [relativePath]);
            });
            await Promise.all(insertPromises);
            res.json({ status: 'success', message: `${files.length} file dimasukkan ke antrean secara terpisah.` });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. Get Drafts list
router.get('/drafts', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT * FROM scan_drafts ORDER BY created_at DESC");
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 4. Delete Draft (and physically remove images)
router.delete('/drafts/:id', async (req, res) => {
    try {
        const pool = getPool();
        // Also delete the physical file(s)
        const [rows] = await pool.query("SELECT image_path FROM scan_drafts WHERE id = ?", [req.params.id]);
        if (rows.length > 0 && rows[0].image_path) {
            let images = [];
            try {
                images = JSON.parse(rows[0].image_path);
                if (!Array.isArray(images)) images = [rows[0].image_path];
            } catch (e) {
                images = [rows[0].image_path];
            }

            images.forEach(imgPath => {
                const fullPath = path.join(__dirname, '..', imgPath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            });
        }
        await pool.query("DELETE FROM scan_drafts WHERE id = ?", [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 5. Retry failed draft
router.post('/drafts/retry/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.query("UPDATE scan_drafts SET status = 'pending', error_message = NULL WHERE id = ?", [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 6. Update Draft (Save current progress)
router.put('/drafts/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { meta, summary, details, notes } = req.body;
        const scanData = { meta, summary, details };
        await pool.query("UPDATE scan_drafts SET scan_data = ?, notes = ? WHERE id = ?", [JSON.stringify(scanData), notes || '', req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 7. Approve Draft (Finalizing and saving draft to final database tables)
router.post('/drafts/approve/:id', async (req, res) => {
    const pool = getPool();
    const { meta, summary, details, notes } = req.body;
    
    // Log approval event
    try {
        const logFile = path.join(__dirname, '..', 'save_log.txt');
        fs.appendFileSync(logFile, "APPROVE ID " + req.params.id + ": " + JSON.stringify(details) + "\n");
    } catch (e) {
        console.error("Failed to append approve log", e);
    }

    if (!meta || !summary) {
        return res.status(400).json({ status: 'error', message: 'Data meta atau summary tidak lengkap.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get draft info for image_path
        const [draftRows] = await connection.query("SELECT image_path FROM scan_drafts WHERE id = ?", [req.params.id]);
        const imagePath = draftRows.length > 0 ? draftRows[0].image_path : null;

        // 1. Save to check_sheets
        const [headerResult] = await connection.query(`
            INSERT INTO check_sheets (part_name, part_number, model, inspector, shift, line_pos, date, total_prod, total_ok, total_ng, total_ng_point, total_scrap, image_path, notes, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            parseInt(summary.totalNGPoint) || 0,
            parseInt(summary.totalScrap) || 0, 
            imagePath, 
            notes || '',
            (summary.confidenceScore !== undefined && summary.confidenceScore !== null) ? parseInt(summary.confidenceScore) : 100
        ]);
        
        const checkSheetId = headerResult.insertId;

        // 2. Save details
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

        // 3. Delete from drafts queue
        await connection.query("DELETE FROM scan_drafts WHERE id = ?", [req.params.id]);

        await connection.commit();
        res.json({ status: 'success', id: checkSheetId });
    } catch (err) {
        await connection.rollback();
        console.error("Approve Draft Error:", err);
        res.status(500).json({ status: 'error', message: "Gagal menyimpan ke database: " + err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;

