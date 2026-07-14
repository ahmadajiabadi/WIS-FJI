const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
    const start = Date.now();

    // Collect all JS files in correct dependency order
    const order = [
        'frontend/js/components.js',
        'frontend/js/utils.js',
        'frontend/js/PerspectiveCropper.js',
        'frontend/js/tabs/ScanQueueView.js',
        'frontend/js/tabs/ScanTab.js',
        'frontend/js/tabs/ManualInputModal.js',
        'frontend/js/tabs/DatabaseTab.js',
        'frontend/js/tabs/MasterDataTab.js',
        'frontend/js/VoiceFeedback.js',
        'frontend/js/VoiceEngine.native.js',
        'frontend/js/VoiceEngine.js',
        'frontend/js/VoiceSetup.js',
        'frontend/js/tabs/voice/useEfficiencyTimer.js',
        'frontend/js/tabs/VoiceTab.js',
        'frontend/js/tabs/LivePartAnalyticsModal.js',
        'frontend/js/tabs/PpicTab.js',
        'frontend/js/tabs/LiveMonitoringTab.js',
        'frontend/js/tabs/AsakaiTab.js',
        'frontend/js/tabs/DashboardTab.js',
        'frontend/js/tabs/SettingsTab.js',
        'frontend/js/tabs/LineStopTab.js',
        'frontend/js/auth.js',
        'frontend/js/tabs/UsersTab.js',
        'frontend/js/app.js',
    ];

    const rootDir = path.join(__dirname, '..');

    // Concatenate all files, merge React hook destructuring into one declaration
    let code = '';
    const reactRe = /^\s*const\s*\{([^}]+)\}\s*=\s*React\s*;?\s*$/m;
    let allHooks = new Set();
    const filesContent = [];
    for (const relPath of order) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
            let content = fs.readFileSync(fullPath, 'utf8');
            // Collect hooks from this file and remove the line
            const match = content.match(reactRe);
            if (match) {
                match[1].split(',').forEach(h => {
                    const trimmed = h.trim();
                    if (trimmed) allHooks.add(trimmed);
                });
                content = content.replace(reactRe, '');
            }
            filesContent.push(content);
        } else {
            console.warn(`⚠️  File not found: ${relPath}`);
        }
    }
    // Add ONE combined React destructuring at the top
    if (allHooks.size > 0) {
        code = 'const { ' + Array.from(allHooks).join(', ') + ' } = React;\n';
    }
    code += filesContent.join('\n');

    // Compile JSX to JS with esbuild
    try {
        const result = await esbuild.transform(code, {
            loader: 'jsx',
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
            minify: true,
            sourcemap: false,
        });

        const distDir = path.join(rootDir, 'frontend', 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        fs.writeFileSync(path.join(distDir, 'bundle.js'), result.code);
        const ms = Date.now() - start;
        const kb = Math.round(result.code.length / 1024);
        console.log(`✅ Build complete: ${kb}KB in ${ms}ms`);
    } catch (err) {
        console.error('❌ Build failed:', err.message);
        process.exit(1);
    }
}

build();
