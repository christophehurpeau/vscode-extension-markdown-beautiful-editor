/**
 * Regenerates `images/*.png` from the fixtures in `screenshots/fixtures/`.
 * Run with `pnpm screenshots`; see `screenshots/README.md` for what this does
 * and does not reproduce.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { webviewBodyClass, webviewBodyHtml } from '../src/shared/webviewBody.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const distDir = join(repoRoot, 'dist');
const fixturesDir = join(scriptDir, 'fixtures');
const imagesDir = join(repoRoot, 'images');

/** Rendered at 2x, so the on-disk PNG is twice these numbers. */
const deviceScaleFactor = 2;

interface Shot {
    /** Output file, written to `images/<output>`. */
    output: string;
    /** Markdown file under `screenshots/fixtures/`. */
    fixture: string;
    /** The TOC sidebar is chrome; only the overview shot is about it. */
    toc: 'visible' | 'hidden';
    width: number;
    height: number;
}

const shots: Shot[] = [
    { output: 'screenshot.png', fixture: 'overview.md', toc: 'visible', width: 900, height: 740 },
    { output: 'formatting.png', fixture: 'formatting.md', toc: 'hidden', width: 620, height: 520 },
    { output: 'alerts.png', fixture: 'alerts.md', toc: 'hidden', width: 620, height: 570 },
    { output: 'code.png', fixture: 'code.md', toc: 'hidden', width: 620, height: 530 },
];

/**
 * Stands in for the extension host: answers the webview's `ready` with the
 * `init` message `customEditorProvider.ts` would send, and backs `getState`
 * with the stored state the shot asks for.
 */
function hostStubScript(): string {
    return `
    const config = window.__screenshotConfig;
    let state = config.storedState;
    window.acquireVsCodeApi = () => ({
        postMessage: (message) => {
            if (message && message.type === 'ready') {
                window.dispatchEvent(new MessageEvent('message', { data: config.initMessage }));
            }
        },
        getState: () => state,
        setState: (next) => { state = next; },
    });`;
}

/**
 * A blinking caret and a hover state would make two runs of the same fixture
 * differ, which is the one thing a regenerated screenshot must not do.
 */
const captureStabilityCss = `
    .cm-cursor, .cm-cursor-primary, .cm-dropCursor { display: none !important; }
    *, *::before, *::after { animation: none !important; transition: none !important; }
    ::-webkit-scrollbar { display: none; }
`;

interface HarnessParams {
    themeCss: string;
    markdown: string;
    tocPreference: 'visible' | 'hidden';
}

function harnessHtml({ themeCss, markdown, tocPreference }: HarnessParams): string {
    const initMessage = {
        type: 'init',
        content: markdown,
        originalContent: markdown,
        diffMode: false,
        diffAvailable: false,
        fontFamily: 'normal',
        readOnly: false,
        headContent: null,
    };
    const config = {
        initMessage,
        storedState: { cursorPosition: null, scrollTop: 0, tocPreference },
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>${themeCss}</style>
    <link href="editor.css" rel="stylesheet">
    <style>${captureStabilityCss}</style>
    <title>Markdown Editor</title>
</head>
<body class="${webviewBodyClass('editor')} vscode-dark">
${webviewBodyHtml('editor')}
    <script>window.__screenshotConfig = ${JSON.stringify(config)};${hostStubScript()}</script>
    <script src="webview.js"></script>
</body>
</html>`;
}

/** Fails the run rather than writing a blank or half-mounted editor to `images/`. */
async function assertEditorMounted(page: Page, shot: Shot): Promise<void> {
    const lineCount = await page.locator('.cm-line').count();
    if (lineCount === 0) {
        throw new Error(`${shot.output}: the editor mounted no content from ${shot.fixture}`);
    }
    const tocVisible = await page.locator('#toc').isVisible();
    if (tocVisible !== (shot.toc === 'visible')) {
        throw new Error(`${shot.output}: expected the TOC to be ${shot.toc}, it was not`);
    }
}

async function capture(): Promise<void> {
    const themeCss = await readFile(join(scriptDir, 'vscode-dark-modern.css'), 'utf8');
    const harnessPath = join(distDir, 'screenshot-harness.html');
    await mkdir(imagesDir, { recursive: true });

    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ deviceScaleFactor, colorScheme: 'dark' });
        const page = await context.newPage();
        page.on('console', (message) => {
            if (message.type() === 'error') {
                console.error(`  [webview] ${message.text()}`);
            }
        });
        page.on('pageerror', (error) => console.error(`  [webview] ${error.message}`));

        for (const shot of shots) {
            const markdown = await readFile(join(fixturesDir, shot.fixture), 'utf8');
            await writeFile(
                harnessPath,
                harnessHtml({ themeCss, markdown, tocPreference: shot.toc })
            );
            await page.setViewportSize({ width: shot.width, height: shot.height });
            await page.goto(pathToFileURL(harnessPath).href, { waitUntil: 'load' });
            await page.waitForSelector('.cm-content');
            await page.evaluate(() => document.fonts.ready);
            await assertEditorMounted(page, shot);

            const output = join(imagesDir, shot.output);
            await page.screenshot({ path: output });
            console.log(`  ${shot.output}  ${shot.width * deviceScaleFactor}x${shot.height * deviceScaleFactor}  <- ${shot.fixture}`);
        }
    } finally {
        await browser.close();
        await rm(harnessPath, { force: true });
    }
}

await capture();
