import * as assert from 'assert';
import { parseAlertHeader, alertLineClasses } from '../../shared/alerts';

describe('parseAlertHeader', () => {
    it('parses each alert type, uppercased', () => {
        assert.strictEqual(parseAlertHeader('> [!NOTE]'), 'NOTE');
        assert.strictEqual(parseAlertHeader('> [!TIP]'), 'TIP');
        assert.strictEqual(parseAlertHeader('> [!IMPORTANT]'), 'IMPORTANT');
        assert.strictEqual(parseAlertHeader('> [!WARNING]'), 'WARNING');
        assert.strictEqual(parseAlertHeader('> [!CAUTION]'), 'CAUTION');
    });

    it('is case-insensitive but always returns uppercase', () => {
        assert.strictEqual(parseAlertHeader('> [!note]'), 'NOTE');
        assert.strictEqual(parseAlertHeader('> [!Note]'), 'NOTE');
    });

    it('accepts a missing space after >', () => {
        assert.strictEqual(parseAlertHeader('>[!NOTE]'), 'NOTE');
    });

    it('accepts trailing whitespace', () => {
        assert.strictEqual(parseAlertHeader('> [!NOTE]   '), 'NOTE');
    });

    it('returns null for a regular blockquote', () => {
        assert.strictEqual(parseAlertHeader('> just a quote'), null);
    });

    it('returns null for an alert header with trailing content on the same line', () => {
        assert.strictEqual(parseAlertHeader('> [!NOTE] extra text'), null);
    });

    it('returns null for an unrecognized bracket tag', () => {
        assert.strictEqual(parseAlertHeader('> [!BOGUS]'), null);
    });

    it('returns null for a plain line', () => {
        assert.strictEqual(parseAlertHeader('plain text'), null);
    });
});

describe('alertLineClasses', () => {
    it('marks a single-line alert (no content) as first, last and single', () => {
        const classes = alertLineClasses({ index: 0, total: 1, type: 'NOTE' });
        assert.strictEqual(classes, 'md-alert md-alert-note alert-first alert-last alert-single');
    });

    it('marks the header of a multi-line alert as first only', () => {
        const classes = alertLineClasses({ index: 0, total: 3, type: 'WARNING' });
        assert.strictEqual(classes, 'md-alert md-alert-warning alert-first');
    });

    it('marks a middle content line with no boundary classes', () => {
        const classes = alertLineClasses({ index: 1, total: 3, type: 'WARNING' });
        assert.strictEqual(classes, 'md-alert-content md-alert-warning');
    });

    it('marks the last content line as alert-last', () => {
        const classes = alertLineClasses({ index: 2, total: 3, type: 'WARNING' });
        assert.strictEqual(classes, 'md-alert-content md-alert-warning alert-last');
    });

    it('lowercases the type for the md-alert-<type> class', () => {
        assert.ok(alertLineClasses({ index: 0, total: 1, type: 'IMPORTANT' }).includes('md-alert-important'));
    });
});
