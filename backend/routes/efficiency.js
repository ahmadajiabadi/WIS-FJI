const express = require('express');
const { getPool } = require('../config/db');
const router = express.Router();

// POST /api/efficiency/record-item — save one per-part check time
router.post('/efficiency/record-item', async (req, res) => {
    try {
        const pool = getPool();
        const { check_sheet_id, part_number, model, line_pos, side, date, shift, inspector, check_start, check_end, duration_sec, takt_time_sec, efficiency, judgment, total_ng_point, session_id } = req.body;

        if (!part_number || !check_start || !check_end || !judgment) {
            return res.json({ status: 'error', message: 'Missing required fields' });
        }

        await pool.query(
            `INSERT INTO part_check_times (check_sheet_id, part_number, model, line_pos, side, date, shift, inspector, check_start, check_end, duration_sec, takt_time_sec, efficiency, judgment, total_ng_point, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [check_sheet_id || null, part_number, model || '', line_pos || '', side || '', date || check_start.substring(0, 10), shift || '', inspector || '', check_start, check_end, duration_sec, takt_time_sec || 60, efficiency || 0, judgment, total_ng_point || 0, session_id || null]
        );

        res.json({ status: 'success' });
    } catch (e) {
        console.error('Record item error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// GET /api/efficiency/hourly — group per hour with break exclusion
router.get('/efficiency/hourly', async (req, res) => {
    try {
        const pool = getPool();
        const { date, partNumber, linePos, checkSheetId, inspector, side } = req.query;
        if (!date) return res.json({ status: 'error', message: 'date required' });

        // Check if part is dual-side
        let isDualSide = false;
        let pairedPartNumber = null;
        let masterTakt = 60;
        let pairedTakt = 0;
        if (partNumber) {
            const [partRows] = await pool.query('SELECT paired_part_number, takt_time FROM part_master WHERE part_number = ? LIMIT 1', [partNumber]);
            if (partRows.length > 0) {
                masterTakt = partRows[0].takt_time || 60;
                pairedPartNumber = partRows[0].paired_part_number;
                isDualSide = !!pairedPartNumber;
                if (pairedPartNumber) {
                    const [pairedRows] = await pool.query('SELECT takt_time FROM part_master WHERE part_number = ? LIMIT 1', [pairedPartNumber]);
                    if (pairedRows.length > 0) {
                        pairedTakt = pairedRows[0].takt_time || 60;
                    }
                }
            }
        }
        const isSingleSideView = !!side;
        if (isSingleSideView) {
            isDualSide = false;
        }

        const partNumbersToFetch = [partNumber];
        if (pairedPartNumber) {
            partNumbersToFetch.push(pairedPartNumber);
        }

        // Load part_check_times for the date, filter by part/line/sheet
        let where = 'WHERE DATE(pct.check_start) = ?';
        const params = [date];
        if (partNumber) {
            where += ' AND pct.part_number IN (?)';
            params.push(partNumbersToFetch);
        }
        if (linePos) {
            if (linePos === '-') {
                where += " AND (pct.line_pos IS NULL OR pct.line_pos = '')";
            } else {
                where += ' AND pct.line_pos = ?';
                params.push(linePos);
            }
        }
        if (checkSheetId) {
            const [sessionRows] = await pool.query(
                'SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1',
                [checkSheetId]
            );
            if (sessionRows.length > 0 && sessionRows[0].session_id) {
                where += ' AND pct.session_id = ?';
                params.push(sessionRows[0].session_id);
            } else {
                where += ' AND pct.check_sheet_id = ?';
                params.push(checkSheetId);
            }
        }
        if (inspector) { where += ' AND pct.inspector = ?'; params.push(inspector); }
        if (side) {
            let sideVal = side.toUpperCase();
            if (sideVal === 'LH') sideVal = 'KIRI';
            if (sideVal === 'RH') sideVal = 'KANAN';
            where += ' AND (pct.side = ? OR (CASE ? WHEN \'KIRI\' THEN \'LH\' WHEN \'KANAN\' THEN \'RH\' END) = pct.side)';
            params.push(sideVal, sideVal);
        }

        const [rows] = await pool.query(
            `SELECT pct.* FROM part_check_times pct ${where} ORDER BY pct.check_start ASC`,
            params
        );

        if (rows.length === 0) {
            return res.json({ status: 'success', data: [] });
        }

        const avgTakt = Math.round(rows.reduce((s, r) => s + r.takt_time_sec, 0) / rows.length);

        // Load breaks for the day of week
        const dayOfWeek = new Date(date + 'T00:00:00').getDay() + 1; // MySQL DAYOFWEEK: 1=Sun
        const [breaks] = await pool.query(
            `SELECT start_time, end_time FROM timer_breaks WHERE 
                CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                AND active = 1 ORDER BY start_time ASC`,
            [dayOfWeek]
        );

        // Build hourly buckets (00:00-23:00)
        const hourly = {};
        for (let h = 0; h < 24; h++) {
            hourly[h] = { hour: h, total_checks: 0, side_checks: 0, total_duration: 0, total_takt: 0, minTs: Infinity, maxTs: -Infinity };
        }

        const querySide = side;

        rows.forEach(r => {
            const d = new Date(r.check_start);
            const h = d.getHours();
            
            const isTargetSide = !querySide || 
                                 r.side.toLowerCase() === querySide.toLowerCase() ||
                                 (querySide.toLowerCase() === 'kiri' && r.side.toLowerCase() === 'lh') ||
                                 (querySide.toLowerCase() === 'kanan' && r.side.toLowerCase() === 'rh') ||
                                 (querySide.toLowerCase() === 'lh' && r.side.toLowerCase() === 'kiri') ||
                                 (querySide.toLowerCase() === 'rh' && r.side.toLowerCase() === 'kanan');
            
            hourly[h].total_checks++;
            if (isTargetSide) {
                hourly[h].side_checks++;
            }
            
            hourly[h].total_duration += Number(r.duration_sec);
            hourly[h].total_takt += r.takt_time_sec;
            const tsMs = d.getTime();
            if (tsMs < hourly[h].minTs) hourly[h].minTs = tsMs;
            if (r.check_end) {
                const endD = new Date(r.check_end);
                const endTsMs = endD.getTime();
                if (endTsMs > hourly[h].maxTs) hourly[h].maxTs = endTsMs;
            } else {
                if (tsMs > hourly[h].maxTs) hourly[h].maxTs = tsMs;
            }
        });

        function timeToMinutes(t) {
            const parts = (t || '00:00:00').split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        const msToHourMin = (ms) => {
            const d = new Date(ms);
            return d.getHours() * 60 + d.getMinutes();
        };

        const result = [];
        for (let h = 0; h < 24; h++) {
            const bucket = hourly[h];
            if (bucket.total_checks === 0) continue;

            // Actual active span (in minutes) = max(check_end) - min(check_start)
            const activeSpanMs = bucket.maxTs - bucket.minTs;
            const activeSpanMin = activeSpanMs > 0 && bucket.total_checks > 1
                ? activeSpanMs / 60000
                : bucket.total_duration / 60;

            // Calculate break minutes within the actual active span
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
            const availableSec = activeMin * 60;
            const targetTakt = isSingleSideView 
                ? (pairedPartNumber ? masterTakt + pairedTakt : masterTakt) 
                : (isDualSide ? (masterTakt + pairedTakt) / 2 : masterTakt);
            const checksForEff = isSingleSideView ? bucket.side_checks : (isDualSide ? bucket.total_checks / 2 : bucket.side_checks);

            const expected = availableSec > 0 && targetTakt > 0 ? Math.floor(availableSec / targetTakt) : 0;
            const efficiency = expected > 0 ? Math.min(100, Math.round((checksForEff / expected) * 100)) : 0;
            const lostProducts = Math.max(0, expected - checksForEff);
            const lostTimeMin = lostProducts > 0 ? Math.round(lostProducts * targetTakt / 60 * 10) / 10 : 0;

            result.push({
                hour: `${String(h).padStart(2, '0')}:00`,
                hourIndex: h,
                checks: checksForEff,
                total_duration: Math.round(bucket.total_duration * 100) / 100,
                avg_takt: targetTakt,
                expected,
                efficiency,
                lost_time_min: lostTimeMin,
                lost_products: lostProducts,
                available_sec: availableSec,
                active_min: Math.round(activeMin * 10) / 10
            });
        }

        // Compute daily totals
        const totalChecks = result.reduce((s, r) => s + r.checks, 0);
        const totalExpected = result.reduce((s, r) => s + r.expected, 0);
        const totalLostMin = result.reduce((s, r) => s + r.lost_time_min, 0);
        const totalLostProducts = result.reduce((s, r) => s + r.lost_products, 0);
        const totalActiveMin = result.reduce((s, r) => s + r.active_min, 0);
        const dailyEff = totalExpected > 0 ? Math.min(100, Math.round((totalChecks / totalExpected) * 100)) : 0;

        // Build check items for bar chart
        const items = rows.filter(r => {
            if (!querySide) return true;
            const rSide = (r.side || '').toLowerCase();
            const qSide = querySide.toLowerCase();
            return rSide === qSide || 
                   (qSide === 'kiri' && rSide === 'lh') || 
                   (qSide === 'kanan' && rSide === 'rh') ||
                   (qSide === 'lh' && rSide === 'kiri') ||
                   (qSide === 'rh' && rSide === 'kanan');
        }).map(r => ({
            time: r.check_start ? r.check_start.substring(11, 16) : '',
            duration_sec: Number(r.duration_sec),
            takt_time_sec: isSingleSideView ? (pairedPartNumber ? masterTakt + pairedTakt : masterTakt) : Number(r.takt_time_sec || 60),
            judgment: r.judgment
        }));

        res.json({
            status: 'success',
            data: result,
            daily: {
                total_checks: totalChecks,
                total_expected: totalExpected,
                efficiency: dailyEff,
                lost_time_min: Math.round(totalLostMin * 10) / 10,
                lost_products: totalLostProducts,
                active_min: Math.round(totalActiveMin * 10) / 10
            },
            avg_takt: isSingleSideView ? (pairedPartNumber ? masterTakt + pairedTakt : masterTakt) : (isDualSide ? (masterTakt + pairedTakt) / 2 : masterTakt),
            items: items
        });
    } catch (e) {
        console.error('Hourly efficiency error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// GET /api/efficiency/daily — daily summary with session detection
// Memecah produksi jadi beberapa sesi jika jeda antar record > 60 menit,
// agar efisiensi tidak terdistorsi oleh gap pergantian part.
router.get('/efficiency/daily', async (req, res) => {
    try {
        const pool = getPool();
        const { date, partNumber, linePos } = req.query;
        if (!date) return res.json({ status: 'error', message: 'date required' });

        let where = 'WHERE DATE(pct.check_start) = ?';
        const params = [date];
        if (partNumber) { where += ' AND pct.part_number = ?'; params.push(partNumber); }
        if (linePos) { where += ' AND pct.line_pos = ?'; params.push(linePos); }

        // Ambil semua record diurutkan jam
        const [rows] = await pool.query(
            `SELECT check_start, check_end, takt_time_sec FROM part_check_times pct ${where} ORDER BY check_start ASC`,
            params
        );

        if (rows.length === 0) {
            return res.json({ status: 'success', data: { total_checks: 0, efficiency: 0, active_min: 0 } });
        }

        // Load jadwal istirahat
        const dayOfWeek = new Date(date + 'T00:00:00').getDay() + 1;
        const [breaks] = await pool.query(
            `SELECT start_time, end_time FROM timer_breaks WHERE 
                CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                AND active = 1`,
            [dayOfWeek]
        );

        function timeToMinutes(t) {
            const parts = (t || '00:00:00').split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        function calcBreakMinutes(startMs, endMs, breaks, dayStartMs) {
            let total = 0;
            breaks.forEach(b => {
                const bStart = dayStartMs + timeToMinutes(b.start_time) * 60000;
                const bEnd = dayStartMs + timeToMinutes(b.end_time) * 60000;
                const overlapStart = Math.max(startMs, bStart);
                const overlapEnd = Math.min(endMs, bEnd);
                if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / 60000;
            });
            return total;
        }

        // Deteksi sesi: jika jeda antar record > 60 menit, anggap sesi baru
        const SESSION_GAP_MS = 60 * 60 * 1000;
        const dayStartMs = new Date(date + 'T00:00:00').getTime();
        const sessions = [];
        let cur = null;

        rows.forEach(r => {
            const startMs = new Date(r.check_start).getTime();
            const endMs = r.check_end ? new Date(r.check_end).getTime() : startMs;
            const takt = Number(r.takt_time_sec || 60);

            if (!cur || startMs - cur.endMs > SESSION_GAP_MS) {
                cur = { startMs, endMs, checks: 0, totalTakt: 0 };
                sessions.push(cur);
            } else {
                if (endMs > cur.endMs) cur.endMs = endMs;
            }
            cur.checks++;
            cur.totalTakt += takt;
        });

        // Hitung efisiensi per sesi, lalu agregat
        let totalChecks = 0, totalExpected = 0, totalActiveMin = 0;

        sessions.forEach(s => {
            const spanMin = (s.endMs - s.startMs) / 60000;
            const breakMin = calcBreakMinutes(s.startMs, s.endMs, breaks, dayStartMs);
            const activeMin = Math.max(0, spanMin - breakMin);
            const avgTakt = Math.round(s.totalTakt / s.checks);
            const expected = avgTakt > 0 ? Math.floor((activeMin * 60) / avgTakt) : 0;

            totalChecks += s.checks;
            totalExpected += expected;
            totalActiveMin += activeMin;
        });

        const avgTakt = Math.round(rows.reduce((s, r) => s + Number(r.takt_time_sec || 60), 0) / rows.length);
        const efficiency = totalExpected > 0 ? Math.min(100, Math.round((totalChecks / totalExpected) * 100)) : 0;
        const lostProducts = Math.max(0, totalExpected - totalChecks);
        const lostTimeMin = lostProducts > 0 ? Math.round(lostProducts * avgTakt / 60 * 10) / 10 : 0;

        res.json({
            status: 'success',
            data: {
                total_checks: totalChecks,
                avg_takt: avgTakt,
                expected: totalExpected,
                efficiency,
                lost_time_min: lostTimeMin,
                lost_products: lostProducts,
                active_min: Math.round(totalActiveMin * 10) / 10
            }
        });
    } catch (e) {
        console.error('Daily efficiency error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// GET /api/efficiency/by-sheets — aggregate efisiensi dari check_sheets per sesi
// Setiap check_sheets = 1 sesi produksi alami (boundary dari user submit form)
// Efficiency: rata-rata tertimbang per sesi SUM(eff × checks) / SUM(checks)
router.get('/efficiency/by-sheets', async (req, res) => {
    try {
        const pool = getPool();
        const { partNumber, startDate, endDate, lines, shift, model } = req.query;
        if (!partNumber) return res.json({ status: 'error', message: 'partNumber required' });

        // Check if part is dual-side
        let isDualSide = false;
        let pairedPartNumber = null;
        let masterTakt = 60;
        let pairedTakt = 0;
        const [partRows] = await pool.query('SELECT paired_part_number, takt_time FROM part_master WHERE part_number = ? LIMIT 1', [partNumber]);
        if (partRows.length > 0) {
            masterTakt = partRows[0].takt_time || 60;
            pairedPartNumber = partRows[0].paired_part_number;
            isDualSide = !!pairedPartNumber;
            if (pairedPartNumber) {
                const [pairedRows] = await pool.query('SELECT takt_time FROM part_master WHERE part_number = ? LIMIT 1', [pairedPartNumber]);
                if (pairedRows.length > 0) {
                    pairedTakt = pairedRows[0].takt_time || 60;
                }
            }
        }

        let where = 'WHERE cs.part_number = ?';
        let params = [partNumber];

        if (startDate && endDate) {
            where += ' AND cs.date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        if (lines) {
            const lineArr = lines.split(',').map(l => l.trim()).filter(Boolean);
            if (lineArr.length > 0) {
                const hasHyphen = lineArr.includes('-');
                const cleanLines = lineArr.filter(l => l !== '-');
                if (cleanLines.length > 0) {
                    if (hasHyphen) {
                        where += ` AND (cs.line_pos IN (${cleanLines.map(() => '?').join(',')}) OR cs.line_pos IS NULL OR cs.line_pos = '')`;
                    } else {
                        where += ` AND cs.line_pos IN (${cleanLines.map(() => '?').join(',')})`;
                    }
                    params.push(...cleanLines);
                } else if (hasHyphen) {
                    where += " AND (cs.line_pos IS NULL OR cs.line_pos = '')";
                }
            }
        }
        if (shift) {
            where += ' AND cs.shift = ?';
            params.push(shift);
        }
        if (model) {
            where += ' AND cs.model = ?';
            params.push(model);
        }

        // Ambil semua check_sheets yang punya timestart & timeend (sesi lengkap)
        const [sheets] = await pool.query(
            `SELECT cs.id, cs.date, cs.shift, cs.inspector, cs.line_pos,
                    cs.timestart, cs.timeend, cs.total_checks, cs.takt_time_sec,
                    cs.efficiency, cs.input_mode
             FROM check_sheets cs
             ${where}
               AND cs.timestart IS NOT NULL AND cs.timeend IS NOT NULL
             ORDER BY cs.timestart ASC`,
            params
        );

        if (sheets.length === 0) {
            return res.json({ status: 'success', data: { sessions: 0, total_checks: 0, efficiency: 0, active_min: 0, session_details: [] } });
        }

        // Load breaks (cache per tanggal)
        const breaksCache = {};
        async function getBreaksForDate(dateStr) {
            if (breaksCache[dateStr]) return breaksCache[dateStr];
            const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay() + 1;
            const [rows] = await pool.query(
                `SELECT start_time, end_time FROM timer_breaks WHERE 
                    CASE ? WHEN 2 THEN monday WHEN 3 THEN tuesday WHEN 4 THEN wednesday WHEN 5 THEN thursday WHEN 6 THEN friday WHEN 7 THEN saturday WHEN 1 THEN sunday END = 1
                    AND active = 1`,
                [dayOfWeek]
            );
            breaksCache[dateStr] = rows;
            return rows;
        }

        function timeToMinutes(t) {
            const parts = (t || '00:00:00').split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        function calcBreakOverlap(startMs, endMs, breaks, dayStartMs) {
            let total = 0;
            breaks.forEach(b => {
                const bStart = dayStartMs + timeToMinutes(b.start_time) * 60000;
                const bEnd = dayStartMs + timeToMinutes(b.end_time) * 60000;
                const overlapStart = Math.max(startMs, bStart);
                const overlapEnd = Math.min(endMs, bEnd);
                if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / 60000;
            });
            return total;
        }

        async function calculateExpectedForSheet(sheetId, masterTakt, pairedTakt, isDualSide, breaks, date, masterPart, pairedPart) {
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

        const sessionDetails = [];
        let totalChecks = 0, totalEffWeighted = 0, totalActiveMin = 0;

        for (const sheet of sheets) {
            const startMs = new Date(sheet.timestart).getTime();
            const endMs = new Date(sheet.timeend).getTime();
            const spanMin = (endMs - startMs) / 60000;
            const dayStartMs = new Date(sheet.date + 'T00:00:00').getTime();
            const breaks = await getBreaksForDate(sheet.date);
            const breakMin = calcBreakOverlap(startMs, endMs, breaks, dayStartMs);
            const activeMin = Math.max(0, spanMin - breakMin);
            const checks = Number(sheet.total_checks || 0);
            let lhChecks = 0;
            let rhChecks = 0;

            if (isDualSide) {
                const [sessionChecks] = await pool.query(
                    `SELECT session_id FROM part_check_times WHERE check_sheet_id = ? LIMIT 1`,
                    [sheet.id]
                );
                if (sessionChecks.length > 0 && sessionChecks[0].session_id) {
                    const sessionId = sessionChecks[0].session_id;
                    const [checkCounts] = await pool.query(
                        `SELECT side, COUNT(*) as cnt FROM part_check_times WHERE session_id = ? GROUP BY side`,
                        [sessionId]
                    );
                    checkCounts.forEach(c => {
                        const sideName = (c.side || '').toUpperCase();
                        if (sideName === 'KIRI' || sideName === 'LH') {
                            lhChecks = c.cnt;
                        } else if (sideName === 'KANAN' || sideName === 'RH') {
                            rhChecks = c.cnt;
                        }
                    });
                }
            } else {
                const sideName = (sheet.side || '').toUpperCase();
                if (sideName === 'KANAN' || sideName === 'RH') {
                    rhChecks = checks;
                } else {
                    lhChecks = checks;
                }
            }

            const realStasiunChecks = isDualSide ? (lhChecks + rhChecks) : checks;
            const avgTakt = Math.round(Number(sheet.takt_time_sec || 60));
            const displayTakt = isDualSide ? (masterTakt + pairedTakt) : avgTakt;
            const calcTakt = isDualSide ? displayTakt / 2 : displayTakt;

            let expected = calcTakt > 0 ? Math.floor((activeMin * 60) / calcTakt) : 0;
            if (isDualSide) {
                expected = await calculateExpectedForSheet(sheet.id, masterTakt, pairedTakt, isDualSide, breaks, sheet.date, partNumber, pairedPartNumber);
            }
            let eff = expected > 0 ? Math.round((realStasiunChecks / expected) * 100) : 0;
            if (!isDualSide && sheet.input_mode === 'voice' && sheet.efficiency !== null) {
                eff = Number(sheet.efficiency);
            }
            const lostProd = Math.max(0, expected - realStasiunChecks);
            const lostMin = lostProd > 0 ? Math.round(lostProd * calcTakt / 60 * 10) / 10 : 0;

            const fmtTime = (d) => {
                const dt = new Date(d);
                return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            };

            sessionDetails.push({
                id: sheet.id,
                date: sheet.date,
                shift: sheet.shift || '',
                inspector: sheet.inspector || '',
                line_pos: sheet.line_pos || '',
                timestart: fmtTime(sheet.timestart),
                timeend: fmtTime(sheet.timeend),
                active_min: Math.round(activeMin * 10) / 10,
                total_checks: realStasiunChecks,
                lh_checks: lhChecks,
                rh_checks: rhChecks,
                avg_takt: displayTakt,
                expected,
                efficiency: eff,
                lost_time_min: lostMin,
                lost_products: lostProd
            });

            totalChecks += realStasiunChecks;
            totalEffWeighted += eff * realStasiunChecks;
            totalActiveMin += activeMin;
        }

        const globalAvgTakt = isDualSide ? (masterTakt + pairedTakt) : Math.round(
            sheets.reduce((s, sh) => s + Number(sh.takt_time_sec || 60), 0) / sheets.length
        );
        const globalCalcTakt = isDualSide ? globalAvgTakt / 2 : globalAvgTakt;
        const weightedEff = totalChecks > 0 ? Math.round(totalEffWeighted / totalChecks) : 0;
        const expectedTotal = sessionDetails.reduce((s, sd) => s + sd.expected, 0);
        const lostProducts = Math.max(0, expectedTotal - totalChecks);
        const lostTimeMin = lostProducts > 0 ? Math.round(lostProducts * globalCalcTakt / 60 * 10) / 10 : 0;

        res.json({
            status: 'success',
            data: {
                sessions: sheets.length,
                total_checks: totalChecks,
                expected: expectedTotal,
                avg_takt: globalAvgTakt,
                efficiency: weightedEff,
                lost_time_min: lostTimeMin,
                lost_products: lostProducts,
                active_min: Math.round(totalActiveMin * 10) / 10,
                session_details: sessionDetails
            }
        });
    } catch (e) {
        console.error('By-sheets efficiency error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// DELETE /api/efficiency/session/:sessionId — delete temp records when session is discarded/canceled
router.delete('/efficiency/session/:sessionId', async (req, res) => {
    try {
        const pool = getPool();
        const { sessionId } = req.params;
        await pool.query('DELETE FROM part_check_times WHERE session_id = ? AND check_sheet_id IS NULL', [sessionId]);
        res.json({ status: 'success', message: 'Temporary session records deleted' });
    } catch (e) {
        console.error('Delete session error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

// DELETE /api/efficiency/session/:sessionId/last — delete the last check record for a session
router.delete('/efficiency/session/:sessionId/last', async (req, res) => {
    try {
        const pool = getPool();
        const { sessionId } = req.params;
        // Find the latest check time row for this session (where check_sheet_id is NULL)
        const [lastRows] = await pool.query(
            'SELECT id FROM part_check_times WHERE session_id = ? AND check_sheet_id IS NULL ORDER BY id DESC LIMIT 1',
            [sessionId]
        );
        if (lastRows.length > 0) {
            await pool.query('DELETE FROM part_check_times WHERE id = ?', [lastRows[0].id]);
            res.json({ status: 'success', message: 'Last check record deleted' });
        } else {
            res.json({ status: 'error', message: 'No temporary check records found for this session' });
        }
    } catch (e) {
        console.error('Delete last check error:', e);
        res.json({ status: 'error', message: e.message });
    }
});

module.exports = router;
