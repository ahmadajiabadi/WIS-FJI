const { getPool } = require('../config/db');
const { performAiScan } = require('../utils/ai');
const path = require('path');
const fs = require('fs');

async function processQueue() {
    let pool;
    try {
        pool = getPool();
    } catch (e) {
        // Pool is not initialized yet, skip this tick
        return;
    }

    try {
        // Get one pending item
        const [rows] = await pool.query("SELECT * FROM scan_drafts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1");
        if (rows.length === 0) return;

        const draft = rows[0];
        await pool.query("UPDATE scan_drafts SET status = 'processing' WHERE id = ?", [draft.id]);

        console.log(`🤖 [Worker] Processing AI Scan for Draft ID: ${draft.id}...`);

        // Prepare images for AI
        let images = [];
        try {
            // Try to parse as JSON array (multi-page)
            images = JSON.parse(draft.image_path);
            if (!Array.isArray(images)) images = [draft.image_path];
        } catch (e) {
            // Not a JSON array, treat as single path
            images = [draft.image_path];
        }

        console.log(`🤖 [Worker] Processing AI Scan for Draft ID: ${draft.id} (${images.length} pages)...`);

        const imageDatas = [];
        for (const imgPath of images) {
            // Resolve image path relative to backend root
            const fullPath = path.join(__dirname, '..', imgPath);
            if (fs.existsSync(fullPath)) {
                const base64 = fs.readFileSync(fullPath).toString('base64');
                const mimeType = 'image/' + path.extname(imgPath).substring(1).replace('jpg', 'jpeg');
                imageDatas.push({ base64, mimeType });
            } else {
                console.warn(`⚠️ [Worker] File not found: ${fullPath}`);
            }
        }

        if (imageDatas.length === 0) {
            await pool.query("UPDATE scan_drafts SET status = 'error', error_message = 'No valid images found' WHERE id = ?", [draft.id]);
            return;
        }

        // Run AI Scan
        const result = await performAiScan(imageDatas);

        if (result.success) {
            await pool.query("UPDATE scan_drafts SET status = 'ready', scan_data = ?, model_used = ? WHERE id = ?", [JSON.stringify(result.data), result.modelUsed, draft.id]);
            console.log(`✅ [Worker] Draft ID ${draft.id} is READY (Model: ${result.modelUsed})`);
        } else {
            await pool.query("UPDATE scan_drafts SET status = 'error', error_message = ? WHERE id = ?", [result.message, draft.id]);
            console.error(`❌ [Worker] Draft ID ${draft.id} failed: ${result.message}`);
        }
    } catch (err) {
        console.error('❌ [Worker] Queue Processor Error:', err.message);
    }
}

function startQueueWorker() {
    console.log('🤖 Background Scan Queue Worker active');
    // Loop worker every 5 seconds
    setInterval(processQueue, 5000);
}

module.exports = {
    startQueueWorker
};
