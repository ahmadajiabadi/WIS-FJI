require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const { initDB } = require('./config/db');
const { startQueueWorker } = require('./workers/queue');

const app = express();
const port = process.env.PORT || 3000;

// Configure uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// Serve frontend statically (no-cache to prevent stale JS)
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store');
    }
}));

// Bootstrapping function
async function bootstrap() {
    try {
        // 0. Pre-compile frontend bundle (removes Babel in-browser compilation)
        try {
            require('./build');
        } catch (err) {
            console.error('❌ Frontend build failed:', err.message);
            process.exit(1);
        }
        console.log('📦 Frontend bundle built');

        // 1. Initialize MySQL database and pool
        await initDB();
        console.log('🚀 Database initialized and pool created');

        // 2. Start background worker for AI processing queue
        startQueueWorker();

        // 3. Mount Modular Express Routers
        app.use('/api', require('./routes/records'));
        app.use('/api', require('./routes/drafts'));
        app.use('/api', require('./routes/master'));
        app.use('/api', require('./routes/dashboard'));
        app.use('/api', require('./routes/ai'));
        app.use('/api', require('./routes/settings'));
        app.use('/api', require('./routes/upload-monthly'));
        app.use('/api', require('./routes/abnormality'));
        app.use('/api', require('./routes/master-data'));
        app.use('/api', require('./routes/efficiency'));
        app.use('/api', require('./routes/linestops'));
        app.use('/api', require('./routes/ppic'));
        app.use('/api', require('./routes/auth'));
        app.use('/api', require('./routes/users'));

        // 4. Start listening on process port
        app.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${port}`);
        });

    } catch (err) {
        console.error('❌ Server bootstrap failed:', err.message);
        process.exit(1);
    }
}

bootstrap();
