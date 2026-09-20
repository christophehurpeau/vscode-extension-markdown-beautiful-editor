import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { NODE_CLASS_MAP } from '../../shared/nodeClassMap';

/**
 * Guards a CM6 layout rule that is invisible to every other test: a
 * `.cm-line` decoration class must never use `margin`.
 *
 * Margin sits outside the border box. CM6 sizes each `.cm-gutterElement` from
 * its line's block height and maps click coordinates to line blocks, so a
 * margin on a line class both pushes the line's text down while the gutter
 * number stays put (numbers read high, worst on headings) and leaves vertical
 * gaps belonging to no line, where a click resolves to a neighbouring line.
 * Padding is inside the border box and CM6 measures it.
 *
 * This shipped twice before being caught by hand, and no assertion over
 * decoration ranges or document positions can see it — the suite was fully
 * green while the editor was visibly misaligned.
 */

const stylesDir = path.resolve(__dirname, '../../../src/styles');

/** Classes `decorations.ts` attaches with `Decoration.line()`, read from the
 *  table that drives them rather than copied. A hand-written copy drifted
 *  once already: it listed `md-hr-line`, a name from a superseded TODO that
 *  was never emitted, so both assertions below silently skipped every
 *  `.md-hr` rule while that class shipped unscoped *and* with a margin. */
const mappedLineClasses = Object.values(NODE_CLASS_MAP)
    .filter((entry) => entry.layer === 'line')
    .flatMap((entry) => entry.class.split(' '));

/** The rest: boundary and depth classes `decorations.ts` synthesizes rather
 *  than reads from `NODE_CLASS_MAP` (see its `addLineClassAt` calls). */
const synthesizedLineClasses = [
    'md-quote-1', 'md-quote-2', 'md-quote-3',
    'blockquote-first', 'blockquote-last',
    'md-code-block-first', 'md-code-block-last',
    'md-setext-title', 'md-setext-underline',
    'md-alert', 'md-alert-content',
    'md-alert-note', 'md-alert-tip', 'md-alert-important', 'md-alert-warning', 'md-alert-caution',
    'alert-first', 'alert-last', 'alert-single',
];

const lineDecorationClasses = [...mappedLineClasses, ...synthesizedLineClasses];

interface CssRule {
    file: string;
    selector: string;
    body: string;
}

function readRules(): CssRule[] {
    const rules: CssRule[] = [];
    for (const file of fs.readdirSync(stylesDir).filter((f) => f.endsWith('.css'))) {
        const css = fs.readFileSync(path.join(stylesDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            rules.push({ file, selector: match[1].trim(), body: match[2] });
        }
    }
    return rules;
}

/** True when the selector's last compound targets a line-decoration class,
 *  i.e. the rule styles the line box itself rather than a mark inside it. */
function classesOf(compound: string): string[] {
    return [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
}

function targetsLineBox(selector: string): boolean {
    const lastCompound = selector.split(',')[0].trim().split(/\s+|>/).filter(Boolean).pop() ?? '';
    if (lastCompound.includes('::') || lastCompound.includes('gutterElement')) {
        return false;
    }
    // Exact class comparison, not substring: `.md-alert-type` is a mark
    // inside an alert line, not the line box itself.
    return classesOf(lastCompound).some((cls) => lineDecorationClasses.includes(cls));
}

describe('line-decoration CSS', () => {
    it('finds the stylesheets (guard against a silently empty scan)', () => {
        const rules = readRules();
        assert.ok(rules.length > 50, `only found ${rules.length} rules in ${stylesDir}`);
        assert.ok(rules.some((r) => targetsLineBox(r.selector)), 'no line-box rules matched');
    });

    it('scopes every line-decoration rule to .cm-line', () => {
        // The gutter mirrors these same class names onto its
        // `.cm-gutterElement`s so the two share font metrics, so an unscoped
        // `.md-*` rule also paints the line NUMBER — which made heading
        // numbers bold and coloured and drew the code block's background and
        // padding around them. Only cm-shell.css may style the gutter.
        const offenders = readRules()
            .filter((rule) => rule.file !== 'cm-shell.css')
            .filter((rule) => targetsLineBox(rule.selector))
            .filter((rule) => !rule.selector.split(',').every((part) => part.includes('.cm-line')))
            .map((rule) => `${rule.file}: ${rule.selector}`);

        assert.deepStrictEqual(offenders, [], `scope these to .cm-line:\n  ${offenders.join('\n  ')}`);
    });

    it('never uses margin on a .cm-line decoration class', () => {
        const offenders = readRules()
            .filter((rule) => targetsLineBox(rule.selector))
            .filter((rule) => /(^|[;\s])margin(-top|-bottom|-left|-right)?\s*:/.test(rule.body))
            .map((rule) => `${rule.file}: ${rule.selector}`);

        assert.deepStrictEqual(
            offenders,
            [],
            `use padding instead — CM6 cannot measure margin on a line block:\n  ${offenders.join('\n  ')}`,
        );
    });
});
