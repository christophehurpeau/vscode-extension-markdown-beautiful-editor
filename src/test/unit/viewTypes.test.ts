import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { diffPanelViewType, markdownEditorViewType } from '../../shared/viewTypes';

/**
 * Guards a manifest coupling no other test can see: the diff panel's
 * serializer only ever runs if `activationEvents` asks for the extension when
 * VS Code restores that view type. Dropping the entry -- or renaming the view
 * type on one side only -- leaves a restored diff tab loading forever, and the
 * extension looks fine until the next window reload.
 */

interface Manifest {
    activationEvents?: string[];
    contributes?: { customEditors?: { viewType: string }[] };
}

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
) as Manifest;

describe('package.json activation events', () => {
    it('activates the extension to restore a diff panel', () => {
        assert.ok(
            manifest.activationEvents?.includes(`onWebviewPanel:${diffPanelViewType}`),
            `activationEvents must contain onWebviewPanel:${diffPanelViewType}`
        );
    });

    // The experimental `replaceTextEditors` setting acts on markdown text
    // editors, which open without this extension being asked for otherwise.
    it('activates the extension when a markdown text editor opens', () => {
        assert.ok(manifest.activationEvents?.includes('onLanguage:markdown'));
    });
});

describe('package.json custom editor', () => {
    it('registers the view type the code opens', () => {
        assert.deepStrictEqual(
            manifest.contributes?.customEditors?.map(editor => editor.viewType),
            [markdownEditorViewType]
        );
    });
});
