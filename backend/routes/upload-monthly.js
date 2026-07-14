const express = require('express');
const { getPool } = require('../config/db');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const MONTH_MAP = {
    'JANUARI': 1, 'FEBRUARI': 2, 'MARET': 3, 'APRIL': 4, 'MEI': 5, 'JUNI': 6,
    'JULI': 7, 'AGUSTUS': 8, 'SEPTEMBER': 9, 'OKTOBER': 10, 'NOVEMBER': 11, 'DESEMBER': 12
};

const DEFECT_PROBLEMS = {
    'A': 'Weld.Undercut (Memotong Part)',
    'B': 'Weld.Over Lap (Tembus / Berlebih)',
    'C': 'Weld.Pit/Blow Hole (Keropos)',
    'D': 'Weld.Hole (Berlubang)',
    'E': 'Weld.Burn-trough (Meleleh)',
    'F': 'Weld.Bead skip (Welding Putus)',
    'G': 'Weld.Bead witdh (Pergeseran Welding)',
    'H': 'Hole Tidak Centre',
    'I': 'Headrest Miring',
    'J': 'Pemasangan Miring',
    'K': 'Bolt T/A',
    'L': 'Tidak Flat',
    'M': 'Others'
};

function parseMonthYear(filename, bodyMonth, bodyYear) {
    if (bodyMonth && bodyYear) return { month: parseInt(bodyMonth), year: parseInt(bodyYear) };
    const upper = filename.toUpperCase();
    for (const [name, num] of Object.entries(MONTH_MAP)) {
        if (upper.includes(name)) {
            const yearMatch = filename.match(/(\d{4})/);
            return { month: num, year: yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear() };
        }
    }
    return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
}

function parseModelFromFilename(filename, bodyModel) {
    if (bodyModel) return bodyModel;
    const match = filename.match(/^([A-Z0-9]+)\s*[-_]/);
    return match ? match[1] : '-';
}

function parsePartListSheet(ws) {
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerRow = data[2] || [];

    let partNoIdx = -1, partNameIdx = -1;
    for (let i = 0; i < headerRow.length; i++) {
        const h = (headerRow[i] || '').toString().toLowerCase().trim();
        if (h.includes('part no')) partNoIdx = i;
        if (h === 'part name' || h.includes('part name')) partNameIdx = i;
    }
    if (partNoIdx < 0) partNoIdx = 2;
    if (partNameIdx < 0) partNameIdx = 3;

    const rows = [];
    const byPart = {};

    for (let i = 3; i < data.length; i++) {
        const row = data[i];
        const no = row[0];
        const line = row[1] ? row[1].toString().trim() : '';
        const partNumber = row[partNoIdx] ? row[partNoIdx].toString().trim() : '';
        const partName = row[partNameIdx] ? row[partNameIdx].toString().trim() : '';
        if (partNumber && !isNaN(parseInt(no))) {
            const entry = { partNumber, partName, line };
            rows.push(entry);
            if (!byPart[partNumber]) byPart[partNumber] = [];
            byPart[partNumber].push(rows.length - 1);
        }
    }
    return { rows, byPart };
}

function parseDetailSheet(ws, partNumber, partInfo, month, year, model) {
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 4) return [];

    let side = '';
    if (data[1] && data[1][10]) {
        const raw = data[1][10].toString().trim().toUpperCase();
        side = raw === 'LH' ? 'KIRI' : raw === 'RH' ? 'KANAN' : '';
    }

    const sessions = [];
    let currentSession = null;

    function hasValue(v) {
        return v !== undefined && v !== null && v !== '';
    }

    function pushSession() {
        if (currentSession && currentSession.details.length > 0) {
            sessions.push(currentSession);
        }
    }

    for (let i = 3; i < data.length; i++) {
        const row = data[i];
        const rawDate = row[0];
        const shift = row[1] ? row[1].toString().trim().toUpperCase() : '';
        const rawProd = row[2];
        const rawNg = row[3];
        const rawScrap = row[4];
        const point = row[5];
        const rawDefect = row[6];
        const qty = parseInt(row[7]) || 0;
        const defect = rawDefect ? rawDefect.toString().trim().toUpperCase() : '';

        const hasDateShift = hasValue(rawDate) && shift !== '';
        const hasProd = hasValue(rawProd) && rawProd.toString().trim() !== '';
        const hasDefect = hasValue(point) && defect !== '';

        if (hasDateShift && hasProd) {
            pushSession();

            const day = parseInt(rawDate) || 0;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const totalProd = parseInt(rawProd) || 0;
            const totalNg = parseInt(rawNg) || 0;
            const totalScrapVal = hasValue(rawScrap) ? (parseInt(rawScrap) || 0) : 0;

            currentSession = {
                partNumber,
                partName: partInfo ? partInfo.partName : '',
                line: partInfo ? partInfo.line : '',
                model,
                side,
                date: dateStr,
                day,
                shift,
                totalProd,
                totalNg,
                totalScrap: totalScrapVal,
                totalOk: Math.max(0, totalProd - totalNg - totalScrapVal),
                details: []
            };

            if (hasDefect) {
                currentSession.details.push({
                    pointCheck: point.toString().trim(),
                    defectCode: defect,
                    problem: DEFECT_PROBLEMS[defect] || '',
                    qty
                });
            }
        } else if (hasDateShift && !hasProd && currentSession && hasDefect) {
            currentSession.details.push({
                pointCheck: point.toString().trim(),
                defectCode: defect,
                problem: DEFECT_PROBLEMS[defect] || '',
                qty
            });
        } else if (!hasDateShift && currentSession && hasDefect) {
            currentSession.details.push({
                pointCheck: point.toString().trim(),
                defectCode: defect,
                problem: DEFECT_PROBLEMS[defect] || '',
                qty
            });
        }
    }
    pushSession();

    return sessions;
}

function parseMatrixFile(wb, month, year, model) {
    const DEFECT_DESC = [
        'Welding Undercut', 'Welding Over Lap', 'Welding Pit/Blow Hole',
        'Welding Hole', 'Welding Burn-trough', 'Welding Bead skip',
        'Welding Bead witdh', 'Dimensi Spot bolt', 'Spot Bolt Pecah',
        'Spot Bolt Ada GAP', 'Spot Bolt Ada Burry', 'Part Tidak Terpasang',
        'Others'
    ];
    const DEFECT_CODES = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    function findDefectCode(desc) {
        const d = (desc || '').trim();
        for (let i = 0; i < DEFECT_DESC.length; i++) {
            if (d.startsWith(DEFECT_DESC[i])) return DEFECT_CODES[i];
        }
        return 'M';
    }

    const sessions = [];
    const sheetNames = wb.SheetNames.filter(s => s !== 'Part List' && s !== 'sample' && !/master/i.test(s));

    for (const sheetName of sheetNames) {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 5) continue;

        // Extract part info from header rows (0-2), col 4
        function extractInfo(prefix) {
            for (let r = 0; r < 3; r++) {
                const v = data[r]?.[4];
                if (v && v.toString().includes(prefix)) {
                    return v.toString().replace(prefix, '').replace(/^[:\s]+/, '').trim();
                }
            }
            return '';
        }
        const lhPartName = extractInfo('Part Name');
        const lhPartNumber = extractInfo('Part Number');
        const lhModel = extractInfo('Model');
        const lhLine = extractInfo('Line');

        // Also read RH side info from cols 67+
        let rhPartName = '', rhPartNumber = '', rhModel2 = '', rhLine = '';
        for (let r = 0; r < 3; r++) {
            for (let c = 65; c < 120; c++) {
                const v = data[r]?.[c];
                if (v) {
                    const s = v.toString();
                    if (s.includes('Part Name')) rhPartName = s.replace(/^Part Name\s*[:\s]+/, '').trim();
                    if (s.includes('Part Number')) rhPartNumber = s.replace(/^Part Number\s*[:\s]+/, '').trim();
                    if (s.includes('Model')) rhModel2 = s.replace(/^Model\s*[:\s]+/, '').trim();
                    if (s.includes('Line')) rhLine = s.replace(/^Line\s*[:\s]+/, '').trim();
                }
            }
        }

        // Build column → (date, shift) mapping for LH (cols 2-63) and RH (cols 65-126)
        function buildDateShiftPairs(startCol, endCol) {
            const pairs = [];
            for (let c = startCol; c <= endCol; c += 2) {
                const day = parseInt(data[3]?.[c]) || 0;
                if (day > 0 && day <= 31) {
                    const shiftA = data[4]?.[c] ? data[4][c].toString().trim() : '';
                    const shiftB = data[4]?.[c + 1] ? data[4][c + 1].toString().trim() : '';
                    pairs.push({ colA: c, colB: c + 1, day, shiftA, shiftB });
                }
            }
            return pairs;
        }

        const lhDateShifts = buildDateShiftPairs(2, 62);
        const rhDateShifts = buildDateShiftPairs(65, 124);

        // Accumulate qty per (day, shift, side) → {defectCode, qty}
        const ngMap = {};

        for (let r = 5; r < data.length; r++) {
            const defectDesc = data[r]?.[1];
            if (!defectDesc || typeof defectDesc !== 'string' || defectDesc === 'GRAND TOTAL') continue;
            const defectCode = findDefectCode(defectDesc);
            if (!defectCode) continue;

            // LH columns
            for (const ds of lhDateShifts) {
                for (const { col, shift } of [{ col: ds.colA, shift: ds.shiftA }, { col: ds.colB, shift: ds.shiftB }]) {
                    const val = data[r]?.[col];
                    const qty = parseInt(val) || 0;
                    if (qty > 0) {
                        const key = `${ds.day}|${shift}|LH`;
                        if (!ngMap[key]) ngMap[key] = { day: ds.day, shift, side: 'KIRI', details: [] };
                        ngMap[key].details.push({ defectCode, qty });
                    }
                }
            }

            // RH columns
            for (const ds of rhDateShifts) {
                for (const { col, shift } of [{ col: ds.colA, shift: ds.shiftA }, { col: ds.colB, shift: ds.shiftB }]) {
                    const val = data[r]?.[col];
                    const qty = parseInt(val) || 0;
                    if (qty > 0) {
                        const key = `${ds.day}|${shift}|RH`;
                        if (!ngMap[key]) ngMap[key] = { day: ds.day, shift: ds.shift, side: 'KANAN', details: [] };
                        ngMap[key].details.push({ defectCode, qty });
                    }
                }
            }
        }

        // Create sessions from ngMap
        for (const entry of Object.values(ngMap)) {
            const isLH = entry.side === 'KIRI';
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(entry.day).padStart(2, '0')}`;
            const totalNgPoint = entry.details.reduce((sum, d) => sum + d.qty, 0);
            sessions.push({
                partNumber: isLH ? lhPartNumber : rhPartNumber,
                partName: isLH ? lhPartName : rhPartName,
                line: isLH ? lhLine : rhLine,
                model: model || lhModel || rhModel2 || '-',
                side: entry.side,
                date: dateStr,
                day: entry.day,
                shift: entry.shift || '',
                totalProd: 0,
                totalNg: totalNgPoint,
                totalScrap: 0,
                totalOk: 0,
                details: entry.details.map((d, i) => ({
                    pointCheck: String(i + 1),
                    defectCode: d.defectCode,
                    problem: DEFECT_PROBLEMS[d.defectCode] || '',
                    qty: d.qty
                }))
            });
        }
    }

    return sessions;
}

router.post('/upload-monthly', async (req, res) => {
    const pool = getPool();
    const { filePath, month: bodyMonth, year: bodyYear, model: bodyModel } = req.body;

    if (!filePath) {
        return res.status(400).json({ status: 'error', message: 'filePath required' });
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ status: 'error', message: `File not found: ${resolvedPath}` });
    }

    const filename = path.basename(resolvedPath);
    const { month, year } = parseMonthYear(filename, bodyMonth, bodyYear);
    const model = parseModelFromFilename(filename, bodyModel);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const wb = XLSX.readFile(resolvedPath);
        const sheetNames = wb.SheetNames;

        const partListSheet = wb.Sheets['Part List'];

        const results = { inserted: 0, skipped: 0, errors: [], parts: {} };

        // DETECT FORMAT: if no Part List sheet, treat as matrix format
        if (!partListSheet) {
            const sessions = parseMatrixFile(wb, month, year, model);

            for (const session of sessions) {
                const { partNumber, partName, line, model, side, date, shift, totalProd, totalNg, totalScrap, totalOk, details } = session;
                const totalNgPoint = details.reduce((sum, d) => sum + d.qty, 0);

                const [existing] = await connection.query(
                    'SELECT id FROM check_sheets WHERE part_number = ? AND date = ? AND shift = ? AND model = ? AND line_pos = ? AND (side = ? OR (side IS NULL AND ? IS NULL))',
                    [partNumber, date, shift, model, line || '', side, side]
                );

                if (existing.length > 0) {
                    results.skipped++;
                    continue;
                }

                const [headerResult] = await connection.query(`
                    INSERT INTO check_sheets (part_name, part_number, model, inspector, shift, line_pos, side, date, total_prod, total_ok, total_ng, total_ng_point, total_scrap, input_mode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    partName || '-',
                    partNumber,
                    model || '-',
                    'BULANAN',
                    shift,
                    line || '',
                    side || null,
                    date,
                    totalProd,
                    totalOk,
                    totalNg,
                    totalNgPoint,
                    totalScrap,
                    'manual'
                ]);

                const checkSheetId = headerResult.insertId;

                if (details.length > 0) {
                    const detailValues = details.map(d => [
                        checkSheetId,
                        d.pointCheck,
                        d.pointCheck,
                        d.problem,
                        d.defectCode,
                        d.qty,
                        null,
                        0,
                        100,
                        null
                    ]);
                    await connection.query(
                        'INSERT INTO check_sheet_details (check_sheet_id, point_check, check_no, problem, defect_code, qty, location, page_index, confidence, low_confidence_reason) VALUES ?',
                        [detailValues]
                    );
                }

                results.inserted++;
                const partKey = line ? `${partNumber} (${line})` : partNumber;
                if (!results.parts[partKey]) results.parts[partKey] = 0;
                results.parts[partKey]++;
            }
        } else {
            // Original format: Part List sheet + detail sheets
            const partListData = parsePartListSheet(partListSheet);
            const { rows: partListRows, byPart: partByPart } = partListData;

            const sheetCounter = {};

            for (const sheetName of sheetNames) {
                if (sheetName === 'Part List' || sheetName === 'sample') continue;

                const ws = wb.Sheets[sheetName];
                const rawHeader = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: 0 });
                const headerPartNumber = rawHeader[0] && rawHeader[0][2] ? rawHeader[0][2].toString().trim() : sheetName;

                const matchingIndices = partByPart[headerPartNumber] || [];
                if (!sheetCounter[headerPartNumber]) sheetCounter[headerPartNumber] = 0;
                const occurrence = sheetCounter[headerPartNumber]++;

                let partInfo = null;
                if (occurrence < matchingIndices.length) {
                    partInfo = partListRows[matchingIndices[occurrence]];
                }

                const sessions = parseDetailSheet(ws, headerPartNumber, partInfo, month, year, model);

                for (const session of sessions) {
                    const { partNumber, partName, line, model, side, date, shift, totalProd, totalNg, totalScrap, totalOk, details } = session;
                    const totalNgPoint = details.reduce((sum, d) => sum + d.qty, 0);

                    const [existing] = await connection.query(
                        'SELECT id FROM check_sheets WHERE part_number = ? AND date = ? AND shift = ? AND model = ? AND line_pos = ? AND (side = ? OR (side IS NULL AND ? IS NULL))',
                        [partNumber, date, shift, model, line || '', side, side]
                    );

                    if (existing.length > 0) {
                        results.skipped++;
                        continue;
                    }

                    const [headerResult] = await connection.query(`
                        INSERT INTO check_sheets (part_name, part_number, model, inspector, shift, line_pos, side, date, total_prod, total_ok, total_ng, total_ng_point, total_scrap, input_mode)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        partName || '-',
                        partNumber,
                        model || '-',
                        'BULANAN',
                        shift,
                        line || '',
                        side || null,
                        date,
                        totalProd,
                        totalOk,
                        totalNg,
                        totalNgPoint,
                        totalScrap,
                        'manual'
                    ]);

                    const checkSheetId = headerResult.insertId;

                    if (details.length > 0) {
                        const detailValues = details.map(d => [
                            checkSheetId,
                            d.pointCheck,
                            d.pointCheck,
                            d.problem,
                            d.defectCode,
                            d.qty,
                            null,
                            0,
                            100,
                            null
                        ]);
                        await connection.query(
                            'INSERT INTO check_sheet_details (check_sheet_id, point_check, check_no, problem, defect_code, qty, location, page_index, confidence, low_confidence_reason) VALUES ?',
                            [detailValues]
                        );
                    }

                    results.inserted++;
                    const partKey = line ? `${partNumber} (${line})` : partNumber;
                    if (!results.parts[partKey]) results.parts[partKey] = 0;
                    results.parts[partKey]++;
                }
            }
        }

        await connection.commit();
        res.json({
            status: 'success',
            message: `Import complete for ${filename}`,
            data: {
                month: `${month}/${year}`,
                totalInserted: results.inserted,
                totalSkipped: results.skipped,
                parts: results.parts
            }
        });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
