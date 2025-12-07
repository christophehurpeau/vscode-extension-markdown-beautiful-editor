const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

/**
 * Plugin to copy CSS files to dist
 * @type {import('esbuild').Plugin}
 */
const copyCssPlugin = {
    name: 'copy-css',
    setup(build) {
        build.onEnd(() => {
            const srcDir = path.join(__dirname, 'src', 'styles');
            const distDir = path.join(__dirname, 'dist');
            
            // Ensure dist directory exists
            if (!fs.existsSync(distDir)) {
                fs.mkdirSync(distDir, { recursive: true });
            }
            
            // Copy CSS files
            if (fs.existsSync(srcDir)) {
                const files = fs.readdirSync(srcDir);
                files.forEach(file => {
                    if (file.endsWith('.css')) {
                        const src = path.join(srcDir, file);
                        const dest = path.join(distDir, file);
                        fs.copyFileSync(src, dest);
                        console.log(`Copied ${file} to dist/`);
                    }
                });
            }
        });
    },
};

async function main() {
    // Build extension (Node.js, CommonJS)
    const extensionCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // Build webview (Browser, IIFE)
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/webview/main.ts'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'dist/webview.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin, copyCssPlugin],
    });

    if (watch) {
        await Promise.all([
            extensionCtx.watch(),
            webviewCtx.watch()
        ]);
    } else {
        await Promise.all([
            extensionCtx.rebuild(),
            webviewCtx.rebuild()
        ]);
        await extensionCtx.dispose();
        await webviewCtx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
