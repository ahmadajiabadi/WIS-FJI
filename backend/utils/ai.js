const geminiModels = [
    'gemini-3.5-flash',
    'gemini-3.5-pro'
    
];

/**
 * Sends check sheet images to Gemini API with fallback models.
 * @param {Array} images Array of { base64, mimeType }
 * @param {string} customApiKey Optional user-supplied API Key
 * @returns {Promise<Object>}
 */
async function performAiScan(images, customApiKey = null) {
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, message: 'API Key Gemini tidak ditemukan.' };

    const prompt = `
        TASK: QC Data Extraction from Check Sheet (Industrial Grade Accuracy with Self-Verification & Visual Reasoning).
        IMPORTANT: You may receive multiple images (pages). Merge all data from all pages into a SINGLE unified JSON report.

        ANALYZED CHECK SHEET STRUCTURE:
        1. Header Section (Top):
           - Part Name: Located below the large title (e.g., "FRAME SUB-ASSY No.2 SEAT CUSHION LH").
           - Part Number: Located below Part Name (e.g., "79360-BZ100").
           - Model: Located to the right of Part Name (e.g., "D02A").
           - Date: Located below Model. Detect formats like DD/MM/YY or DD-MM-YY and normalize to "YYYY-MM-DD" (e.g., "07-05-26" -> "2026-05-07").
           - Shift: Located below Date (e.g., "B").
           - Inspector / Name (Nama): Handwritten name near Model/Date (e.g., "Lies. M").
           - Line/Post (Line/Pos): Line/Position information if filled.
        2. Parts Diagram / Drawings (Point Check) at the top: IGNORE COMPLETELY. Focus only on the main table below it.
        3. Main Table:
           - Column 1 (Check NO): Sequential check point number (the row number on the far left).
           - Column 2 (PROBLEM Point Check): Name of check point (default: "Robot Welding").
           - Column 3+ (Defect Columns): Each column represents 1 type of defect with different codes (A to M).
           - Column TTL NG (far right): Total defect number per row written by the operator — USE ONLY AS A REFERENCE FOR CROSS-CHECKING, NOT THE PRIMARY SOURCE OF TRUTH.
        4. Bottom Summary (Handwritten):
           - TTL PROD (Total Production), TTL OK (Total OK), TTL NG (Total NG Parts), TTL SCRAP.

        ═══════════════════════════════════════════════════════════
        RULE #1 — PHYSICAL GRID-LINE TRACING (PREVENTING INCORRECT CHECK NO):
        ═══════════════════════════════════════════════════════════
        ISSUE: Uploaded photos are often tilted (skewed) to the left or right, meaning rows are not perfectly horizontal on the screen. If you draw a straight horizontal line based on the screen's Y-coordinate, you will read the WRONG Check NO (e.g., a tally mark in Row 23 might appear aligned with Row 25's Check NO).

        MANDATORY METHOD - PHYSICAL GRID-LINE TRACING:
        a) Locate the handwritten tally marks (turus) inside the defect columns.
        b) DO NOT draw a straight horizontal line to the left on the screen.
        c) Visually follow the PHYSICAL ROW DIVISION GRID LINE (the printed table grid border line) printed directly below or above that tally mark. Follow the line's natural angle of skew/tilt as you trace to the left.
        d) Trace along this printed grid border line until you reach the far-left edge of the table, and read the handwritten or printed Check NO digit inside that physical row.
        e) Skew Example (Tilted Right): If the paper is tilted to the right, the right end of a row on screen is lower than its left end. A tally mark on the right that appears Y-aligned with the number "25" on the left, when traced along its physical tilted grid boundary line to the left, actually points to the number "23".
        f) You MUST populate the "rowAnalysis" field in INDONESIAN for every single detail row, explaining this physical tracing process.

        ═══════════════════════════════════════════════════════════
        RULE #2 — TALLY MARKS AS THE PRIMARY SOURCE OF TRUTH:
        ═══════════════════════════════════════════════════════════
        a) TALLY MARKS (turus) inside the defect cells are the primary physical proof. The count of these marks MUST be the "qty" value, NOT the number written in the TTL NG column.
        b) NEVER change the "qty" count derived from tally marks to match the TTL NG value if they differ! If there is a difference, record the correct tally count as "qty", drastically lower the confidence score of the row, and explain the mismatch in the "lowConfidenceReason" field.

        TALLY MARK COUNTING RULES (SYSTEM OF FIVE):
        • 1 vertical stroke (|) = 1
        • 2 vertical strokes (||) = 2
        • 3 vertical strokes (|||) = 3
        • 4 vertical strokes (||||) = 4
        • 4 vertical strokes + 1 DIAGONAL/SLASH stroke (/) crossing all 4 = 5 (ONE GROUP OF FIVE).
          → The diagonal stroke can be a slash (/), backslash (\), or cross (x). As long as it crosses the vertical strokes, it represents a group of 5.
          → The diagonal stroke completes the group of 5; it is NOT an additional stroke. Thus, "||||/" is 5, NOT 4+1+1=6.
          
        FORMULA: Qty = (Number of Groups of Five * 5) + Remaining single vertical strokes.

        REAL-WORLD CASE EXAMPLE:
        • 4 diagonal groups + 4 single vertical strokes = (4 * 5) + 4 = 24.
          (EXAMPLE: Welding Undercut Point 23 often gets misread as 19 because the AI fails to count the 5-groups carefully. Ensure you count 4 diagonal groups = 20, plus 4 single strokes = 24).
        • 3 diagonal groups + 4 single vertical strokes = (3 * 5) + 4 = 19.

        ═══════════════════════════════════════════════════════════
        RULE #3 — DENSE OR OVERFLOWING DEFECTS (SPILLOVER):
        ═══════════════════════════════════════════════════════════
        a) If the tally marks in a row are extremely dense and overflow their cell boundary (spillover) or bleed into adjacent columns:
           - Still count all marks in that row as a single set of tallies.
           - Reduce the confidence score of that row to < 65% because the risk of counting errors due to handwriting density is very high.
           - Set "lowConfidenceReason" in INDONESIAN to: "Turus sangat padat dan melewati batas kolom/spillover".

        ═══════════════════════════════════════════════════════════
        RULE #4 — VERIFICATION WITH TTL NG COLUMN (CROSS-CHECK ONLY):
        ═══════════════════════════════════════════════════════════
        a) Count the total tally marks in the row.
        b) Read the handwritten digit in the "TTL NG" column on the far right of the row.
        c) Compare the two.
        d) If they MATCH: Excellent, the row confidence is high.
        e) If they MISMATCH:
           - DO NOT alter the "qty" calculated from the tally marks. Keep the tally mark count as "qty".
           - Penalize the confidence score heavily (set confidence to a maximum of 60%).
           - You MUST write in "lowConfidenceReason" in INDONESIAN: "Mismatch: Hitungan turus = [X], tetapi kolom TTL NG tertulis [Y]".

        ═══════════════════════════════════════════════════════════
        RULE #5 — CONFIDENCE SCORE DEDUCTION SYSTEM:
        ═══════════════════════════════════════════════════════════
        Do not assign high confidence scores (90%+) arbitrarily. Use the following deduction rules:

        ROW-LEVEL CONFIDENCE (details[i].confidence):
        • Start at 100%.
        • Tally mark vs TTL NG column mismatch: Deduct 40% (max 60% remaining).
        • Extremely dense/overlapping tally marks or cell boundary spillover: Deduct 35% (max 65% remaining).
        • Skewed/tilted photo where table grid lines slope by > 5 degrees: Deduct 15%.
        • Faint ink, blurry image, noise, or ink overlapping adjacent rows: Deduct 15%.
        • Check NO is not sequential/consistent with surrounding rows: Deduct 20%.

        OVERALL DOCUMENT CONFIDENCE (summary.confidenceScore):
        • Average of all details[i].confidence values, with the following additional penalties:
          - If more than 1 row has a TTL NG mismatch: Deduct 15% from the total score.
          - If more than 1 row has dense/spillover tallies: Deduct 10% from the total score.
          - If the photo is visibly tilted/skewed: Deduct 10% from the total score.

        ═══════════════════════════════════════════════════════════
        JSON OUTPUT SPECIFICATION (Return ONLY valid JSON, do NOT wrap in markdown blocks):
        ═══════════════════════════════════════════════════════════
        {
          "meta": { 
            "partName": "string", 
            "partNumber": "string", 
            "model": "string", 
            "date": "YYYY-MM-DD", 
            "nama": "string", 
            "shift": "string", 
            "linePos": "string" 
          },
          "summary": { 
            "totalProduksi": number, 
            "totalOK": number, 
            "totalNG": number, 
            "totalScrap": number, 
            "totalNGPoint": number, 
            "confidenceScore": number 
          },
          "details": [
            { 
              "checkNo": "string", 
              "rowAnalysis": "Write in INDONESIAN. Highly detailed visual explanation of how the physical table grid line was traced from the tally marks to the far left to identify the Check NO (e.g., 'Merunut garis fisik tabel yang miring ke kanan dari turus, baris ini mengarah ke nomor Check NO 23')",
              "tallyAnalysis": "Write in INDONESIAN. Visual breakdown of how tally marks were counted (e.g., 'Ditemukan 4 kelompok turus diagonal (4*5=20) ditambah 4 garis tunggal = 24')",
              "pointCheck": "Robot Welding", 
              "problem": "Welding Undercut", 
              "defectCode": "A", 
              "qty": 24, 
              "location": [ymin, xmin, ymax, xmax], 
              "pageIndex": 0, 
              "confidence": 60, 
              "lowConfidenceReason": "Write in INDONESIAN if confidence < 90, otherwise empty. (e.g., 'Mismatch: Hitungan turus = 24, tetapi kolom TTL NG tertulis 19')" 
            }
          ]
        }

        DEFAULT DEFECT CODES CATEGORIES (A-M):
        A: Welding Undercut, B: Welding Over Lap, C: Welding Pit/Blow Hole, D: Welding Hole, E: Welding Burn-through, F: Welding Bead skip, G: Welding Bead width, H: Dimensi Spot bolt Tidak STD, I: Spot Bolt Pecah/Retak, J: Spot Bolt Ada GAP, K: Spot Bolt Ada Burry, L: Part Tidak Terpasang, M: Others.

        STRICT MULTI-PAGE & COORDINATES RULES:
        - The first page has pageIndex 0, the second page has pageIndex 1, etc.
        - The "pageIndex" property MUST be present on every item inside "details".
        - COORDINATES: Use a scale of 0 to 1000 for [ymin, xmin, ymax, xmax] independently for each page/image.
        - IMPORTANT: The coordinate bounding box MUST tightly wrap the handwritten tally ink marks themselves, NOT the printed table cell.
    `;

    let lastError = null;
    for (const model of geminiModels) {
        try {
            const visualParts = images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }, ...visualParts] }]
            };
            const versions = ['v1beta', 'v1'];
            for (const ver of versions) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json();
                    if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
                        let text = result.candidates[0].content.parts[0].text;
                        text = text.replace(/```json|```/g, "").trim();
                        return { success: true, data: JSON.parse(text), modelUsed: model };
                    }
                } catch (e) { 
                    lastError = e.message; 
                }
            }
        } catch (e) { 
            lastError = e.message; 
        }
    }
    return { success: false, message: lastError || 'Gagal menghubungi AI' };
}

module.exports = {
    performAiScan
};
