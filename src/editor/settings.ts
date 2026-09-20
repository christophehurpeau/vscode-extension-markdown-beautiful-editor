import * as vscode from 'vscode';
import { parseEditorFontFamily, type EditorFontFamily } from '../shared/fontFamily';

export const fontFamilySettingSection = 'markdown.beautifulEditor.fontFamily';

export function getConfiguredFontFamily(resource: vscode.Uri): EditorFontFamily {
    return parseEditorFontFamily(vscode.workspace.getConfiguration(undefined, resource).get(fontFamilySettingSection));
}
