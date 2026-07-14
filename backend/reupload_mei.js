const mysql = require('mysql2/promise');
require('dotenv').config();
const http = require('http');

const allFiles = [
    { path: "UPLOAD DATA BULANAN/D02A - BULAN MEI.xlsx", model: "D02A" },
    { path: "UPLOAD DATA BULANAN/D14N - BULAN MEI.xlsx", model: "D14N" },
    { path: "UPLOAD DATA BULANAN/D26A (FRONT) - BULAN MEI.xlsx", model: "D26A" },
    { path: "UPLOAD DATA BULANAN/D26A(REAR) - BULAN MEI.xlsx", model: "D26A" },
    { path: "UPLOAD DATA BULANAN/D27A - BULAN MEI.xlsx", model: "D27A" },
    { path: "UPLOAD DATA BULANAN/D37A - BULAN MEI.xlsx", model: "D37A" },
    { path: "UPLOAD DATA BULANAN/D37D - BULAN MEI.xlsx", model: "D37D" },
    { path: "UPLOAD DATA BULANAN/D52B - BULAN MEI.xlsx", model: "D52B" },
    { path: "UPLOAD DATA BULANAN/D55L - BULAN MEI.xlsx", model: "D55L" },
    { path: "UPLOAD DATA BULANAN/D74A - BULAN MEI.xlsx", model: "D74A" },
    { path: "UPLOAD DATA BULANAN/D79L - BULAN MEI.xlsx", model: "D79L" },
];

const baseDir = "C:\\xampp\\htdocs\\Scanner CS\\backend\\";

function postJSON(url, data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const u = new URL(url);
        const opts = {
            hostname: u.hostname, port: u.port, path: u.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        };
        const req = http.request(opts, (res) => {
            let resp = '';
            res.on('data', (c) => resp += c);
            res.on('end', () => {
                try { resolve(JSON.parse(resp)); }
                catch (e) { reject(new Error('Invalid JSON: ' + resp)); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

(async () => {
    // 1. Delete old BULANAN records
    console.log('=== Deleting old BULANAN records ===');
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, user: process.env.DB_USER,
        password: process.env.DB_PASS, database: process.env.DB_NAME
    });
    const [r] = await c.query("SELECT COUNT(*) as cnt FROM check_sheets WHERE inspector='BULANAN'");
    console.log('Existing BULANAN records:', r[0].cnt);
    await c.query("DELETE FROM check_sheet_details WHERE check_sheet_id IN (SELECT id FROM check_sheets WHERE inspector='BULANAN')");
    const [d] = await c.query("DELETE FROM check_sheets WHERE inspector='BULANAN'");
    console.log('Deleted:', d.affectedRows);
    await c.end();

    // 2. Re-upload all files
    let totalInserted = 0;
    let totalSkipped = 0;
    for (const f of allFiles) {
        const filePath = baseDir + f.path;
        console.log(`\n--- ${f.path} (model=${f.model}) ---`);
        try {
            const result = await postJSON('http://localhost:3000/api/upload-monthly', {
                filePath: filePath,
                model: f.model
            });
            if (result.status === 'success') {
                totalInserted += result.data.totalInserted;
                totalSkipped += result.data.totalSkipped;
                console.log(`✅ ${result.data.totalInserted} inserted, ${result.data.totalSkipped} skipped`);
                for (const [part, cnt] of Object.entries(result.data.parts)) {
                    console.log(`   ${part}: ${cnt}x`);
                }
            } else {
                console.log(`❌ Error: ${result.message}`);
            }
        } catch (err) {
            console.log(`❌ Failed: ${err.message}`);
        }
    }
    console.log(`\n=== GRAND TOTAL: ${totalInserted} inserted, ${totalSkipped} skipped across ${allFiles.length} files ===`);
})();
