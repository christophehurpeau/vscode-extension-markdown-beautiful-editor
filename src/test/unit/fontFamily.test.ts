import * as assert from 'assert';
import {
    defaultEditorFontFamily,
    parseEditorFontFamily,
    resolveEditorFontFamily,
    toggledEditorFontFamily,
    type EditorFontFamily,
} from '../../shared/fontFamily';

describe('Editor font family', () => {

    describe('Default', () => {
        it('is the proportional font', () => {
            assert.strictEqual(defaultEditorFontFamily, 'normal');
        });
    });

    describe('Parsing the setting', () => {
        it('accepts the known values', () => {
            assert.strictEqual(parseEditorFontFamily('mono'), 'mono');
            assert.strictEqual(parseEditorFontFamily('normal'), 'normal');
        });

        it('falls back to the default for anything else', () => {
            assert.strictEqual(parseEditorFontFamily(undefined), 'normal');
            assert.strictEqual(parseEditorFontFamily(null), 'normal');
            assert.strictEqual(parseEditorFontFamily('monospace'), 'normal');
            assert.strictEqual(parseEditorFontFamily(42), 'normal');
        });
    });

    describe('Resolving', () => {
        it('uses the setting while no toggle happened', () => {
            assert.strictEqual(resolveEditorFontFamily({ setting: 'normal', override: null }), 'normal');
            assert.strictEqual(resolveEditorFontFamily({ setting: 'mono', override: null }), 'mono');
        });

        it('lets the temporary override win in both directions', () => {
            assert.strictEqual(resolveEditorFontFamily({ setting: 'normal', override: 'mono' }), 'mono');
            assert.strictEqual(resolveEditorFontFamily({ setting: 'mono', override: 'normal' }), 'normal');
        });
    });

    describe('Toggling', () => {
        it('flips the current font', () => {
            assert.strictEqual(toggledEditorFontFamily('normal'), 'mono');
            assert.strictEqual(toggledEditorFontFamily('mono'), 'normal');
        });

        it('flips against the resolved font, not the setting', () => {
            const setting: EditorFontFamily = 'normal';
            let override: EditorFontFamily | null = null;

            override = toggledEditorFontFamily(resolveEditorFontFamily({ setting, override }));
            assert.strictEqual(resolveEditorFontFamily({ setting, override }), 'mono');

            override = toggledEditorFontFamily(resolveEditorFontFamily({ setting, override }));
            assert.strictEqual(resolveEditorFontFamily({ setting, override }), 'normal');
        });
    });
});
