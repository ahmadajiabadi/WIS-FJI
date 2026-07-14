const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

function calculateActiveMinAndEff(rows, breaks, masterTakt, isDualSide = false) {
    if (!rows || rows.length === 0) return { activeMin: 0, expected: 0, efficiency: 100 };
    
    // Build hourly buckets (00:00-23:00)
    const hourly = {};
    for (let h = 0; h < 24; h++) {
        hourly[h] = { checks: 0, total_duration: 0, minTs: Infinity, maxTs: -Infinity };
    }

    rows.forEach(r => {
        const d = new Date(r.check_start);
        const h = d.getHours();
        hourly[h].checks++;
        hourly[h].total_duration += Number(r.duration_sec || 0);
        const tsMs = d.getTime();
        if (tsMs < hourly[h].minTs) hourly[h].minTs = tsMs;
        const endTsMs = r.check_end ? new Date(r.check_end).getTime() : tsMs;
        if (endTsMs > hourly[h].maxTs) hourly[h].maxTs = endTsMs;
    });

    const timeToMinutes = (t) => { const p = (t || '00:00:00').split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
    const msToHourMin = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

    let totalActiveMin = 0;
    let totalExpected = 0;

    for (let h = 0; h < 24; h++) {
        const bucket = hourly[h];
        if (bucket.checks === 0) continue;

        const activeSpanMs = bucket.maxTs - bucket.minTs;
        const activeSpanMin = activeSpanMs > 0 && bucket.checks > 1
            ? activeSpanMs / 60000
            : bucket.total_duration / 60;

        const activeStartMin = msToHourMin(bucket.minTs);
        const activeEndMin = activeStartMin + activeSpanMin;
        let breakMinutes = 0;
        breaks.forEach(b => {
            const bStart = timeToMinutes(b.start_time);
            const bEnd = timeToMinutes(b.end_time);
            const overlapStart = Math.max(activeStartMin, bStart);
            const overlapEnd = Math.min(activeEndMin, bEnd);
            if (overlapEnd > overlapStart) breakMinutes += (overlapEnd - overlapStart);
        });

        const activeMin = Math.max(0, activeSpanMin - breakMinutes);
        totalActiveMin += activeMin;
        
        const availableSec = activeMin * 60;
        const expected = availableSec > 0 && masterTakt > 0 ? Math.floor(availableSec / masterTakt) : 0;
        totalExpected += expected;
    }

    const checks = isDualSide ? rows.length / 2 : rows.length;
    const finalEff = totalExpected > 0 ? Math.min(100, Math.round((checks / totalExpected) * 100)) : 100;
    return {
        activeMin: Math.round(totalActiveMin * 10) / 10,
        expected: totalExpected,
        efficiency: finalEff
    };
}

// 1. Get available years and monthly OK ratios (Frame & Point OK Ratios) for a given year
router.get('/dashboard/yearly-ratios', async (req, res) => {
    try {
        const pool = getPool();
        // 1. Get available years
        const [yearRows] = await pool.query(`
            SELECT DISTINCT YEAR(date) AS year 
            FROM check_sheets 
            WHERE date IS NOT NULL 
            ORDER BY year DESC
        `);
        
        const availableYears = yearRows.map(r => r.year);
        let selectedYear = parseInt(req.query.year);
        
        if (!selectedYear) {
            selectedYear = availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
        }

        // 2. Fetch monthly sums for selected year
        const [rows] = await pool.query(`
            SELECT 
                MONTH(cs.date) as month,
                SUM(cs.total_prod) as total_prod,
                SUM(cs.total_ng) as total_ng,
                SUM(cs.total_ng_point) as total_ng_point,
                SUM(COALESCE(pm.total_points, 0) * cs.total_prod) as max_points
            FROM check_sheets cs
            LEFT JOIN part_master pm ON cs.part_number = pm.part_number
            WHERE YEAR(cs.date) = ?
            GROUP BY MONTH(cs.date)
        `, [selectedYear]);

        // Create a 12-month array initialized with null (no data = empty, not 100%)
        const frameRatios = Array(12).fill(null);
        const pointRatios = Array(12).fill(null);

        rows.forEach(row => {
            const monthIdx = row.month - 1; // 0-indexed
            const prod = Number(row.total_prod || 0);
            const ng = Number(row.total_ng || 0);
            const ngPoint = Number(row.total_ng_point || 0);
            const maxPts = Number(row.max_points || 0);

            // Only fill months that actually have production data
            if (prod > 0) {
                // Frame OK Ratio = ((total_prod - total_ng) / total_prod) * 100
                frameRatios[monthIdx] = Number((((prod - ng) / prod) * 100).toFixed(2));

                // Point OK Ratio = (((max_points - total_ng_point) / max_points) * 100)
                // If total_points is not configured for the part, fall back to Frame ratio
                if (maxPts > 0) {
                    pointRatios[monthIdx] = Number((((maxPts - ngPoint) / maxPts) * 100).toFixed(2));
                } else {
                    // No total_points configured - use frame ratio as fallback
                    pointRatios[monthIdx] = frameRatios[monthIdx];
                }
            }
            // months with prod === 0 stay null (shown as gap in chart)
        });

        res.json({
            status: 'success',
            selectedYear,
            availableYears: availableYears.length > 0 ? availableYears : [new Date().getFullYear()],
            frameRatios,
            pointRatios
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Advanced Dashboard Summary with Date Range
router.get('/dashboard/advanced', async (req, res) => {
    const { startDate, endDate } = req.query;
    let dateFilter = "";
    let params = [];
    
    const hasStart = startDate !== undefined && startDate !== null && startDate.trim() !== "";
    const hasEnd = endDate !== undefined && endDate !== null && endDate.trim() !== "";

    if (hasStart || hasEnd) {
        if (!hasStart && hasEnd) {
            dateFilter = " WHERE date <= ?";
            params = [endDate];
        } else if (hasStart && !hasEnd) {
            dateFilter = " WHERE date >= ?";
            params = [startDate];
        } else {
            dateFilter = " WHERE date BETWEEN ? AND ?";
            params = [startDate, endDate];
        }
    } else {
        dateFilter = " WHERE date >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }

    try {
        const pool = getPool();
        // 1. KPI Summary
        const [summary] = await pool.query(`
            SELECT 
                SUM(cs.total_prod) as total_prod,
                SUM(cs.total_ng) as total_ng_frame,
                SUM(cs.total_ng_point) as total_ng_point,
                SUM(COALESCE(pm.total_points, 0) * cs.total_prod) as max_points,
                COALESCE(SUM(cs.total_check_time), 0) as total_check_time,
                COALESCE(SUM(cs.total_checks), 0) as total_checks,
                COALESCE(AVG(CASE WHEN cs.input_mode = 'voice' THEN cs.efficiency ELSE NULL END), 0) as avg_efficiency
            FROM check_sheets cs
            LEFT JOIN part_master pm ON cs.part_number = pm.part_number
            ${dateFilter.replace(/\bdate\b/g, 'cs.date')}
        `, params);

        // 2. Trend NG Ratio (%) - (Total NG / Total Prod) * 100
        const [trend] = await pool.query(`
            SELECT 
                date,
                SUM(total_prod) as prod,
                SUM(total_ng) as ng
            FROM check_sheets
            ${dateFilter}
            GROUP BY date
            ORDER BY date ASC
        `, params);

        // 2b. Monthly Efficiency Trend
        const effFilter = dateFilter.replace(/\bdate\b/g, 'cs.date');
        const [effTrend] = await pool.query(`
            SELECT 
                DATE_FORMAT(cs.date, '%Y-%m-01') as month,
                AVG(CASE WHEN cs.input_mode = 'voice' THEN cs.efficiency ELSE NULL END) as avg_efficiency,
                SUM(CASE WHEN cs.input_mode = 'voice' THEN cs.total_checks ELSE 0 END) as total_checks
            FROM check_sheets cs
            ${effFilter}
            GROUP BY DATE_FORMAT(cs.date, '%Y-%m-01')
            ORDER BY month ASC
        `, params);

        // 3. Top Problematic Parts (By NG Ratio)
        const [topParts] = await pool.query(`
            SELECT 
                part_number, 
                model,
                SUM(total_prod) as total_prod,
                SUM(total_ng) as total_ng_frame,
                (SUM(total_ng) / SUM(total_prod) * 100) as ng_ratio
            FROM check_sheets
            ${dateFilter}
            GROUP BY part_number, model
            HAVING total_prod > 0
            ORDER BY ng_ratio DESC
            LIMIT 5
        `, params);

        // 4. Global Pareto (Defect Codes)
        const paretoParams = [...params];
        const paretoFilter = dateFilter.replace('WHERE date', 'WHERE s.date');
        const [pareto] = await pool.query(`
            SELECT 
                d.defect_code,
                SUM(d.qty) as total_qty
            FROM check_sheet_details d
            JOIN check_sheets s ON d.check_sheet_id = s.id
            ${paretoFilter}
            GROUP BY d.defect_code
            ORDER BY total_qty DESC
        `, paretoParams);

        // 5. Line/Pos (Machine) Breakdown
        const lineFilter = dateFilter + " AND line_pos IS NOT NULL AND line_pos != ''";
        const [lines] = await pool.query(`
            SELECT 
                line_pos, 
                SUM(total_prod) as total_prod,
                SUM(total_ng) as total_ng_frame,
                SUM(total_ng_point) as total_ng_point,
                IF(SUM(total_prod) > 0, (SUM(total_ng) / SUM(total_prod) * 100), 0) as ng_ratio
            FROM check_sheets
            ${lineFilter}
            GROUP BY line_pos
            ORDER BY total_ng_frame DESC, total_ng_point DESC
            LIMIT 5
        `, params);

        res.json({
            status: 'success',
            summary: summary[0] || {},
            trend: trend.map(t => ({
                date: t.date,
                ratio: t.prod > 0 ? (t.ng / t.prod * 100).toFixed(2) : 0
            })),
            efficiencyTrend: effTrend.map(t => ({
                month: t.month,
                avg_efficiency: Number(t.avg_efficiency).toFixed(1),
                total_checks: Number(t.total_checks)
            })),
            topParts,
            pareto,
            lines
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. POST Live Update per side (flat payload, one row per inspector+side)
router.post('/dashboard/live-update', async (req, res) => {
    try {
        const pool = getPool();
        const { inspector, side, shift, linePos, partNumber, partName, model, totalOk, totalNg, totalScrap, problemsList, efficiency, totalCheckTime, totalChecks } = req.body;
        
        if (!inspector) {
            return res.status(400).json({ status: 'error', message: 'Inspector name is required' });
        }
        if (!side || !['KIRI', 'KANAN'].includes(side)) {
            return res.status(400).json({ status: 'error', message: 'Side must be KIRI or KANAN' });
        }

        const problemsListJson = JSON.stringify(problemsList || []);

        // Base INSERT (always works regardless of migration state)
        const baseParams = [inspector, side, shift || '', linePos || '', partNumber || '', partName || '', model || '', parseInt(totalOk) || 0, parseInt(totalNg) || 0, parseInt(totalScrap) || 0, problemsListJson];
        try {
            await pool.query(`
                INSERT INTO live_qc_monitoring 
                    (inspector, side, shift, line_pos, part_number, part_name, model, total_ok, total_ng, total_scrap, efficiency, total_check_time, total_checks, problems_list, side_data, last_update)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW())
                ON DUPLICATE KEY UPDATE
                    shift = VALUES(shift),
                    line_pos = VALUES(line_pos),
                    part_number = VALUES(part_number),
                    part_name = VALUES(part_name),
                    model = VALUES(model),
                    total_ok = VALUES(total_ok),
                    total_ng = VALUES(total_ng),
                    total_scrap = VALUES(total_scrap),
                    efficiency = VALUES(efficiency),
                    total_check_time = VALUES(total_check_time),
                    total_checks = VALUES(total_checks),
                    problems_list = VALUES(problems_list),
                    last_update = NOW()
            `, [...baseParams.slice(0, -1), parseInt(efficiency) || 0, parseInt(totalCheckTime) || 0, parseInt(totalChecks) || 0, problemsListJson]);
        } catch (_) {
            // Fallback: columns may not exist yet (before migration runs)
            await pool.query(`
                INSERT INTO live_qc_monitoring 
                    (inspector, side, shift, line_pos, part_number, part_name, model, total_ok, total_ng, total_scrap, problems_list, side_data, last_update)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW())
                ON DUPLICATE KEY UPDATE
                    shift = VALUES(shift),
                    line_pos = VALUES(line_pos),
                    part_number = VALUES(part_number),
                    part_name = VALUES(part_name),
                    model = VALUES(model),
                    total_ok = VALUES(total_ok),
                    total_ng = VALUES(total_ng),
                    total_scrap = VALUES(total_scrap),
                    problems_list = VALUES(problems_list),
                    last_update = NOW()
            `, baseParams);
        }

        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 4. POST Live Delete Operator Session
router.post('/dashboard/live-delete', async (req, res) => {
    try {
        const pool = getPool();
        const { inspector } = req.body;
        
        if (!inspector) {
            return res.status(400).json({ status: 'error', message: 'Inspector name is required' });
        }

        await pool.query("DELETE FROM live_qc_monitoring WHERE inspector = ?", [inspector]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 5. GET Live active operator sessions (for supervisor monitoring)
router.get('/dashboard/live-sessions', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber, linePos } = req.query;
        
        let query = "SELECT * FROM live_qc_monitoring WHERE 1=1";
        const params = [];

        if (partNumber) {
            query += " AND part_number = ?";
            params.push(partNumber);
        }
        if (linePos) {
            query += " AND line_pos = ?";
            params.push(linePos);
        }

        query += " ORDER BY last_update DESC";

        const [rows] = await pool.query(query, params);

        // Get today's date string for abnormality count
        const todayStr = new Date().toISOString().split('T')[0];
        const dayOfWeek = new Date().getDay() + 1;
        const [breaks] = await pool.query(
            `SELECT start_time, end_time FROM timer_breaks WHERE
                CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                AND active = 1 ORDER BY start_time ASC`,
            [dayOfWeek]
        );
        const timeToMinutes = (t) => { const p = (t || '00:00:00').split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
        const msToHourMin = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
        
        const parsedRows = [];
        for (const r of rows) {
            // Count abnormality records for this inspector today
            const [abnRows] = await pool.query(
                'SELECT COUNT(*) as cnt FROM abnormality_records WHERE inspector = ? AND date = ?',
                [r.inspector, todayStr]
            );

            // Fetch actual durations and check counts from part_check_times
            const [partRows] = await pool.query('SELECT takt_time, side_type, paired_part_number FROM part_master WHERE part_number = ? LIMIT 1', [r.part_number]);
            const rawTakt = partRows.length > 0 ? Number(partRows[0].takt_time || 60) : 60;
            const sideType = partRows.length > 0 ? (partRows[0].side_type || '').toLowerCase() : '';
            const pairedPartNumber = partRows.length > 0 ? partRows[0].paired_part_number : null;
            const isDualSide = (sideType === 'lh' || sideType === 'rh' || sideType === 'kiri' || sideType === 'kanan') && pairedPartNumber;
            const masterTakt = isDualSide ? rawTakt * 2 : rawTakt;

            const partNumbersToFetch = [r.part_number];
            if (pairedPartNumber) {
                partNumbersToFetch.push(pairedPartNumber);
            }

            const [checkRows] = await pool.query(
                `SELECT check_start, check_end, duration_sec, judgment, side FROM part_check_times
                 WHERE part_number IN (?) AND inspector = ? AND DATE(check_start) = ?`,
                [partNumbersToFetch, r.inspector, todayStr]
            );

            // Filter sideChecks for specific side metrics
            const sideChecks = checkRows.filter(row => {
                const rowSide = (row.side || '').toLowerCase();
                const rSide = (r.side || '').toLowerCase();
                return rowSide === rSide || 
                       (rSide === 'kiri' && rowSide === 'lh') || 
                       (rSide === 'kanan' && rowSide === 'rh') ||
                       (rSide === 'lh' && rowSide === 'kiri') ||
                       (rSide === 'rh' && rowSide === 'kanan');
            });

            let c = sideChecks.length;
            let t = sideChecks.reduce((sum, row) => sum + Number(row.duration_sec || 0), 0);
            let activeMin = t / 60;
            let finalEff = r.efficiency || 0;
            let okCount = sideChecks.filter(row => row.judgment === 'OK').length;
            let ngCount = sideChecks.filter(row => row.judgment === 'NG').length;
            let scrapCount = sideChecks.filter(row => row.judgment === 'SCRAP').length;

            if (checkRows.length > 0) {
                const calc = calculateActiveMinAndEff(checkRows, breaks, masterTakt, isDualSide);
                activeMin = calc.activeMin;
                finalEff = calc.efficiency;
            }

            parsedRows.push({
                id: r.id,
                inspector: r.inspector,
                side: r.side,
                shift: r.shift,
                line_pos: r.line_pos,
                part_number: r.part_number,
                part_name: r.part_name,
                model: r.model,
                total_ok: okCount,
                total_ng: ngCount,
                total_scrap: scrapCount,
                total_abnormality: abnRows[0].cnt,
                efficiency: finalEff,
                total_check_time: t,
                total_checks: c,
                problems_list: typeof r.problems_list === 'string' ? JSON.parse(r.problems_list) : (r.problems_list || []),
                last_update: r.last_update
            });
        }

        res.json({ status: 'success', data: parsedRows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 6. GET Asakai Dashboard data (daily morning meeting summary)
router.get('/dashboard/asakai', async (req, res) => {
    try {
        const pool = getPool();
        const date = req.query.date || new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        const prevDateObj = new Date(date);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDate = prevDateObj.toISOString().split('T')[0];

        const fetchDayData = async (targetDate) => {
            // Fetch raw check sheets
            const [rawSheets] = await pool.query(`
                SELECT 
                    cs.id,
                    cs.line_pos,
                    cs.model,
                    cs.part_number,
                    cs.part_name,
                    cs.total_prod,
                    cs.total_ok,
                    cs.total_ng,
                    cs.total_ng_point,
                    cs.total_scrap,
                    cs.timestart,
                    cs.timeend,
                    cs.total_checks,
                    cs.takt_time_sec,
                    cs.efficiency,
                    cs.input_mode,
                    COALESCE((SELECT pm2.total_points FROM part_master pm2 WHERE pm2.part_number = cs.part_number AND pm2.model = cs.model LIMIT 1), 0) as total_points
                FROM check_sheets cs
                WHERE cs.date = ?
            `, [targetDate]);

            // Load breaks
            const dayOfWeek = new Date(targetDate + 'T00:00:00').getDay() + 1;
            const [breaks] = await pool.query(
                `SELECT start_time, end_time FROM timer_breaks WHERE 
                    CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                    AND active = 1`,
                [dayOfWeek]
            );

            const timeToMinutes = (t) => { const p = (t || '00:00:00').split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
            const calcBreakOverlap = (startMs, endMs, breaks, dayStartMs) => {
                let total = 0;
                breaks.forEach(b => {
                    const bStart = dayStartMs + timeToMinutes(b.start_time) * 60000;
                    const bEnd = dayStartMs + timeToMinutes(b.end_time) * 60000;
                    const overlapStart = Math.max(startMs, bStart);
                    const overlapEnd = Math.min(endMs, bEnd);
                    if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / 60000;
                });
                return total;
            };

            async function calculateExpectedForSheetDashboard(sheetId, masterTakt, pairedTakt, isDualSide, breaks, date, masterPart, pairedPart) {
                const [csRows] = await pool.query("SELECT DATE_FORMAT(date, '%Y-%m-%d') as formatted_date FROM check_sheets WHERE id = ? LIMIT 1", [sheetId]);
                const targetDate = csRows.length > 0 ? csRows[0].formatted_date : date;

                const [sessionRows] = await pool.query(
                    'SELECT session_id FROM part_check_times WHERE check_sheet_id = ? AND session_id IS NOT NULL AND session_id != "" LIMIT 1',
                    [sheetId]
                );

                let rows = [];
                if (sessionRows.length > 0 && sessionRows[0].session_id) {
                    const sessionId = sessionRows[0].session_id;
                    [rows] = await pool.query(
                        `SELECT side, part_number, check_start, check_end, duration_sec, takt_time_sec FROM part_check_times 
                         WHERE DATE(check_start) = ? AND session_id = ? ORDER BY check_start ASC`,
                        [targetDate, sessionId]
                    );
                } else {
                    [rows] = await pool.query(
                        `SELECT side, part_number, check_start, check_end, duration_sec, takt_time_sec FROM part_check_times 
                         WHERE DATE(check_start) = ? AND check_sheet_id = ? ORDER BY check_start ASC`,
                        [targetDate, sheetId]
                    );
                }
                if (rows.length === 0) return 0;

                const sides = isDualSide ? ['KIRI', 'KANAN'] : ['all'];
                let totalExpected = 0;

                const msToHourMin = (ms) => {
                    const d = new Date(ms);
                    return d.getHours() * 60 + d.getMinutes();
                };

                for (const sideVal of sides) {
                    const filteredRows = rows.filter(r => {
                        if (sideVal === 'all') return true;
                        const rPart = r.part_number;
                        if (sideVal === 'KIRI') {
                            return rPart === masterPart;
                        } else if (sideVal === 'KANAN') {
                            return rPart === pairedPart;
                        }
                        return false;
                    });

                    if (filteredRows.length === 0) continue;

                    const hourlyBuckets = {};
                    filteredRows.forEach(r => {
                        const d = new Date(r.check_start);
                        const h = d.getHours();
                        if (!hourlyBuckets[h]) {
                            hourlyBuckets[h] = {
                                minTs: d.getTime(),
                                maxTs: d.getTime(),
                                checksCount: 0,
                                totalDuration: 0
                            };
                        }
                        hourlyBuckets[h].checksCount++;
                        hourlyBuckets[h].totalDuration += Number(r.duration_sec);
                        const tsMs = d.getTime();
                        if (tsMs < hourlyBuckets[h].minTs) hourlyBuckets[h].minTs = tsMs;
                        if (r.check_end) {
                            const endTsMs = new Date(r.check_end).getTime();
                            if (endTsMs > hourlyBuckets[h].maxTs) hourlyBuckets[h].maxTs = endTsMs;
                        } else {
                            if (tsMs > hourlyBuckets[h].maxTs) hourlyBuckets[h].maxTs = tsMs;
                        }
                    });

                    const targetTakt = isDualSide ? (masterTakt + pairedTakt) : masterTakt;

                    for (const h in hourlyBuckets) {
                        const bucket = hourlyBuckets[h];
                        const activeSpanMs = bucket.maxTs - bucket.minTs;
                        const activeSpanMin = activeSpanMs > 0 && bucket.checksCount > 1
                            ? activeSpanMs / 60000
                            : bucket.totalDuration / 60;

                        const activeStartMin = msToHourMin(bucket.minTs);
                        const activeEndMin = activeStartMin + activeSpanMin;
                        let breakMinutes = 0;
                        breaks.forEach(b => {
                            const bParts = b.start_time.split(':');
                            const bStart = parseInt(bParts[0]) * 60 + parseInt(bParts[1]);
                            const eParts = b.end_time.split(':');
                            const bEnd = parseInt(eParts[0]) * 60 + parseInt(eParts[1]);
                            const overlapStart = Math.max(activeStartMin, bStart);
                            const overlapEnd = Math.min(activeEndMin, bEnd);
                            if (overlapEnd > overlapStart) breakMinutes += (overlapEnd - overlapStart);
                        });
                        const activeMin = Math.max(0, activeSpanMin - breakMinutes);
                        const expected = targetTakt > 0 ? Math.floor((activeMin * 60) / targetTakt) : 0;
                        totalExpected += expected;
                    }
                }
                return totalExpected;
            }

            const sheetsWithEff = [];
            for (const cs of rawSheets) {
                let eff = cs.efficiency !== null ? Number(cs.efficiency) : null;
                let hasEff = (eff !== null);
                let realChecks = Number(cs.total_checks || 0);
                let realOk = cs.total_ok;
                let realNg = cs.total_ng;
                let realScrap = cs.total_scrap;

                if (cs.input_mode === 'voice') {
                    // Query actual counts from part_check_times (using check_sheet_id or session_id)
                    const [sessionRows] = await pool.query(
                        'SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1',
                        [cs.id]
                    );
                    let sql = '';
                    let params = [];
                    if (sessionRows.length > 0 && sessionRows[0].session_id) {
                        sql = `SELECT 
                                    COUNT(*) as total,
                                    SUM(CASE WHEN judgment = 'OK' THEN 1 ELSE 0 END) as ok,
                                    SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as ng,
                                    SUM(CASE WHEN judgment = 'SCRAP' THEN 1 ELSE 0 END) as scrap
                               FROM part_check_times 
                               WHERE session_id = ? AND part_number = ?`;
                        params = [sessionRows[0].session_id, cs.part_number];
                    } else {
                        sql = `SELECT 
                                    COUNT(*) as total,
                                    SUM(CASE WHEN judgment = 'OK' THEN 1 ELSE 0 END) as ok,
                                    SUM(CASE WHEN judgment = 'NG' THEN 1 ELSE 0 END) as ng,
                                    SUM(CASE WHEN judgment = 'SCRAP' THEN 1 ELSE 0 END) as scrap
                               FROM part_check_times 
                               WHERE check_sheet_id = ? AND part_number = ?`;
                        params = [cs.id, cs.part_number];
                    }
                    
                    const [actualRows] = await pool.query(sql, params);
                    if (actualRows.length > 0 && actualRows[0].total > 0) {
                        realChecks = actualRows[0].total || 0;
                        realOk = Number(actualRows[0].ok || 0);
                        realNg = Number(actualRows[0].ng || 0);
                        realScrap = Number(actualRows[0].scrap || 0);
                    }
                }

                // Fetch part master to check if dual side
                const [pmRows] = await pool.query(
                    'SELECT paired_part_number, takt_time FROM part_master WHERE part_number = ? LIMIT 1',
                    [cs.part_number]
                );
                let isDualSide = false;
                let masterTakt = 60;
                let pairedTakt = 0;
                let pairedPartNumber = null;
                if (pmRows.length > 0) {
                    masterTakt = pmRows[0].takt_time || 60;
                    pairedPartNumber = pmRows[0].paired_part_number;
                    isDualSide = !!pairedPartNumber;
                    if (pairedPartNumber) {
                        const [pairedRows] = await pool.query('SELECT takt_time FROM part_master WHERE part_number = ? LIMIT 1', [pairedPartNumber]);
                        if (pairedRows.length > 0) {
                            pairedTakt = pairedRows[0].takt_time || 60;
                        }
                    }
                }

                if (isDualSide) {
                    let stasiunChecks = realChecks;
                    const [sessionRows] = await pool.query(
                        'SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1',
                        [cs.id]
                    );
                    if (sessionRows.length > 0 && sessionRows[0].session_id) {
                        const sessionId = sessionRows[0].session_id;

                        // Count combined checks for stasiun-level efficiency
                        const [cntRows] = await pool.query(
                            'SELECT COUNT(*) as cnt FROM part_check_times WHERE session_id = ?',
                            [sessionId]
                        );
                        stasiunChecks = cntRows[0].cnt || 0;
                    } else {
                        // Fallback: if no session_id is found, realChecks is already the checksheet's total_checks
                        stasiunChecks = realChecks;
                    }

                    const calculatedExpected = await calculateExpectedForSheetDashboard(cs.id, masterTakt, pairedTakt, isDualSide, breaks, targetDate, cs.part_number, pairedPartNumber);
                    eff = calculatedExpected > 0 ? Math.round((stasiunChecks / calculatedExpected) * 100) : 0;
                    eff = Math.min(100, eff);
                    hasEff = true;
                } else if (cs.input_mode !== 'voice' && cs.timestart && cs.timeend) {
                    const startMs = new Date(cs.timestart).getTime();
                    const endMs = new Date(cs.timeend).getTime();
                    const spanMin = (endMs - startMs) / 60000;
                    const dayStartMs = new Date(targetDate + 'T00:00:00').getTime();
                    const breakMin = calcBreakOverlap(startMs, endMs, breaks, dayStartMs);
                    const activeMin = Math.max(0, spanMin - breakMin);
                    const avgTakt = Math.round(Number(cs.takt_time_sec || 60));
                    const expected = avgTakt > 0 ? Math.floor((activeMin * 60) / avgTakt) : 0;
                    eff = expected > 0 ? Math.round((realChecks / expected) * 100) : 0;
                    eff = Math.min(100, eff);
                    hasEff = true;
                }

                sheetsWithEff.push({ 
                    ...cs, 
                    total_checks: realChecks,
                    total_prod: realChecks,
                    total_ok: realOk,
                    total_ng: realNg,
                    total_scrap: realScrap,
                    calculated_efficiency: eff, 
                    has_efficiency: hasEff 
                });
            }

            const groupedMap = {};
            sheetsWithEff.forEach(cs => {
                const key = `${cs.line_pos || '-'}|${cs.model || '-'}|${cs.part_number}|${cs.part_name || ''}`;
                if (!groupedMap[key]) {
                    groupedMap[key] = {
                        line_pos: cs.line_pos,
                        model: cs.model,
                        part_number: cs.part_number,
                        part_name: cs.part_name,
                        total_prod: 0,
                        total_ok: 0,
                        total_ng: 0,
                        total_ng_point: 0,
                        total_scrap: 0,
                        total_points: Number(cs.total_points || 0),
                        session_count: 0,
                        total_eff_weighted: 0,
                        total_checks_for_eff: 0,
                        total_checks: 0
                    };
                }
                const g = groupedMap[key];
                g.total_prod += Number(cs.total_prod || 0);
                g.total_ok += Number(cs.total_ok || 0);
                g.total_ng += Number(cs.total_ng || 0);
                g.total_ng_point += Number(cs.total_ng_point || 0);
                g.total_scrap += Number(cs.total_scrap || 0);
                g.session_count += 1;

                const checks = Number(cs.total_checks || 0);
                g.total_checks += checks;
                if (cs.has_efficiency && cs.calculated_efficiency !== null) {
                    g.total_eff_weighted += cs.calculated_efficiency * checks;
                    g.total_checks_for_eff += checks;
                }
            });

            const rows = Object.values(groupedMap).map(g => {
                return {
                    line_pos: g.line_pos,
                    model: g.model,
                    part_number: g.part_number,
                    part_name: g.part_name,
                    total_prod: g.total_prod,
                    total_ok: g.total_ok,
                    total_ng: g.total_ng,
                    total_ng_point: g.total_ng_point,
                    total_scrap: g.total_scrap,
                    avg_efficiency: g.total_checks_for_eff > 0 ? Math.round(g.total_eff_weighted / g.total_checks_for_eff) : null,
                    session_count: g.session_count,
                    total_points: g.total_points,
                    total_checks: g.total_checks,
                    total_eff_weighted: g.total_eff_weighted,
                    total_checks_for_eff: g.total_checks_for_eff
                };
            });

            // Build nested structure
            const lineMap = {};
            let summary = { total_prod: 0, total_ok: 0, total_ng: 0, total_ng_point: 0, total_scrap: 0, avg_efficiency: 0, session_count: 0, max_points: 0 };
            let summaryTotalChecks = 0;
            let summaryTotalEffWeighted = 0;

            rows.forEach(r => {
                const prod = Number(r.total_prod || 0);
                const ok = Number(r.total_ok || 0);
                const ng = Number(r.total_ng || 0);
                const ngPoint = Number(r.total_ng_point || 0);
                const scrap = Number(r.total_scrap || 0);
                const sessions = Number(r.session_count || 0);
                const pts = Number(r.total_points || 0);

                summary.total_prod += prod;
                summary.total_ok += ok;
                summary.total_ng += ng;
                summary.total_ng_point += ngPoint;
                summary.total_scrap += scrap;
                summary.session_count += sessions;
                summary.max_points += (pts * prod);
                if (r.avg_efficiency !== null) {
                    summaryTotalChecks += r.total_checks_for_eff;
                    summaryTotalEffWeighted += r.total_eff_weighted;
                }

                const lp = r.line_pos || '-';
                if (!lineMap[lp]) lineMap[lp] = { line_pos: lp, models: {}, total_prod: 0, total_ok: 0, total_ng: 0, total_ng_point: 0, total_scrap: 0, total_eff_weighted: 0, total_checks_for_eff: 0, total_sessions: 0 };
                const line = lineMap[lp];
                line.total_prod += prod;
                line.total_ok += ok;
                line.total_ng += ng;
                line.total_ng_point += ngPoint;
                line.total_scrap += scrap;
                if (r.avg_efficiency !== null) {
                    line.total_checks_for_eff += r.total_checks_for_eff;
                    line.total_eff_weighted += r.total_eff_weighted;
                }
                line.total_sessions += sessions;

                const m = r.model || '-';
                if (!line.models[m]) line.models[m] = { model: m, parts: [] };
                line.models[m].parts.push({
                    part_number: r.part_number,
                    part_name: r.part_name,
                    model: r.model,
                    total_prod: prod,
                    total_ok: ok,
                    total_ng: ng,
                    total_ng_point: ngPoint,
                    total_scrap: scrap,
                    avg_efficiency: r.avg_efficiency,
                    session_count: sessions,
                    total_points: pts,
                    frame_ok_ratio: prod > 0 ? Number(((ok / prod) * 100).toFixed(1)) : 100,
                    point_ok_ratio: (pts > 0 && prod > 0) ? Number((((pts * prod - ngPoint) / (pts * prod)) * 100).toFixed(1)) : 100
                });
            });

            // Fetch top defects per line for today
            const [defects] = await pool.query(`
                SELECT cs.line_pos, csd.defect_code, csd.problem, SUM(csd.qty) as total_qty
                FROM check_sheet_details csd
                JOIN check_sheets cs ON csd.check_sheet_id = cs.id
                WHERE cs.date = ? AND csd.defect_code != '-' AND csd.qty > 0
                GROUP BY cs.line_pos, csd.defect_code, csd.problem
                ORDER BY cs.line_pos, total_qty DESC
            `, [targetDate]);

            const defectMap = {};
            defects.forEach(d => {
                const lp = d.line_pos || '-';
                if (!defectMap[lp]) defectMap[lp] = [];
                if (defectMap[lp].length < 5) {
                    defectMap[lp].push({
                        defect_code: d.defect_code,
                        problem: d.problem,
                        qty: Number(d.total_qty || 0)
                    });
                }
            });

            // Build lines array
            const lines = Object.keys(lineMap).sort().map(lp => {
                const line = lineMap[lp];
                const modelsArr = Object.keys(line.models).sort().map(mk => {
                    const m = line.models[mk];
                    return { model: mk, parts: m.parts };
                });
                return {
                    line_pos: lp,
                    total_prod: line.total_prod,
                    total_ok: line.total_ok,
                    total_ng: line.total_ng,
                    total_ng_point: line.total_ng_point,
                    total_scrap: line.total_scrap,
                    avg_efficiency: line.total_checks_for_eff > 0 ? Math.round(line.total_eff_weighted / line.total_checks_for_eff) : null,
                    session_count: line.total_sessions,
                    frame_ok_ratio: line.total_prod > 0 ? Number(((line.total_ok / line.total_prod) * 100).toFixed(1)) : 100,
                    models: modelsArr,
                    top_defects: defectMap[lp] || []
                };
            });

            summary.avg_efficiency = summaryTotalChecks > 0 ? Math.round(summaryTotalEffWeighted / summaryTotalChecks) : null;
            summary.frame_ok_ratio = summary.total_prod > 0 ? Number(((summary.total_ok / summary.total_prod) * 100).toFixed(1)) : 100;

            return { summary, lines };
        };

        const today = await fetchDayData(date);
        const previous = await fetchDayData(prevDate);

        res.json({ status: 'success', data: { today, previous, previous_date: prevDate } });
    } catch (err) {
        console.error('Asakai error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 7. GET /api/dashboard/live-analytics/:partNumber — aggregated live analytics from active sessions
router.get('/dashboard/live-analytics/:partNumber', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber } = req.params;

        // Fetch part image_path and marker_size first to resolve paired part number
        const [partRows] = await pool.query('SELECT image_path, marker_size, takt_time, side_type, paired_part_number FROM part_master WHERE part_number = ? LIMIT 1', [partNumber]);
        const imagePath = partRows.length > 0 ? partRows[0].image_path : null;
        const markerSize = partRows.length > 0 ? partRows[0].marker_size : null;
        const rawTakt = partRows.length > 0 ? Number(partRows[0].takt_time || 60) : 60;

        const sideType = partRows.length > 0 ? (partRows[0].side_type || '').toLowerCase() : '';
        const pairedPartNumber = partRows.length > 0 ? partRows[0].paired_part_number : null;
        const isDualSide = (sideType === 'lh' || sideType === 'rh' || sideType === 'kiri' || sideType === 'kanan') && pairedPartNumber;
        const masterTakt = isDualSide ? rawTakt * 2 : rawTakt;

        const partNumbersToFetch = [partNumber];
        if (pairedPartNumber) {
            partNumbersToFetch.push(pairedPartNumber);
        }

        const [sessions] = await pool.query(
            `SELECT * FROM live_qc_monitoring
             WHERE part_number IN (?)
               AND last_update >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY inspector, side`,
            [partNumbersToFetch]
        );

        if (sessions.length === 0) {
            return res.json({
                status: 'success',
                data: {
                    summary: { total_prod: 0, total_ok: 0, total_ng: 0, total_scrap: 0, total_checks: 0, avg_efficiency: 0, active_operators: 0, active_sessions: 0 },
                    operators: [], problems: [], points: [], pointProblems: [], availableLines: [], availableModels: [], image_path: imagePath, marker_size: markerSize
                }
            });
        }

        const localDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000));
        const today = localDate.toISOString().split('T')[0];
        const dayOfWeek = localDate.getDay() + 1;



        // Fetch active session IDs for today's shifts
        const [activeSessionRows] = await pool.query(
            `SELECT DISTINCT session_id FROM part_check_times 
             WHERE part_number IN (?) AND DATE(check_start) = ? AND session_id IS NOT NULL`,
            [partNumbersToFetch, today]
        );
        let checkRows = [];
        if (activeSessionRows.length > 0) {
            const activeSessionIds = activeSessionRows.map(r => r.session_id);
            const [rows] = await pool.query(
                `SELECT part_number, inspector, side, check_start, check_end, duration_sec, judgment FROM part_check_times
                 WHERE session_id IN (?)`,
                [activeSessionIds]
            );
            checkRows = rows;
        } else {
            const [rows] = await pool.query(
                `SELECT part_number, inspector, side, check_start, check_end, duration_sec, judgment FROM part_check_times
                 WHERE part_number IN (?) AND DATE(check_start) = ?`,
                [partNumbersToFetch, today]
            );
            checkRows = rows;
        }
        const [breaks] = await pool.query(
            `SELECT start_time, end_time FROM timer_breaks WHERE
                CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                AND active = 1 ORDER BY start_time ASC`,
            [dayOfWeek]
        );

        const operatorChecksMap = {};
        checkRows.forEach(r => {
            const key = `${r.inspector}|${r.side}`;
            if (!operatorChecksMap[key]) operatorChecksMap[key] = [];
            operatorChecksMap[key].push(r);
        });

        let totalProd = 0, totalOk = 0, totalNg = 0, totalScrap = 0, totalChecks = 0, totalCheckTime = 0;
        const operatorRows = [];

        for (const s of sessions) {
            if (s.part_number !== partNumber) continue;

            const durKey = `${s.inspector}|${s.side}`;
            const allOpSideChecks = operatorChecksMap[durKey] || [];
            const opChecks = allOpSideChecks.filter(row => row.part_number === partNumber);

            let opChecksForEff = allOpSideChecks;
            if (pairedPartNumber) {
                const lhKey = `${s.inspector}|KIRI`;
                const rhKey = `${s.inspector}|KANAN`;
                opChecksForEff = [
                    ...(operatorChecksMap[lhKey] || []),
                    ...(operatorChecksMap[rhKey] || [])
                ];
            }

            let c = opChecks.length;
            let t = opChecks.reduce((sum, row) => sum + Number(row.duration_sec || 0), 0);
            let activeMin = t / 60;
            let eff = s.efficiency || 0;
            const avgTakt = masterTakt;
            let okCount = opChecks.filter(row => row.judgment === 'OK').length;
            let ngCount = opChecks.filter(row => row.judgment === 'NG').length;
            let scrapCount = opChecks.filter(row => row.judgment === 'SCRAP').length;

            if (opChecksForEff.length > 0) {
                const calc = calculateActiveMinAndEff(opChecksForEff, breaks, masterTakt, isDualSide);
                activeMin = calc.activeMin;
                eff = calc.efficiency;
            }

            totalProd += (okCount + ngCount);
            totalOk += okCount;
            totalNg += ngCount;
            totalScrap += scrapCount;
            totalChecks += c;
            totalCheckTime += t;

            const activeMinRounded = Math.round(activeMin * 10) / 10;
            const availableSec = activeMin * 60;
            const expected = availableSec > 0 && avgTakt > 0 ? Math.floor(availableSec / avgTakt) : 0;
            const checksForLost = isDualSide ? opChecksForEff.length / 2 : c;
            const lostProd = Math.max(0, expected - checksForLost);
            const lostMin = lostProd > 0 ? Math.round(lostProd * avgTakt / 60 * 10) / 10 : 0;

            operatorRows.push({
                inspector: s.inspector,
                side: s.side,
                shift: s.shift,
                line_pos: s.line_pos,
                total_ok: okCount,
                total_ng: ngCount,
                total_scrap: scrapCount,
                total_checks: c,
                total_check_time: t,
                efficiency: eff,
                active_min: activeMinRounded,
                avg_takt: avgTakt,
                expected: expected,
                lost_time_min: lostMin,
                lost_products: lostProd
            });
        }

        const avgEff = totalChecks > 0 ? Math.round(operatorRows.reduce((s, r) => s + r.efficiency * r.total_checks, 0) / totalChecks) : 0;

        const problemMap = {};
        const pointMap = {};
        const pointProblemsMap = {};
        for (const s of sessions) {
            if (s.part_number !== partNumber) continue;
            let list = [];
            try { list = typeof s.problems_list === 'string' ? JSON.parse(s.problems_list) : (s.problems_list || []); } catch (e) { list = []; }
            for (const p of list) {
                if (p.defectCode && p.defectCode !== '-') {
                    if (!problemMap[p.defectCode]) {
                        problemMap[p.defectCode] = { qty: 0, problem: p.problem || p.defectCode };
                    }
                    problemMap[p.defectCode].qty += (p.qty || 1);
                    if (p.problem) problemMap[p.defectCode].problem = p.problem;
                }
                if (p.checkNo && p.checkNo !== '-') {
                    pointMap[p.checkNo] = (pointMap[p.checkNo] || 0) + (p.qty || 1);
                    // Track per-point problem details for heatmap popup
                    if (p.defectCode && p.defectCode !== '-') {
                        if (!pointProblemsMap[p.checkNo]) pointProblemsMap[p.checkNo] = {};
                        if (!pointProblemsMap[p.checkNo][p.defectCode]) {
                            pointProblemsMap[p.checkNo][p.defectCode] = { defect_code: p.defectCode, problem: p.problem || p.defectCode, qty: 0 };
                        }
                        pointProblemsMap[p.checkNo][p.defectCode].qty += (p.qty || 1);
                        if (p.problem) pointProblemsMap[p.checkNo][p.defectCode].problem = p.problem;
                    }
                }
            }
        }

        const problems = Object.entries(problemMap).map(([code, val]) => ({ defect_code: code, problem: val.problem, qty: val.qty })).sort((a, b) => b.qty - a.qty);
        const points = Object.entries(pointMap).map(([checkNo, qty]) => ({ check_no: checkNo, qty })).sort((a, b) => b.qty - a.qty);
        const pointProblems = Object.entries(pointProblemsMap).map(([checkNo, probs]) => ({
            check_no: checkNo,
            problems: Object.values(probs).sort((a, b) => b.qty - a.qty)
        }));
        const availableLines = [...new Set(sessions.map(s => s.line_pos).filter(Boolean))];
        const availableModels = [...new Set(sessions.map(s => s.model).filter(Boolean))];

        const totalActiveMin = operatorRows.reduce((s, r) => s + r.active_min, 0);
        const totalExpected = operatorRows.reduce((s, r) => s + r.expected, 0);
        const totalLostMin = operatorRows.reduce((s, r) => s + r.lost_time_min, 0);
        const totalLostProd = operatorRows.reduce((s, r) => s + r.lost_products, 0);
        const globalAvgTakt = masterTakt;
        const targetPartSessions = sessions.filter(s => s.part_number === partNumber);
        const activeCount = [...new Set(targetPartSessions.map(s => s.inspector))].length;

        res.json({
            status: 'success',
            data: {
                image_path: imagePath,
                marker_size: markerSize,
                summary: {
                    total_prod: totalProd,
                    total_ok: totalOk,
                    total_ng: totalNg,
                    total_scrap: totalScrap,
                    total_checks: totalChecks,
                    avg_efficiency: avgEff,
                    avg_takt: globalAvgTakt,
                    active_min: Math.round(totalActiveMin * 10) / 10,
                    total_expected: totalExpected,
                    lost_time_min: Math.round(totalLostMin * 10) / 10,
                    lost_products: totalLostProd,
                    active_operators: activeCount,
                    active_sessions: targetPartSessions.length
                },
                operators: operatorRows,
                problems,
                points,
                pointProblems,
                availableLines,
                availableModels
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;

