/**
 * Regenerates `images/*.png` from the fixtures in `screenshots/fixtures/`.
 * Run with `pnpm screenshots`; see `screenshots/README.md` for what this does
 * and does not reproduce.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';
import { webviewBodyClass, webviewBodyHtml, type WebviewMode } from '../src/shared/webviewBody.ts';
import type { HostToWebviewMessage } from '../src/shared/messages.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const distDir = join(repoRoot, 'dist');
const fixturesDir = join(scriptDir, 'fixtures');
const imagesDir = join(repoRoot, 'images');

/** Rendered at 2x, so the on-disk PNG is twice these numbers. */
const deviceScaleFactor = 2;

interface ShotBase {
    /** Output file, written to `images/<output>`. */
    output: string;
    /** Markdown file under `screenshots/fixtures/`. */
    fixture: string;
    width: number;
    height: number;
}

/** A shot of the custom editor, optionally after an interaction. */
interface EditorShot extends ShotBase {
    surface: 'editor';
    /** The TOC sidebar is chrome; only the overview shot is about it. */
    toc: 'visible' | 'hidden';
    /**
     * The caret is hidden by default — it blinks, so two runs of the same
     * fixture would differ. A shot whose subject IS the cursors turns it back
     * on; `captureStabilityCss` stops the blink for those.
     */
    caret?: 'visible';
    /** Interaction to perform before the capture: select text, open the find
     *  panel, drag out extra cursors. */
    stage?: (page: Page) => Promise<void>;
}

/** The editor with diff mode open over `head` — what the ⇄ toolbar button
 *  does, driven from the host side (see `openDiffMode`). */
interface EditorDiffShot extends ShotBase {
    surface: 'editorDiff';
    /** Fixture standing in for git HEAD: the original (left) pane. */
    head: string;
}

/**
 * The standalone diff panel (`src/editor/diffPanel.ts`) — a different webview
 * body and a different init message from the editor, not a mode of it.
 */
interface DiffPanelShot extends ShotBase {
    surface: 'diffPanel';
    /** Fixture for the original (left) side; `fixture` is the modified one. */
    head: string;
    scopeLabel: string;
    originalLabel: string;
    modifiedLabel: string;
}

type Shot = EditorShot | EditorDiffShot | DiffPanelShot;

function lineContaining(page: Page, text: string): Locator {
    return page.locator('.cm-line').filter({ hasText: text }).first();
}

/** Puts the cursor on the line and selects it end to end — which is what pops
 *  the floating formatting toolbar above it. */
async function selectBoldLine(page: Page): Promise<void> {
    await lineContaining(page, 'Bold, italic, code').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.waitForSelector('#formatting-toolbar', { state: 'visible' });
}

/** Opens the find panel the way ⌘F does and fills both of its fields, so the
 *  shot shows the replace row rather than find alone. */
async function openFindAndReplace(page: Page): Promise<void> {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+f');
    await page.waitForSelector('.cm-panel.cm-search');
    await page.fill('.cm-panel.cm-search input[name="search"]', 'document');
    await page.fill('.cm-panel.cm-search input[name="replace"]', 'file');
    await page.waitForSelector('.cm-searchMatch');
}

/**
 * Alt-drags a rectangle down the `src/webview/` prefix of the fixture's file
 * list, leaving one selection range — and one cursor — per line.
 *
 * The plain click first is not incidental: Alt-mousedown *adds* a range
 * (`clickAddsSelectionRange`, `cm/multipleSelections.ts`), so whatever cursor
 * the view already had survives the drag. Parking it on the rectangle's own
 * top-left corner keeps it from showing up as a stray caret elsewhere.
 */
async function dragRectangularSelection(page: Page): Promise<void> {
    const first = await lineContaining(page, 'src/webview/main.ts').boundingBox();
    const last = await lineContaining(page, 'src/webview/cm/decorations.ts').boundingBox();
    if (!first || !last) {
        throw new Error('rectangular selection: the file-list lines are not laid out');
    }
    const left = first.x + 14;

    await page.mouse.click(left, first.y + first.height / 2);
    await page.mouse.move(left, first.y + first.height / 2);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(first.x + 108, last.y + last.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.waitForFunction(() => document.querySelectorAll('.cm-cursor').length > 1);
}

const shots: Shot[] = [
    { surface: 'editor', output: 'screenshot.png', fixture: 'overview.md', toc: 'visible', width: 900, height: 740 },
    { surface: 'editor', output: 'formatting.png', fixture: 'formatting.md', toc: 'hidden', width: 620, height: 520 },
    { surface: 'editor', output: 'alerts.png', fixture: 'alerts.md', toc: 'hidden', width: 620, height: 570 },
    { surface: 'editor', output: 'code.png', fixture: 'code.md', toc: 'hidden', width: 620, height: 530 },
    { surface: 'editor', output: 'structure.png', fixture: 'structure.md', toc: 'hidden', width: 620, height: 580 },
    {
        surface: 'editor',
        output: 'frontmatter.png',
        fixture: 'frontmatter.md',
        toc: 'hidden',
        width: 620,
        height: 400,
    },
    {
        surface: 'editor',
        output: 'formatting-toolbar.png',
        fixture: 'selection.md',
        toc: 'hidden',
        width: 620,
        height: 270,
        stage: selectBoldLine,
    },
    {
        surface: 'editor',
        output: 'find.png',
        fixture: 'find.md',
        toc: 'hidden',
        width: 620,
        height: 420,
        stage: openFindAndReplace,
    },
    {
        surface: 'editor',
        output: 'multiple-cursors.png',
        fixture: 'cursors.md',
        toc: 'hidden',
        width: 620,
        height: 330,
        caret: 'visible',
        stage: dragRectangularSelection,
    },
    {
        surface: 'editorDiff',
        output: 'diff-mode.png',
        fixture: 'changelog.md',
        head: 'changelog-head.md',
        width: 900,
        height: 480,
    },
    {
        surface: 'diffPanel',
        output: 'diff-panel.png',
        fixture: 'changelog.md',
        head: 'changelog-head.md',
        scopeLabel: 'Unstaged',
        originalLabel: 'Index',
        modifiedLabel: 'Working Tree',
        width: 900,
        height: 480,
    },
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
 * differ, which is the one thing a regenerated screenshot must not do. The
 * caret rule is dropped for a shot about cursors — with animations off it can
 * no longer blink, so it renders identically every run.
 */
function captureStabilityCss(caret: 'hidden' | 'visible'): string {
    const caretRule = caret === 'visible'
        ? ''
        : '.cm-cursor, .cm-cursor-primary, .cm-dropCursor { display: none !important; }';
    return `
    ${caretRule}
    *, *::before, *::after { animation: none !important; transition: none !important; }
    ::-webkit-scrollbar { display: none; }
`;
}

interface HarnessParams {
    themeCss: string;
    mode: WebviewMode;
    caret: 'hidden' | 'visible';
    initMessage: HostToWebviewMessage;
    tocPreference: 'visible' | 'hidden';
}

function harnessHtml({ themeCss, mode, caret, initMessage, tocPreference }: HarnessParams): string {
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
    <style>${captureStabilityCss(caret)}</style>
    <title>Markdown Editor</title>
</head>
<body class="${webviewBodyClass(mode)} vscode-dark">
${webviewBodyHtml(mode)}
    <script>window.__screenshotConfig = ${JSON.stringify(config)};${hostStubScript()}</script>
    <script src="webview.js"></script>
</body>
</html>`;
}

async function readFixture(name: string): Promise<string> {
    return readFile(join(fixturesDir, name), 'utf8');
}

async function initMessageFor(shot: Shot): Promise<HostToWebviewMessage> {
    const markdown = await readFixture(shot.fixture);
    const head = shot.surface === 'editor' ? null : await readFixture(shot.head);

    if (shot.surface === 'diffPanel') {
        return {
            type: 'initDiff',
            original: head ?? '',
            modified: markdown,
            originalLabel: shot.originalLabel,
            modifiedLabel: shot.modifiedLabel,
            scopeLabel: shot.scopeLabel,
            editable: true,
            fontFamily: 'normal',
            restoreState: {
                fileUri: 'file:///workspace/CHANGELOG.md',
                sides: { original: { kind: 'index' }, modified: { kind: 'workingTree' } },
            },
        };
    }

    return {
        type: 'init',
        content: markdown,
        originalContent: markdown,
        diffMode: false,
        diffAvailable: head !== null,
        fontFamily: 'normal',
        readOnly: false,
        headContent: head,
    };
}

/**
 * Opens diff mode from the outside, the way the host does: the ⇄ button only
 * posts `requestDiffToggle`, and it is the host's `toggleDiff` reply — carrying
 * the HEAD text — that actually opens the merge view.
 */
async function openDiffMode(page: Page, head: string): Promise<void> {
    await page.evaluate((originalVersionContent) => {
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'toggleDiff', originalVersionContent },
        }));
    }, head);
    await page.waitForSelector('.cm-mergeView');
}

/** Fails the run rather than writing a blank or half-mounted editor to `images/`. */
async function assertEditorMounted(page: Page, shot: EditorShot): Promise<void> {
    const lineCount = await page.locator('.cm-line').count();
    if (lineCount === 0) {
        throw new Error(`${shot.output}: the editor mounted no content from ${shot.fixture}`);
    }
    const tocVisible = await page.locator('#toc').isVisible();
    if (tocVisible !== (shot.toc === 'visible')) {
        throw new Error(`${shot.output}: expected the TOC to be ${shot.toc}, it was not`);
    }
}

/** A diff of two identical documents renders as a plain two-pane editor and
 *  would silently pass every other check here. */
async function assertDiffRendered(page: Page, shot: Shot): Promise<void> {
    await page.waitForSelector('.cm-merge-b');
    const changedLines = await page.locator('.cm-changedLine, .cm-insertedLine, .cm-deletedLine').count();
    if (changedLines === 0) {
        throw new Error(`${shot.output}: the two sides of the diff render no difference`);
    }
}

async function prepareShot(page: Page, shot: Shot): Promise<void> {
    switch (shot.surface) {
        case 'diffPanel':
            await assertDiffRendered(page, shot);
            return;
        case 'editorDiff':
            await openDiffMode(page, await readFixture(shot.head));
            await assertDiffRendered(page, shot);
            return;
        case 'editor':
            await assertEditorMounted(page, shot);
            await shot.stage?.(page);
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
            await writeFile(
                harnessPath,
                harnessHtml({
                    themeCss,
                    // The diff panel is the only surface with its own body;
                    // diff mode is an overlay inside the editor's.
                    mode: shot.surface === 'diffPanel' ? 'diff' : 'editor',
                    caret: shot.surface === 'editor' && shot.caret === 'visible' ? 'visible' : 'hidden',
                    initMessage: await initMessageFor(shot),
                    tocPreference: shot.surface === 'editor' ? shot.toc : 'hidden',
                })
            );
            await page.setViewportSize({ width: shot.width, height: shot.height });
            await page.goto(pathToFileURL(harnessPath).href, { waitUntil: 'load' });
            await page.waitForSelector('.cm-content');
            await page.evaluate(() => document.fonts.ready);
            await prepareShot(page, shot);

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
