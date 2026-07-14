const mysql = require('mysql2/promise');

let pool = null;

async function initDB() {
    try {
        // 1. Connect without database to create it if not exists
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
        });

        console.log('✅ Connected to MySQL');
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log(`✅ Database ${process.env.DB_NAME} ensured`);
        await connection.end();

        // 2. Initialize the pool with the database
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            dateStrings: true,
        });

        // 3. Create tables & Ensure columns exist (Migrations)
        const poolConn = await pool.getConnection();

        // check_sheets table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS check_sheets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                part_name VARCHAR(255),
                part_number VARCHAR(100),
                model VARCHAR(100),
                inspector VARCHAR(100),
                shift VARCHAR(20),
                line_pos VARCHAR(50),
                side ENUM('KIRI','KANAN') DEFAULT NULL,
                session_group VARCHAR(36) DEFAULT NULL,
                date DATE,
                total_prod INT DEFAULT 0,
                total_ok INT DEFAULT 0,
                total_ng INT DEFAULT 0,
                total_ng_point INT DEFAULT 0,
                total_scrap INT DEFAULT 0,
                image_path VARCHAR(255),
                notes TEXT,
                confidence_score INT DEFAULT 100,
                input_mode ENUM('ocr', 'voice', 'manual') DEFAULT 'ocr',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check for 'image_path' column (migration)
        const [sheetColsPath] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'image_path'");
        if (sheetColsPath.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN image_path VARCHAR(255) AFTER total_scrap");
            console.log('✅ Added image_path column to check_sheets');
        }

        // scan_drafts Table (Queue)
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS scan_drafts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                image_path TEXT,
                status ENUM('pending', 'processing', 'ready', 'error') DEFAULT 'pending',
                scan_data JSON,
                model_used VARCHAR(100),
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure image_path is TEXT (not VARCHAR) to support multiple paths
        const [draftPathCol] = await poolConn.query("SHOW COLUMNS FROM scan_drafts LIKE 'image_path'");
        if (draftPathCol.length > 0 && draftPathCol[0].Type.includes('varchar')) {
            await poolConn.query("ALTER TABLE scan_drafts MODIFY COLUMN image_path TEXT");
            console.log('✅ Migrated image_path to TEXT in scan_drafts');
        }

        // Check for 'model_used' column in scan_drafts (migration)
        const [draftCols] = await poolConn.query("SHOW COLUMNS FROM scan_drafts LIKE 'model_used'");
        if (draftCols.length === 0) {
            await poolConn.query("ALTER TABLE scan_drafts ADD COLUMN model_used VARCHAR(100) AFTER scan_data");
            console.log('✅ Added model_used column to scan_drafts');
        }

        // Check for 'notes' column in scan_drafts (migration)
        const [draftNoteCols] = await poolConn.query("SHOW COLUMNS FROM scan_drafts LIKE 'notes'");
        if (draftNoteCols.length === 0) {
            await poolConn.query("ALTER TABLE scan_drafts ADD COLUMN notes TEXT AFTER error_message");
            console.log('✅ Added notes column to scan_drafts');
        }

        // Check if 'notes' column exists (for existing check_sheets tables)
        const [sheetCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'notes'");
        if (sheetCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN notes TEXT AFTER total_scrap");
            console.log('✅ Added notes column to check_sheets');
        }

        // check_sheet_details table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS check_sheet_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                check_sheet_id INT,
                point_check VARCHAR(255),
                check_no VARCHAR(50),
                problem VARCHAR(255),
                defect_code VARCHAR(10),
                qty INT,
                location JSON,
                FOREIGN KEY (check_sheet_id) REFERENCES check_sheets(id) ON DELETE CASCADE
            )
        `);

        // Check if 'location' column exists
        const [detailCols] = await poolConn.query("SHOW COLUMNS FROM check_sheet_details LIKE 'location'");
        if (detailCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheet_details ADD COLUMN location JSON AFTER qty");
            console.log('✅ Added location column to check_sheet_details');
        }

        // Check if 'page_index' column exists
        const [pageIndexCols] = await poolConn.query("SHOW COLUMNS FROM check_sheet_details LIKE 'page_index'");
        if (pageIndexCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheet_details ADD COLUMN page_index INT DEFAULT 0 AFTER location");
            console.log('✅ Added page_index column to check_sheet_details');
        }

        // Check for 'total_ng_point' in check_sheets (migration)
        const [sheetNgPointCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'total_ng_point'");
        if (sheetNgPointCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN total_ng_point INT DEFAULT 0 AFTER total_ng");
            console.log('✅ Added total_ng_point column to check_sheets');
        }

        // Check for 'line_pos' in check_sheets (migration)
        const [sheetLineCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'line_pos'");
        if (sheetLineCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN line_pos VARCHAR(50) AFTER shift");
            console.log('✅ Added line_pos column to check_sheets');
        }

        // Check for 'side' in check_sheets (migration)
        const [sheetSideCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'side'");
        if (sheetSideCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN side ENUM('KIRI','KANAN') DEFAULT NULL AFTER line_pos");
            console.log('✅ Added side column to check_sheets');
        }

        // Check for 'session_group' in check_sheets (migration)
        const [sheetSessionCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'session_group'");
        if (sheetSessionCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN session_group VARCHAR(36) DEFAULT NULL AFTER side");
            console.log('✅ Added session_group column to check_sheets');
        }

        // Check for 'defect_code' in check_sheet_details (migration)
        const [detailCodeCols] = await poolConn.query("SHOW COLUMNS FROM check_sheet_details LIKE 'defect_code'");
        if (detailCodeCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheet_details ADD COLUMN defect_code VARCHAR(10) AFTER problem");
            console.log('✅ Added defect_code column to check_sheet_details');
        }

        // Check for 'confidence_score' in check_sheets (migration)
        const [sheetConfCols] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'confidence_score'");
        if (sheetConfCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN confidence_score INT DEFAULT 100 AFTER notes");
            console.log('✅ Added confidence_score column to check_sheets');
        }

        // Check for 'input_mode' column (migration)
        const [sheetColsMode] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'input_mode'");
        if (sheetColsMode.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN input_mode ENUM('ocr', 'voice', 'manual') DEFAULT 'ocr' AFTER confidence_score");
            console.log('✅ Added input_mode column to check_sheets');
        }

        // Migration: total_check_time, total_checks, efficiency in check_sheets
        const [sheetTimeCol] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'total_check_time'");
        if (sheetTimeCol.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN total_check_time DECIMAL(10,2) DEFAULT 0 AFTER input_mode");
            console.log('✅ Added total_check_time column to check_sheets');
        }
        const [sheetChecksCol] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'total_checks'");
        if (sheetChecksCol.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN total_checks INT DEFAULT 0 AFTER total_check_time");
            console.log('✅ Added total_checks column to check_sheets');
        }
        const [sheetEffCol] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'efficiency'");
        if (sheetEffCol.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN efficiency DECIMAL(5,2) DEFAULT 0 AFTER total_checks");
            console.log('✅ Added efficiency column to check_sheets');
        }

        // Migration: timestart, timeend, takt_time_sec in check_sheets
        const [sheetTimeStart] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'timestart'");
        if (sheetTimeStart.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN timestart DATETIME DEFAULT NULL AFTER efficiency");
            console.log('✅ Added timestart column to check_sheets');
        }
        const [sheetTimeEnd] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'timeend'");
        if (sheetTimeEnd.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN timeend DATETIME DEFAULT NULL AFTER timestart");
            console.log('✅ Added timeend column to check_sheets');
        }
        const [sheetTakt] = await poolConn.query("SHOW COLUMNS FROM check_sheets LIKE 'takt_time_sec'");
        if (sheetTakt.length === 0) {
            await poolConn.query("ALTER TABLE check_sheets ADD COLUMN takt_time_sec INT DEFAULT 60 AFTER timeend");
            console.log('✅ Added takt_time_sec column to check_sheets');
        }

        // Migration: session_id in part_check_times
        const [pctSession] = await poolConn.query("SHOW COLUMNS FROM part_check_times LIKE 'session_id'");
        if (pctSession.length === 0) {
            await poolConn.query("ALTER TABLE part_check_times ADD COLUMN session_id VARCHAR(36) DEFAULT NULL AFTER check_sheet_id, ADD INDEX idx_pct_session (session_id)");
            console.log('✅ Added session_id column to part_check_times');
        }

        // Check for 'confidence' in check_sheet_details (migration)
        const [detailConfCols] = await poolConn.query("SHOW COLUMNS FROM check_sheet_details LIKE 'confidence'");
        if (detailConfCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheet_details ADD COLUMN confidence INT DEFAULT 100 AFTER page_index");
            console.log('✅ Added confidence column to check_sheet_details');
        }

        // Check for 'low_confidence_reason' in check_sheet_details (migration)
        const [detailReasonCols] = await poolConn.query("SHOW COLUMNS FROM check_sheet_details LIKE 'low_confidence_reason'");
        if (detailReasonCols.length === 0) {
            await poolConn.query("ALTER TABLE check_sheet_details ADD COLUMN low_confidence_reason VARCHAR(255) DEFAULT NULL AFTER confidence");
            console.log('✅ Added low_confidence_reason column to check_sheet_details');
        }

        // Create Part Master table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS part_master (
                part_number VARCHAR(100),
                part_name VARCHAR(255),
                model VARCHAR(100) NOT NULL DEFAULT '-',
                image_path VARCHAR(255),
                PRIMARY KEY (part_number, model)
            )
        `);

        // Migration: Ensure model, image_path, marker_size, and total_points exist in part_master
        const [partMasterCols] = await poolConn.query("SHOW COLUMNS FROM part_master");
        const colNames = partMasterCols.map(c => c.Field);
        if (!colNames.includes('model')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN model VARCHAR(100) AFTER part_name");
            console.log('✅ Added model column to part_master');
        }
        if (!colNames.includes('image_path')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN image_path VARCHAR(255) AFTER model");
            console.log('✅ Added image_path column to part_master');
        }
        if (!colNames.includes('marker_size')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN marker_size INT DEFAULT 32 AFTER image_path");
            console.log('✅ Added marker_size column to part_master');
        }
        if (!colNames.includes('total_points')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN total_points INT DEFAULT 0 AFTER marker_size");
            console.log('✅ Added total_points column to part_master');
        }
        if (!colNames.includes('takt_time')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN takt_time INT DEFAULT 60 AFTER total_points");
            console.log('✅ Added takt_time column to part_master');
        }
        if (!colNames.includes('line')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN line VARCHAR(100) DEFAULT NULL AFTER model");
            console.log('✅ Added line column to part_master');
        }
        if (!colNames.includes('side_type')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN side_type VARCHAR(20) NOT NULL DEFAULT 'umum' AFTER line");
            console.log('✅ Added side_type column to part_master');
        }
        if (!colNames.includes('paired_part_number')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN paired_part_number VARCHAR(100) DEFAULT NULL AFTER side_type");
            console.log('✅ Added paired_part_number column to part_master');
        }
        if (!colNames.includes('paired_model')) {
            await poolConn.query("ALTER TABLE part_master ADD COLUMN paired_model VARCHAR(100) DEFAULT NULL AFTER paired_part_number");
            console.log('✅ Added paired_model column to part_master');
        }

        // Migration: Clean up D26A model — delete plain 'D26A', merge 'D26A Front'/'D26A Rear' to 'D26A'
        try {
            await poolConn.query("DELETE FROM part_master WHERE model = 'D26A'");
            await poolConn.query("UPDATE part_master SET model = 'D26A' WHERE model IN ('D26A Front', 'D26A Rear')");
            console.log('✅ Cleaned up D26A model entries in part_master');
        } catch (e) {
            if (!e.message.includes('Duplicate entry')) throw e;
            console.log('⚠️ D26A cleanup skipped (PK conflict) — run manually');
        }

        // Migration: Change PK from part_number to composite (part_number, model)
        const [pkInfo] = await poolConn.query("SHOW KEYS FROM part_master WHERE Key_name = 'PRIMARY'");
        if (pkInfo.length === 1) {
            // Old schema: PK is only part_number. Set default model, drop FK, migrate PK.
            await poolConn.query("UPDATE part_master SET model = '-' WHERE model IS NULL OR model = ''");
            try {
                await poolConn.query("ALTER TABLE part_check_points DROP FOREIGN KEY part_check_points_ibfk_1");
            } catch (e) { /* FK may not exist on fresh installs */ }
            await poolConn.query("ALTER TABLE part_master DROP PRIMARY KEY");
            await poolConn.query("ALTER TABLE part_master ADD PRIMARY KEY (part_number, model)");
            console.log('✅ Migrated part_master PK to composite (part_number, model)');
        }

        // Create Part Check Points table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS part_check_points (
                id INT AUTO_INCREMENT PRIMARY KEY,
                part_number VARCHAR(100),
                model VARCHAR(100) NOT NULL DEFAULT '-',
                side ENUM('KIRI','KANAN') DEFAULT NULL,
                check_no VARCHAR(50),
                x_coord DOUBLE,
                y_coord DOUBLE
            )
        `);

        // Check for 'model' in part_check_points (migration for existing tables)
        const [ptModelCols] = await poolConn.query("SHOW COLUMNS FROM part_check_points LIKE 'model'");
        if (ptModelCols.length === 0) {
            await poolConn.query("ALTER TABLE part_check_points ADD COLUMN model VARCHAR(100) NOT NULL DEFAULT '-' AFTER part_number");
            console.log('✅ Added model column to part_check_points');
            
            // Populate model based on the first matching model in part_master
            try {
                await poolConn.query(`
                    UPDATE part_check_points pcp
                    INNER JOIN (
                        SELECT part_number, MIN(model) as first_model
                        FROM part_master
                        GROUP BY part_number
                    ) pm ON pcp.part_number = pm.part_number
                    SET pcp.model = pm.first_model
                `);
                console.log('✅ Populated model column in part_check_points from part_master');
            } catch (updateErr) {
                console.warn('⚠️ Failed to populate model in part_check_points:', updateErr.message);
            }
        }

        // Check for 'side' in part_check_points (migration for existing tables)
        const [ptSideCols] = await poolConn.query("SHOW COLUMNS FROM part_check_points LIKE 'side'");
        if (ptSideCols.length === 0) {
            await poolConn.query("ALTER TABLE part_check_points ADD COLUMN side ENUM('KIRI','KANAN') DEFAULT NULL AFTER model");
            console.log('✅ Added side column to part_check_points');
        }

        // Create Live QC Monitoring table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS live_qc_monitoring (
                id INT AUTO_INCREMENT PRIMARY KEY,
                inspector VARCHAR(100) UNIQUE,
                shift VARCHAR(20),
                line_pos VARCHAR(50),
                part_number VARCHAR(100),
                part_name VARCHAR(255),
                model VARCHAR(100),
                total_ok INT DEFAULT 0,
                total_ng INT DEFAULT 0,
                total_scrap INT DEFAULT 0,
                problems_list JSON,
                last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // Check for 'side_data' in live_qc_monitoring (migration)
        const [liveSideCols] = await poolConn.query("SHOW COLUMNS FROM live_qc_monitoring LIKE 'side_data'");
        if (liveSideCols.length === 0) {
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD COLUMN side_data JSON AFTER problems_list");
            console.log('✅ Added side_data column to live_qc_monitoring');
        }

        // Migration: efficiency columns for live_qc_monitoring
        const [liveEffCol] = await poolConn.query("SHOW COLUMNS FROM live_qc_monitoring LIKE 'efficiency'");
        if (liveEffCol.length === 0) {
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD COLUMN efficiency INT DEFAULT 0 AFTER total_scrap");
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD COLUMN total_check_time INT DEFAULT 0 AFTER efficiency");
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD COLUMN total_checks INT DEFAULT 0 AFTER total_check_time");
            console.log('✅ Added efficiency columns to live_qc_monitoring');
        }

        console.log('✅ Live QC Monitoring table initialized');

        // Migration: side column + unique(inspector, side) for per-side live monitoring
        const [liveSideCol] = await poolConn.query("SHOW COLUMNS FROM live_qc_monitoring LIKE 'side'");
        if (liveSideCol.length === 0) {
            const [existingIdx] = await poolConn.query("SHOW INDEX FROM live_qc_monitoring WHERE Key_name = 'inspector'");
            if (existingIdx.length > 0) {
                await poolConn.query("ALTER TABLE live_qc_monitoring DROP INDEX inspector");
            }
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD COLUMN side VARCHAR(10) NOT NULL DEFAULT 'KIRI' AFTER inspector");
            await poolConn.query("ALTER TABLE live_qc_monitoring ADD UNIQUE KEY unique_inspector_side (inspector, side)");
            console.log('✅ Migrated live_qc_monitoring: side column + unique(inspector, side)');
        }

        // Create Voice Guides table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS voice_guides (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(10) NOT NULL,
                name VARCHAR(255) NOT NULL,
                keywords TEXT NOT NULL,
                feedback_text VARCHAR(255) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Add feedback_text column if missing (existing databases)
        try { await poolConn.query('ALTER TABLE voice_guides ADD COLUMN feedback_text VARCHAR(255) DEFAULT \'\' AFTER keywords'); } catch (e) {}

        // Seed default voice guides if empty
        const [vgCount] = await poolConn.query('SELECT COUNT(*) as count FROM voice_guides');
        if (vgCount[0].count === 0) {
            const defaultGuides = [
                ['A', 'Weld.Undercut (Memotong Part)', 'undercut,memotong', 'Memotong'],
                ['B', 'Weld.Over Lap (Tembus / Berlebih)', 'overlap,tembus,berlebih', 'Berlebih'],
                ['C', 'Weld.Pit/Blow Hole (Keropos)', 'pit,blow hole,keropos', 'Keropos'],
                ['D', 'Weld.Hole (Berlubang)', 'hole,berlubang,bolong', 'Bolong'],
                ['E', 'Weld.Burn-trough (Meleleh)', 'burn-through,burn-trough,meleleh', 'Meleleh'],
                ['F', 'Weld.Bead skip (Welding Putus)', 'bead skip,putus', 'Putus'],
                ['G', 'Weld.Bead witdh (Pergeseran Welding)', 'bead width,bead witdh,pergeseran', 'Bergeser'],
                ['H', 'Hole Tidak Ada', 'tidak ada,hole hilang,hole kosong', 'Hole tidak ada'],
                ['H', 'Hole Tidak Centre', 'tidak centre,tidak senter,tidak tengah', 'Tidak senter'],
                ['H', 'Hole Ada Sparter', 'sparter,percikan,terpercik,supporter,separtor,starter,spater', 'Percikan'],
                ['H', 'Hole Terlalu Besar', 'terlalu besar,besar', 'Terlalu besar'],
                ['H', 'Hole Oval', 'oval,hole oval,hall over', 'Oval'],
                ['I', 'Headrest Miring', 'miring,headrest miring', 'Miring'],
                ['I', 'Headrest Timplang', 'timplang,headrest timplang', 'Timplang'],
                ['I', 'Pitch Headrest NG', 'pitch,pitch ng,jarak headrest,headrest pitch,jarak ng,lubang headrest', 'Pitch NG'],
                ['J', 'Pemasangan Miring', 'pemasangan miring', 'Miring'],
                ['K', 'Bolt T/A', 'bolt,baut,baut tidak ada', 'Baut T/A'],
                ['L', 'Tidak Flat', 'tidak flat,bengkok,tidak rata', 'Tidak flat'],
                ['M', 'Spiner GAP dengan adjuster', 'spiner gap,gap adjuster,spiner get,gap', 'Spiner GAP'],
                ['M', 'Spiner Kecil', 'spiner kecil', 'Spiner kecil'],
                ['M', 'Spring T/A', 'spring,per tidak ada,tidak ada', 'Spring T/A'],
                ['M', 'Silincer T/A', 'silincer', 'Silincer T/A'],
                ['M', 'Others', 'lainnya,others,baret,kotor,cacat lain,lain-lain,lain lain,scratch', 'Lainnya']
            ];
            for (const g of defaultGuides) {
                await poolConn.query('INSERT INTO voice_guides (code, name, keywords, feedback_text) VALUES (?, ?, ?, ?)', g);
            }
            console.log('✅ Voice guides seeded with ' + defaultGuides.length + ' items');
        }

        // Create Voice Commands table (quantity commands: OK, NG, Scrap, Undo)
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS voice_commands (
                id INT AUTO_INCREMENT PRIMARY KEY,
                command_type VARCHAR(20) NOT NULL,
                keyword VARCHAR(100) NOT NULL,
                feedback_text VARCHAR(255) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add feedback_text column if missing (existing databases)
        try { await poolConn.query('ALTER TABLE voice_commands ADD COLUMN feedback_text VARCHAR(255) DEFAULT \'\' AFTER keyword'); } catch (e) {}

        // Seed default voice commands if empty
        const [vcCount] = await poolConn.query('SELECT COUNT(*) as count FROM voice_commands');
        if (vcCount[0].count === 0) {
            const defaultCommands = [
                ['ok', 'ok', 'Okee'], ['ok', 'oke', 'Okee'], ['ok', 'bagus', 'Okee'], ['ok', 'frame ok', 'Okee'], ['ok', 'frame oke', 'Okee'], ['ok', 'frame bagus', 'Okee'],
                ['ng_frame', 'cacat', 'Cacat'], ['ng_frame', 'reject', 'Cacat'], ['ng_frame', 'rijek', 'Cacat'], ['ng_frame', 'gagal', 'Cacat'], ['ng_frame', 'defect', 'Cacat'], ['ng_frame', 'ng', 'Cacat'], ['ng_frame', 'enji', 'Cacat'], ['ng_frame', 'nji', 'Cacat'], ['ng_frame', 'anji', 'Cacat'],
                ['scrap', 'buang', 'Scrap'], ['scrap', 'scrap', 'Scrap'], ['scrap', 'dibuang', 'Scrap'],
                ['undo', 'batal', 'Dihapus'], ['undo', 'hapus', 'Dihapus'], ['undo', 'undo', 'Dihapus']
            ];
            for (const c of defaultCommands) {
                await poolConn.query('INSERT INTO voice_commands (command_type, keyword, feedback_text) VALUES (?, ?, ?)', c);
            }
            console.log('✅ Voice commands seeded with ' + defaultCommands.length + ' items');
        }

        // Ensure 'finish' voice command is seeded
        const [finishCount] = await poolConn.query("SELECT COUNT(*) as count FROM voice_commands WHERE command_type = 'finish'");
        if (finishCount[0].count === 0) {
            await poolConn.query("INSERT INTO voice_commands (command_type, keyword, feedback_text) VALUES ('finish', 'sudah selesai', 'Selesai'), ('finish', 'selesai', 'Selesai')");
            console.log("✅ Seeded default 'finish' voice commands");
        }

        // Seed sample data for Part Master
        const [parts] = await poolConn.query('SELECT COUNT(*) as count FROM part_master');
        if (parts[0].count === 0) {
            await poolConn.query(`
                INSERT INTO part_master (part_number, part_name, model, total_points) VALUES 
                ('P001', 'FRAME WELDING REAR', '-', 20),
                ('P002', 'BRACKET SIDE R/L', '-', 15),
                ('P003', 'SUPPORT ENGINE FRONT', '-', 10),
                ('P004', 'COVER BATTERY UPPER', '-', 25),
                ('P005', 'HANGER MUFFLER', '-', 8)
            `);
            console.log('✅ Part Master seeded with total_points');
        } else {
            // Update existing parts if total_points is still 0
            await poolConn.query(`
                UPDATE part_master SET total_points = CASE 
                    WHEN part_number = 'P001' THEN 20
                    WHEN part_number = 'P002' THEN 15
                    WHEN part_number = 'P003' THEN 10
                    WHEN part_number = 'P004' THEN 25
                    WHEN part_number = 'P005' THEN 8
                    ELSE total_points
                END WHERE total_points = 0 OR total_points IS NULL
            `);
            console.log('✅ Updated existing part master total_points values');
        }

        poolConn.release();
        // Create Timer Breaks table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS timer_breaks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                break_label VARCHAR(100) NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Timer breaks table initialized');

        // Migrate timer_breaks: add day-of-week columns if not exist
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN monday TINYINT(1) DEFAULT 1 AFTER end_time`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN tuesday TINYINT(1) DEFAULT 1 AFTER monday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN wednesday TINYINT(1) DEFAULT 1 AFTER tuesday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN thursday TINYINT(1) DEFAULT 1 AFTER wednesday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN friday TINYINT(1) DEFAULT 1 AFTER thursday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN saturday TINYINT(1) DEFAULT 0 AFTER friday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        try {
            await poolConn.query(`ALTER TABLE timer_breaks ADD COLUMN sunday TINYINT(1) DEFAULT 0 AFTER saturday`);
        } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        console.log('✅ Timer breaks day-of-week columns ensured');

        // Create Inspectors master table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS inspectors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Inspectors table initialized');

        // Create Line Positions master table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS line_positions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Line Positions table initialized');

        // Create Abnormality Categories table (4M1E)
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS abnormality_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_4m1e VARCHAR(20) NOT NULL,
                problem_name VARCHAR(255) NOT NULL,
                keywords TEXT DEFAULT '',
                sort_order INT DEFAULT 0,
                active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Abnormality categories table initialized');

        // Seed default 4M1E categories if empty
        const [acCount] = await poolConn.query('SELECT COUNT(*) as count FROM abnormality_categories');
        if (acCount[0].count === 0) {
            const defaultCategories = [
                ['Man', 'Kurang Konsentrasi', 'kurang konsentrasi,kurang fokus,ngantuk'],
                ['Man', 'Skill Kurang', 'skill kurang,kurang terampil,belum terbiasa'],
                ['Man', 'Kecerobohan', 'ceroboh,kurang hati hati,sembrono'],
                ['Man', 'Prosedur Salah', 'prosedur salah,tidak sesuai sop,cara salah'],
                ['Mesin', 'Setting Parameter', 'setting parameter,parameter salah,pengaturan'],
                ['Mesin', 'Elektroda Aus', 'elektroda aus,elektroda habis,tip habis'],
                ['Mesin', 'Kotor / Slag', 'kotor,slag,percikan las,sparter las'],
                ['Mesin', 'Pressure Turun', 'pressure turun,tekanan angin kurang,angin kurang'],
                ['Mesin', 'Wire Feed Bermasalah', 'wire feed,feeding error,kawat las,wire bermasalah'],
                ['Mesin', 'Cooling Error', 'cooling error,water cooler,air pendingin'],
                ['Mesin', 'Jig / Fixture Longgar', 'jig longgar,fixture longgar,dudukan longgar,cekam longgar'],
                ['Mesin', 'Sensor Error', 'sensor error,sensor mati,sensor rusak'],
                ['Material', 'Material Deformasi', 'deformasi,berubah bentuk,melengkung,bengkok'],
                ['Material', 'Karatan / Rust', 'karat,rust,berkarat'],
                ['Material', 'Dimensi NG', 'dimensi ng,ukuran salah,ukuran ng,oversize,undersize'],
                ['Material', 'Cacat Material Tiba', 'cacat material,cacat datang,material defect'],
                ['Material', 'Salah Part', 'salah part,part salah,part tidak sesuai'],
                ['Metode', 'Urutan Welding Salah', 'urutan salah,urutan welding,sequence salah'],
                ['Metode', 'Waktu Kurang / Berlebih', 'waktu kurang,waktu berlebih,cycle time'],
                ['Metode', 'Setting Jig Tidak Tepat', 'setting jig,jig tidak tepat,posisi jig'],
                ['Metode', 'Metode Cleaning Salah', 'cleaning salah,cara bersihkan,salah bersih'],
                ['Environment', 'Pencahayaan Kurang', 'cahaya kurang,pencahayaan,kurang terang,gelap'],
                ['Environment', 'Sirkulasi Udara', 'sirkulasi,udara panas,ventilasi,asap las,asap welding'],
                ['Environment', 'Area Kotor', 'area kotor,tempat kotor,lingkungan kotor'],
                ['Environment', 'Kebisingan', 'bising,kebisingan,berisik,suara bising'],
            ];
            for (const c of defaultCategories) {
                await poolConn.query('INSERT INTO abnormality_categories (category_4m1e, problem_name, keywords) VALUES (?, ?, ?)', c);
            }
            console.log('✅ Abnormality categories seeded with ' + defaultCategories.length + ' items');
        }

        // Create Abnormality Records table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS abnormality_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE NOT NULL,
                time TIME DEFAULT NULL,
                inspector VARCHAR(100) DEFAULT '',
                part_number VARCHAR(100) DEFAULT '',
                model VARCHAR(100) DEFAULT '',
                shift VARCHAR(20) DEFAULT '',
                line_pos VARCHAR(50) DEFAULT '',
                side VARCHAR(10) DEFAULT '',
                category_4m1e VARCHAR(20) NOT NULL,
                problem_category VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Abnormality records table initialized');

        // Create Part Check Times table (per-item efficiency)
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS part_check_times (
                id INT AUTO_INCREMENT PRIMARY KEY,
                check_sheet_id INT DEFAULT NULL,
                part_number VARCHAR(100) NOT NULL,
                model VARCHAR(100) DEFAULT '',
                line_pos VARCHAR(50) DEFAULT '',
                side VARCHAR(10) DEFAULT '',
                date DATE NOT NULL,
                shift VARCHAR(20) DEFAULT '',
                inspector VARCHAR(100) DEFAULT '',
                check_start DATETIME NOT NULL,
                check_end DATETIME NOT NULL,
                duration_sec DECIMAL(10,2) NOT NULL DEFAULT 0,
                takt_time_sec INT NOT NULL DEFAULT 60,
                efficiency DECIMAL(5,2) NOT NULL DEFAULT 0,
                judgment ENUM('OK','NG') NOT NULL,
                total_ng_point INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pct_date (date),
                INDEX idx_pct_part (part_number, date),
                INDEX idx_pct_start (check_start)
            )
        `);
        console.log('✅ Part check times table initialized');

        // Create Line Stops table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS line_stops (
                id INT AUTO_INCREMENT PRIMARY KEY,
                part_number VARCHAR(100) DEFAULT '',
                model VARCHAR(100) DEFAULT '',
                line_pos VARCHAR(50) DEFAULT '',
                date DATE NOT NULL,
                shift VARCHAR(20) DEFAULT '',
                loss_start DATETIME NOT NULL,
                loss_end DATETIME NOT NULL,
                duration_min DECIMAL(10,2) NOT NULL DEFAULT 0,
                category_4m VARCHAR(50) DEFAULT '',
                stop_reason TEXT,
                corrective_action TEXT,
                notes TEXT,
                linked_abnormality_id INT DEFAULT NULL,
                created_by VARCHAR(100) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ls_date (date),
                INDEX idx_ls_line (line_pos, date),
                INDEX idx_ls_range (loss_start, loss_end)
            )
        `);
        console.log('✅ Line stops table initialized');

        // ppic_plans Table
        await poolConn.query(`
            CREATE TABLE IF NOT EXISTS ppic_plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tanggal DATE NOT NULL,
                shift VARCHAR(10) NOT NULL DEFAULT '',
                part_number VARCHAR(100) NOT NULL,
                part_name VARCHAR(255) DEFAULT '',
                model VARCHAR(100) DEFAULT '',
                line VARCHAR(100) DEFAULT '',
                qty_planning INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // Migrate unique key: include model to differentiate parts with same number but different models
        try {
            await poolConn.query('ALTER TABLE ppic_plans DROP INDEX uk_ppic');
        } catch (e) {}
        try {
            await poolConn.query('ALTER TABLE ppic_plans DROP INDEX uk_ppic_date_part');
        } catch (e) {}
        try {
            // Remove duplicate (tanggal, part_number, model) rows before adding new unique key
            await poolConn.query(`
                DELETE p1 FROM ppic_plans p1
                INNER JOIN ppic_plans p2
                WHERE p1.id > p2.id AND p1.tanggal = p2.tanggal AND p1.part_number = p2.part_number AND p1.model = p2.model
            `);
        } catch (e) {}
        try {
            await poolConn.query('ALTER TABLE ppic_plans ADD UNIQUE INDEX uk_ppic_date_part_model (tanggal, part_number, model)');
        } catch (e) {}
        console.log('✅ ppic_plans table initialized');

        // ============================================================
        // Users table
        // ============================================================
        try {
            await poolConn.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(255) DEFAULT NULL,
                    full_name VARCHAR(100) NOT NULL,
                    role VARCHAR(30) NOT NULL DEFAULT 'operator_admin',
                    permissions JSON DEFAULT NULL,
                    is_active TINYINT(1) DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            // Seed default admin user if table is empty
            const [rows] = await poolConn.query('SELECT COUNT(*) AS cnt FROM users');
            if (rows[0].cnt === 0) {
                const bcrypt = require('bcryptjs');
                const hash = await bcrypt.hash('admin', 10);
                const adminPerms = JSON.stringify([
                    'scan','voice','database','dashboard','live-monitoring',
                    'asakai','linestop','master','ppic','settings','users'
                ]);
                await poolConn.query(
                    'INSERT INTO users (username, password, full_name, role, permissions) VALUES (?, ?, ?, ?, ?)',
                    ['admin', hash, 'Administrator', 'admin', adminPerms]
                );
                console.log('✅ Default admin user created (username: admin, password: admin)');
            }
            // Add password column if missing (migration from no-password to optional-password)
            try {
                await poolConn.query(`ALTER TABLE users ADD COLUMN password VARCHAR(255) DEFAULT NULL AFTER username`);
            } catch (e) {}
        } catch (e) {
            console.warn('⚠️ users table init warning:', e.message);
        }
        console.log('✅ users table initialized');

        console.log('✅ Database tables initialized & migrated successfully');
        return pool;
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        throw err;
    }
}

function getPool() {
    if (!pool) {
        throw new Error("Pool database belum diinisialisasi. Panggil initDB() terlebih dahulu.");
    }
    return pool;
}

module.exports = {
    initDB,
    getPool
};
