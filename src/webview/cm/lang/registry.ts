/**
 * `MarkdownExtension` registration point for this project's custom grammar
 * extensions (math, footnotes, definition lists — the three-construct parity
 * gap recorded in docs/plans/CODEMIRROR6_MIGRATION.md; link-reference
 * definitions and GitHub alerts need no grammar extension, see that doc's
 * "corrections" section).
 *
 * Authored once by WP-1, then FROZEN, same as `../extensions.ts`: WP-G1/G2/G3
 * fill in their own file under `./lang/` and must not need to touch this one.
 *
 * CONVENTION (b) for later work packages: a `MarkdownExtension` registers by
 * exporting it from its own module (see `./math.ts` for the shape — a
 * `MarkdownConfig`, or a `readonly MarkdownExtension[]` if a construct needs
 * more than one) and adding exactly one entry to `markdownExtensions` below.
 * It is combined with `GFM` in `../extensions.ts` —
 * `markdown({ extensions: [GFM, ...markdownExtensions] })` — never here, so
 * this file stays a flat list with no cross-package ordering logic.
 */
import type { MarkdownExtension } from '@lezer/markdown';
import { mathExtension } from './math';
import { footnotesExtension } from './footnotes';
import { definitionListExtension } from './definitionList';

export const markdownExtensions: MarkdownExtension[] = [
    mathExtension,
    footnotesExtension,
    definitionListExtension,
];
