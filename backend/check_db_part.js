require('dotenv').config();
const mysql = require('mysql2/promise');
const { getPool, initDB } = require('./config/db');

async function run() {
    await initDB();
    const pool = getPool();
    const sheetId = 13024;

    // Checksheet metadata
    const [cs] = await pool.query("SELECT id, total_prod, total_ok, total_ng, total_scrap FROM check_sheets WHERE id = ?", [sheetId]);
    console.log("Checksheet metadata:", cs[0]);

    // Actual checks from part_check_times
    const [checks] = await pool.query(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN judgment = 'OK' THEN 1 ELSE 0 END) as ok,
            SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as ng,
            SUM(CASE WHEN judgment = 'SCRAP' THEN 1 ELSE 0 END) as scrap
         FROM part_check_times 
         WHERE check_sheet_id = ? OR session_id = (SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1)`,
        [sheetId, sheetId]
    );
    console.log("Actual checks (stasiun):", checks[0]);

    // Actual checks for LH part only
    const [lhChecks] = await pool.query(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN judgment = 'OK' THEN 1 ELSE 0 END) as ok,
            SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as ng,
            SUM(CASE WHEN judgment = 'SCRAP' THEN 1 ELSE 0 END) as scrap
         FROM part_check_times 
         WHERE (check_sheet_id = ? OR session_id = (SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1))
           AND part_number = '79204-BZ020'`,
        [sheetId, sheetId]
    );
    console.log("Actual checks (LH only):", lhChecks[0]);

    // Actual checks for RH part only
    const [rhChecks] = await pool.query(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN judgment = 'OK' THEN 1 ELSE 0 END) as ok,
            SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as ng,
            SUM(CASE WHEN judgment = 'SCRAP' THEN 1 ELSE 0 END) as scrap
         FROM part_check_times 
         WHERE (check_sheet_id = ? OR session_id = (SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1))
           AND part_number = '79203-BZ100'`,
        [sheetId, sheetId]
    );
    console.log("Actual checks (RH only):", rhChecks[0]);

    await pool.end();
}

run();
