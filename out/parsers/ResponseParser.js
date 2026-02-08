"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseParser = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ResponseParser {
    constructor() {
        this.pendingChanges = [];
        this.tempDir = null;
    }
    /**
     * LLMの回答をパースして適用
     */
    async parseAndApply(response) {
        // parseメソッドをawait
        const parsedResult = await this.parse(response);
        // LLMのリクエストがある場合（ファイル変更を除く）、それらを優先して処理
        if (parsedResult.requestedFiles && parsedResult.requestedFiles.length > 0 || parsedResult.switchModeTo || parsedResult.continueRequested) {
            // ファイル変更があったとしても、それらは保留し、リクエストを処理させる
            // この場合、filesModifiedは0として返す（実ファイル変更は行われないため）
            return {
                ...parsedResult,
                filesModified: 0,
                success: true, // リクエストが有効なため成功とする
            };
        }
        // ファイル変更がない場合は、エラーを返す
        if (parsedResult.changes.length === 0) {
            return {
                success: false,
                filesModified: 0,
                error: '適用可能なコード変更が見つかりませんでした',
                changes: [],
            };
        }
        this.pendingChanges = parsedResult.changes; // 変更のみをpendingChangesに格納
        // 変更一覧を表示
        const items = parsedResult.changes.map(c => {
            const icon = c.type === 'create' ? '🆕' : c.type === 'delete' ? '🗑️' : '📝';
            return `${icon} ${c.filePath}`;
        });
        const action = await vscode.window.showQuickPick([
            { label: '$(check) すべて適用', description: `${parsedResult.changes.length}件の変更`, action: 'apply' },
            { label: '$(diff) 変更内容を確認', description: 'diffエディタで確認してから適用', action: 'preview' },
            { label: '$(close) キャンセル', action: 'cancel' },
        ], {
            placeHolder: `${parsedResult.changes.length}件のファイル変更が検出されました`,
            title: 'LLM Bridge: 変更の適用',
        });
        if (!action || action.action === 'cancel') {
            return {
                success: false,
                filesModified: 0,
                error: 'ユーザーがキャンセルしました',
                changes: [],
            };
        }
        if (action.action === 'preview') {
            // プレビューモード: 各ファイルのdiffを表示し、最後に確認
            await this.showDiffPreview(parsedResult.changes);
            return {
                success: false,
                filesModified: 0,
                error: 'プレビュー表示中。確認後、再度「回答を適用」を実行してください。',
                changes: [],
            };
        }
        // 変更を適用
        return await this.applyAllChanges(parsedResult.changes);
    }
    /**
     * 保留中の変更を確認して適用
     */
    async confirmAndApply() {
        if (this.pendingChanges.length === 0) {
            return {
                success: false,
                filesModified: 0,
                error: '保留中の変更がありません',
                changes: [],
            };
        }
        return await this.applyAllChanges(this.pendingChanges);
    }
    /**
     * すべての変更を適用
     */
    async applyAllChanges(changes) {
        try {
            for (const change of changes) {
                await this.applyChange(change);
            }
            this.pendingChanges = [];
            return {
                success: true,
                filesModified: changes.length,
                changes,
            };
        }
        catch (error) {
            return {
                success: false,
                filesModified: 0,
                error: error instanceof Error ? error.message : String(error),
                changes: [],
            };
        }
        finally {
            await this.cleanupTempFiles(); // 変更適用後またはエラー発生時に一時ファイルをクリーンアップ
        }
    }
    /**
     * 回答をパース
     */
    async parse(response) {
        const changes = [];
        let requestedFiles = []; // 初期化を空配列に変更
        let switchModeTo;
        let continueRequested;
        let requestReason;
        // パターン1: <<<FILE:path>>> ... <<<END>>> 形式
        const fileBlockPattern = /<<<FILE:\s*(?:\[NEW\]\s*)?(.+?)>>>[\s\S]*?([\s\S]*?)<<<END>>>/g;
        let match;
        while ((match = fileBlockPattern.exec(response)) !== null) {
            let filePath = match[1].trim();
            const content = match[2].trim();
            // [NEW] プレフィックスを処理
            const isNew = filePath.includes('[NEW]') || match[0].includes('[NEW]');
            filePath = filePath.replace('[NEW]', '').trim();
            changes.push({
                filePath,
                content,
                type: isNew ? 'create' : 'modify',
            });
        }
        // パターン2: <<<DELETE:path>>> 形式
        const deletePattern = /<<<DELETE:\s*(.+?)>>>/g;
        while ((match = deletePattern.exec(response)) !== null) {
            changes.push({
                filePath: match[1].trim(),
                content: '',
                type: 'delete',
            });
        }
        // パターン3: <<<REPLACE_SECTION: path/to/file.ts>>> 形式の解析
        const replaceSectionPattern = /<<<REPLACE_SECTION:\s*(.+?)>>>\n([\s\S]+?)<<<END>>>/g;
        let replaceSectionMatch;
        while ((replaceSectionMatch = replaceSectionPattern.exec(response)) !== null) {
            const filePath = replaceSectionMatch[1].trim();
            const replaceBlocksContent = replaceSectionMatch[2]; // SEARCH/REPLACEブロック全体
            // 既存ファイルの内容を読み込む
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.error(`[LLM Bridge - Parser] Error: Workspace not open, cannot apply REPLACE_SECTION for ${filePath}.`);
                continue; // 次のブロックへ
            }
            const fullPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(workspaceFolder.uri.fsPath, filePath);
            let originalFileContent;
            try {
                originalFileContent = await fs.promises.readFile(fullPath, 'utf-8');
            }
            catch (e) {
                console.error(`[LLM Bridge - Parser] Error reading file for REPLACE_SECTION: ${fullPath}. ${e instanceof Error ? e.message : String(e)}`);
                continue; // ファイルが読めない場合はスキップ
            }
            let currentFileContent = originalFileContent;
            const searchReplaceBlockPattern = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
            let srMatch;
            // 各SEARCH/REPLACEブロックを処理
            while ((srMatch = searchReplaceBlockPattern.exec(replaceBlocksContent)) !== null) {
                const searchContent = srMatch[1];
                const replaceContent = srMatch[2];
                // 最初のマッチのみを置換
                const updatedContent = currentFileContent.replace(searchContent, replaceContent);
                if (currentFileContent === updatedContent) {
                    console.warn(`[LLM Bridge - Parser] REPLACE_SECTION: Search content not found for file ${filePath} in block: \nSEARCH:\n${searchContent}\nREPLACE:\n${replaceContent}`);
                    // 警告は出すが、処理は続行（他のブロックに影響しないため）
                }
                currentFileContent = updatedContent;
            }
            // 更新されたファイル内容でFileChangeを作成
            changes.push({
                filePath,
                content: currentFileContent,
                type: 'modify',
            });
        }
        // パターン4: <<<REQUEST_FILE: path/to/file.ts>>>
        const requestFileGlobalPattern = /<<<REQUEST_FILE:\s*(.+?)>>>/g;
        let requestFileMatch;
        while ((requestFileMatch = requestFileGlobalPattern.exec(response)) !== null) {
            requestedFiles.push(requestFileMatch[1].trim());
        }
        // パターン5: <<<REQUEST_FILES>>> ... <<<END>>>
        const requestFilesPattern = /<<<REQUEST_FILES>>>([\s\S]+?)<<<END>>>/;
        let requestFilesMatch;
        if ((requestFilesMatch = requestFilesPattern.exec(response)) !== null) {
            const filesList = requestFilesMatch[1].trim().split('\n').map(line => line.trim().replace(/^- /, '')).filter(Boolean);
            requestedFiles.push(...filesList);
        }
        // パターン6: <<<SWITCH_MODE: edit>>> ... <<<END>>>
        const switchModePattern = /<<<SWITCH_MODE:\s*(browse|edit)>>>\s*(?:対象ファイル:([\s\S]*?))?\s*(?:理由:([\s\S]*?))?<<<END>>>/;
        let switchModeMatch;
        if ((switchModeMatch = switchModePattern.exec(response)) !== null) {
            switchModeTo = switchModeMatch[1].trim();
            if (switchModeMatch[2]) {
                const filesList = switchModeMatch[2].trim().split('\n').map(line => line.trim().replace(/^- /, '')).filter(Boolean);
                filesList.forEach(file => {
                    if (!requestedFiles.includes(file)) {
                        requestedFiles.push(file);
                    }
                });
            }
            if (switchModeMatch[3]) {
                requestReason = switchModeMatch[3].trim();
            }
        }
        // パターン7: <<<CONTINUE>>> ... <<<END>>>
        const continuePattern = /<<<CONTINUE>>>[\s\S]*?<<<END>>>/g;
        if (continuePattern.test(response)) {
            continueRequested = true;
        }
        // --- デバッグログを追加 ---
        console.log(`[LLM Bridge - Parser] Response Parse Summary:`);
        console.log(`  - Files to change: ${changes.length}`);
        if (changes.length > 0) {
            changes.forEach(c => console.log(`    - [${c.type}] ${c.filePath}`));
        }
        console.log(`  - Files requested: ${requestedFiles.length}`);
        if (requestedFiles.length > 0) {
            requestedFiles.forEach(file => console.log(`    - ${file}`));
        }
        console.log(`  - Switch Mode Request: ${switchModeTo || 'None'}`);
        console.log(`  - Continue Request: ${continueRequested ? 'Yes' : 'No'}`);
        // --- デバッグログここまで ---
        // パターン8: ```言語:path ... ``` 形式 (フォールバック、ただし変更リクエストより優先度は低い)
        if (changes.length === 0 && requestedFiles.length === 0 && !switchModeTo && !continueRequested) {
            const codeBlockPattern = /```(\w+)?:?\s*([^\n`]+)?\n([\s\S]*?)```/g;
            while ((match = codeBlockPattern.exec(response)) !== null) {
                const possiblePath = match[2]?.trim();
                const content = match[3].trim();
                if (possiblePath && possiblePath.includes('.')) {
                    changes.push({
                        filePath: possiblePath,
                        content,
                        type: 'modify',
                    });
                }
            }
        }
        return {
            success: true, // パース自体は成功
            filesModified: changes.length, // パース時点での変更数
            changes,
            requestedFiles: requestedFiles.length > 0 ? requestedFiles : undefined, // 空配列の場合はundefinedに戻す
            switchModeTo,
            continueRequested,
            requestReason,
        };
    }
    // --- applyUnifiedDiff メソッドは完全に削除 ---
    /**
     * Diffプレビューを表示 (非モーダル)
     */
    async showDiffPreview(changes) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません');
            return;
        }
        // 一時ディレクトリを作成
        const tmpBase = path.join(workspaceFolder.uri.fsPath, '.llm-bridge-preview');
        if (!fs.existsSync(tmpBase)) {
            await fs.promises.mkdir(tmpBase, { recursive: true });
        }
        this.tempDir = tmpBase;
        // 各変更のdiffを表示
        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const fullPath = path.isAbsolute(change.filePath)
                ? change.filePath
                : path.join(workspaceFolder.uri.fsPath, change.filePath);
            // 新しい内容を一時ファイルに保存
            const tempFilePath = path.join(tmpBase, `${i}_${path.basename(change.filePath)}`);
            await fs.promises.writeFile(tempFilePath, change.content, 'utf-8');
            const tempUri = vscode.Uri.file(tempFilePath);
            if (change.type === 'delete') {
                // 削除の場合は元ファイルを表示
                if (fs.existsSync(fullPath)) {
                    const doc = await vscode.workspace.openTextDocument(fullPath);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    vscode.window.showWarningMessage(`このファイルは削除されます: ${change.filePath}`);
                }
            }
            else if (fs.existsSync(fullPath)) {
                // 既存ファイルの変更 -> diffを表示
                const originalUri = vscode.Uri.file(fullPath);
                await vscode.commands.executeCommand('vscode.diff', originalUri, tempUri, `${change.filePath}: 変更プレビュー (${i + 1}/${changes.length})`);
            }
            else {
                // 新規ファイル -> そのまま表示
                const doc = await vscode.workspace.openTextDocument(tempUri);
                await vscode.window.showTextDocument(doc, { preview: false });
            }
        }
        // ステータスバーで案内
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        statusBarItem.text = '$(check) 変更を適用';
        statusBarItem.tooltip = 'クリックして変更を適用';
        statusBarItem.command = 'llmBridge.confirmApply';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.show();
        // 10秒後にステータスバーを非表示
        // TODO: ユーザーがpreview中にStatusBarItemを閉じてしまう可能性があるので、永続的な表示を検討
        setTimeout(() => {
            statusBarItem.dispose();
        }, 10000);
        vscode.window.showInformationMessage(`${changes.length}件の変更をプレビュー中。確認後、コマンド「LLM Bridge: 変更を適用」を実行してください。`, '変更を適用').then(result => {
            if (result === '変更を適用') {
                vscode.commands.executeCommand('llmBridge.confirmApply');
            }
        });
    }
    /**
     * 一時ファイルをクリーンアップ
     */
    async cleanupTempFiles() {
        if (this.tempDir && fs.existsSync(this.tempDir)) {
            await fs.promises.rm(this.tempDir, { recursive: true, force: true });
            this.tempDir = null;
        }
    }
    /**
     * 変更を適用
     */
    async applyChange(change) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('ワークスペースが開かれていません');
        }
        const fullPath = path.isAbsolute(change.filePath)
            ? change.filePath
            : path.join(workspaceFolder.uri.fsPath, change.filePath);
        if (change.type === 'delete') {
            // ファイル削除
            if (fs.existsSync(fullPath)) {
                await fs.promises.unlink(fullPath);
                vscode.window.showInformationMessage(`削除: ${change.filePath}`);
            }
            return;
        }
        // ディレクトリを作成
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        // ファイルを書き込み
        await fs.promises.writeFile(fullPath, change.content, 'utf-8');
        // エディタで開く (新規ファイルの場合のみ開くべきか？)
        // 変更されたファイルが既に開かれている場合は、自動で更新される
        // 新規ファイルまたは閉じていたファイルの場合は開く
        if (!vscode.workspace.textDocuments.some(doc => doc.uri.fsPath === fullPath)) {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
        }
    }
}
exports.ResponseParser = ResponseParser;
//# sourceMappingURL=ResponseParser.js.map