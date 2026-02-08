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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
class SidebarProvider {
    constructor(_extensionUri, contextManager, promptGenerator, responseParser) {
        this._extensionUri = _extensionUri;
        this.contextManager = contextManager;
        this.promptGenerator = promptGenerator;
        this.responseParser = responseParser;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Webviewからのメッセージを処理
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'generatePrompt':
                    await this.handleGeneratePrompt();
                    break;
                case 'generateSplitPrompt':
                    await this.handleGenerateSplitPrompt(data.partIndex);
                    break;
                case 'applyResponse':
                    await this.handleApplyResponse(data.response);
                    break;
                case 'setMode':
                    this.contextManager.setMode(data.mode);
                    this.refresh();
                    break;
                case 'setTaskType':
                    this.promptGenerator.setTaskType(data.taskType);
                    break;
                case 'setInstruction':
                    this.contextManager.setInstruction(data.instruction);
                    this.updateCharCount();
                    break;
                case 'removeFile':
                    this.contextManager.removeFile(data.filePath);
                    this.refresh();
                    break;
                case 'clearContext':
                    this.contextManager.clear();
                    this.refresh();
                    break;
                case 'ready':
                    this.refresh();
                    break;
            }
        });
    }
    refresh() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'update',
                files: this.contextManager.getFiles(),
                mode: this.contextManager.getMode(),
                taskType: this.promptGenerator.getTaskType(),
                taskTypes: this.promptGenerator.getAvailableTaskTypes(),
                instruction: this.contextManager.getInstruction(),
            });
            this.updateCharCount();
        }
    }
    async updateCharCount() {
        if (this._view) {
            const result = await this.promptGenerator.checkCharLimit();
            this._view.webview.postMessage({
                type: 'charCount',
                current: result.current,
                limit: result.limit,
                exceeded: result.exceeded,
                parts: result.parts,
            });
        }
    }
    async handleGeneratePrompt() {
        try {
            const result = await this.promptGenerator.checkCharLimit();
            if (result.exceeded) {
                // 分割送信が必要
                const parts = await this.promptGenerator.generateSplit(result.limit);
                await vscode.env.clipboard.writeText(parts[0]);
                vscode.window.showInformationMessage(`パート 1/${parts.length} をコピーしました (${parts[0].length}文字)`);
                this._view?.webview.postMessage({
                    type: 'splitPromptGenerated',
                    totalParts: parts.length,
                    currentPart: 1
                });
            }
            else {
                const prompt = await this.promptGenerator.generate();
                await vscode.env.clipboard.writeText(prompt);
                vscode.window.showInformationMessage(`プロンプトをクリップボードにコピーしました (${prompt.length}文字)`);
                this._view?.webview.postMessage({ type: 'promptCopied' });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleGenerateSplitPrompt(partIndex) {
        try {
            const result = await this.promptGenerator.checkCharLimit();
            const parts = await this.promptGenerator.generateSplit(result.limit);
            if (partIndex < parts.length) {
                await vscode.env.clipboard.writeText(parts[partIndex]);
                vscode.window.showInformationMessage(`パート ${partIndex + 1}/${parts.length} をコピーしました (${parts[partIndex].length}文字)`);
                this._view?.webview.postMessage({
                    type: 'splitPromptGenerated',
                    totalParts: parts.length,
                    currentPart: partIndex + 1
                });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleApplyResponse(response) {
        try {
            const result = await this.responseParser.parseAndApply(response);
            if (result.success) {
                vscode.window.showInformationMessage(`${result.filesModified}個のファイルを更新しました`);
                this._view?.webview.postMessage({ type: 'applySuccess', result });
            }
            else {
                vscode.window.showWarningMessage(`適用失敗: ${result.error}`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`適用に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    _getHtmlForWebview(_webview) {
        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Copilot Bridge</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 12px;
            color: var(--vscode-foreground);
        }
        h2 {
            font-size: 14px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .section {
            margin-bottom: 16px;
        }

        /* 文字数カウンター */
        .char-counter {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 12px;
        }
        .char-counter-text {
            font-size: 12px;
            margin-bottom: 4px;
        }
        .char-counter.exceeded .char-counter-text {
            color: var(--vscode-errorForeground);
        }
        .progress-bar {
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--vscode-button-background);
            transition: width 0.3s ease;
        }
        .char-counter.exceeded .progress-fill {
            background: var(--vscode-errorForeground);
        }

        /* モード切り替え */
        .mode-toggle {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }
        .mode-btn {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .mode-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        /* セレクト */
        select {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            font-size: 13px;
        }

        /* ファイルリスト */
        .file-list {
            max-height: 150px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
        }
        .file-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .file-item:last-child {
            border-bottom: none;
        }
        .file-name {
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .file-remove {
            background: none;
            border: none;
            color: var(--vscode-errorForeground);
            cursor: pointer;
            font-size: 14px;
            padding: 2px 6px;
        }
        .empty-list {
            padding: 16px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* テキストエリア */
        textarea {
            width: 100%;
            min-height: 80px;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: vertical;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        /* ボタン */
        button.primary {
            width: 100%;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            margin-bottom: 8px;
        }
        button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            width: 100%;
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
        }

        /* ラベル */
        label {
            display: block;
            font-size: 12px;
            margin-bottom: 4px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="char-counter" id="charCounter">
        <div class="char-counter-text">
            📊 文字数: <span id="currentCount">0</span> / <span id="limitCount">4000</span>
            <span id="partsInfo" style="margin-left: 8px; display: none;">→ <span id="partsCount">1</span>パートに分割</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
        </div>
    </div>

    <div class="split-nav" id="splitNav" style="display: none; margin-bottom: 12px;">
        <div style="display: flex; gap: 4px; align-items: center;">
            <button class="secondary" id="prevPart" style="flex: 0 0 auto; width: auto; padding: 4px 8px;">◀</button>
            <span style="flex: 1; text-align: center; font-size: 12px;">
                パート <span id="currentPart">1</span>/<span id="totalParts">1</span>
            </span>
            <button class="secondary" id="nextPart" style="flex: 0 0 auto; width: auto; padding: 4px 8px;">▶</button>
        </div>
        <button class="secondary" id="copyCurrentPart" style="margin-top: 4px;">📋 このパートをコピー</button>
    </div>

    <div class="section">
        <h2>🔄 モード</h2>
        <div class="mode-toggle">
            <button class="mode-btn active" id="browseMode" data-mode="browse">📖 閲覧</button>
            <button class="mode-btn" id="editMode" data-mode="edit">✏️ 編集</button>
        </div>
    </div>

    <div class="section">
        <h2>📋 タスク種別</h2>
        <select id="taskType">
            <option value="general">汎用</option>
            <option value="bugfix">バグ修正</option>
            <option value="refactor">リファクタリング</option>
            <option value="feature">機能追加</option>
            <option value="review">コードレビュー</option>
        </select>
    </div>

    <div class="section">
        <h2>📁 コンテキスト</h2>
        <div class="file-list" id="fileList">
            <div class="empty-list">ファイルが選択されていません<br>右クリックメニューからファイルを追加</div>
        </div>
        <button class="secondary" id="clearContext">クリア</button>
    </div>

    <div class="section">
        <label for="instruction">追加の指示:</label>
        <textarea id="instruction" placeholder="LLMへの追加の指示を入力..."></textarea>
    </div>

    <button class="primary" id="generateBtn">🚀 プロンプト生成 & コピー</button>

    <div class="section">
        <h2>📥 LLMからの回答</h2>
        <textarea id="response" placeholder="LLMからの回答をここにペースト..."></textarea>
        <button class="primary" id="applyBtn">✅ 回答を適用</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // 要素の取得
        const browseMode = document.getElementById('browseMode');
        const editMode = document.getElementById('editMode');
        const taskType = document.getElementById('taskType');
        const fileList = document.getElementById('fileList');
        const instruction = document.getElementById('instruction');
        const generateBtn = document.getElementById('generateBtn');
        const response = document.getElementById('response');
        const applyBtn = document.getElementById('applyBtn');
        const clearContext = document.getElementById('clearContext');
        const charCounter = document.getElementById('charCounter');
        const currentCount = document.getElementById('currentCount');
        const limitCount = document.getElementById('limitCount');
        const progressFill = document.getElementById('progressFill');

        // モード切り替え
        browseMode.addEventListener('click', () => {
            browseMode.classList.add('active');
            editMode.classList.remove('active');
            vscode.postMessage({ type: 'setMode', mode: 'browse' });
        });
        editMode.addEventListener('click', () => {
            editMode.classList.add('active');
            browseMode.classList.remove('active');
            vscode.postMessage({ type: 'setMode', mode: 'edit' });
        });

        // タスク種別変更
        taskType.addEventListener('change', () => {
            vscode.postMessage({ type: 'setTaskType', taskType: taskType.value });
        });

        // 指示入力
        let instructionTimeout;
        instruction.addEventListener('input', () => {
            clearTimeout(instructionTimeout);
            instructionTimeout = setTimeout(() => {
                vscode.postMessage({ type: 'setInstruction', instruction: instruction.value });
            }, 300);
        });

        // プロンプト生成
        generateBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'generatePrompt' });
        });

        // 回答適用
        applyBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'applyResponse', response: response.value });
        });

        // コンテキストクリア
        clearContext.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearContext' });
        });

        // 拡張機能からのメッセージを処理
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    updateUI(message);
                    break;
                case 'charCount':
                    updateCharCount(message);
                    break;
                case 'promptCopied':
                    generateBtn.textContent = '✅ コピー完了!';
                    setTimeout(() => {
                        generateBtn.textContent = '🚀 プロンプト生成 & コピー';
                    }, 2000);
                    break;
                case 'splitPromptGenerated':
                    showSplitNav(message.totalParts, message.currentPart);
                    break;
                case 'applySuccess':
                    response.value = '';
                    break;
            }
        });

        function updateUI(data) {
            // モード
            if (data.mode === 'browse') {
                browseMode.classList.add('active');
                editMode.classList.remove('active');
            } else {
                editMode.classList.add('active');
                browseMode.classList.remove('active');
            }

            // タスク種別
            taskType.value = data.taskType;

            // ファイルリスト
            if (data.files && data.files.length > 0) {
                fileList.innerHTML = data.files.map(f => 
                    '<div class="file-item">' +
                    '<span class="file-name">📄 ' + f.relativePath + '</span>' +
                    '<button class="file-remove" data-path="' + f.path + '">×</button>' +
                    '</div>'
                ).join('');

                // 削除ボタンにイベントを追加
                fileList.querySelectorAll('.file-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'removeFile', filePath: btn.dataset.path });
                    });
                });
            } else {
                fileList.innerHTML = '<div class="empty-list">ファイルが選択されていません<br>右クリックメニューからファイルを追加</div>';
            }

            // 指示
            if (data.instruction !== undefined) {
                instruction.value = data.instruction;
            }
        }

        function updateCharCount(data) {
            currentCount.textContent = data.current;
            limitCount.textContent = data.limit;
            const percentage = Math.min((data.current / data.limit) * 100, 100);
            progressFill.style.width = percentage + '%';

            // 分割数表示
            const partsInfo = document.getElementById('partsInfo');
            const partsCount = document.getElementById('partsCount');
            if (data.parts && data.parts > 1) {
                partsInfo.style.display = 'inline';
                partsCount.textContent = data.parts;
            } else {
                partsInfo.style.display = 'none';
            }

            if (data.exceeded) {
                charCounter.classList.add('exceeded');
            } else {
                charCounter.classList.remove('exceeded');
            }
        }

        // 分割ナビゲーション
        let splitState = { total: 1, current: 1 };
        const splitNav = document.getElementById('splitNav');
        const currentPartEl = document.getElementById('currentPart');
        const totalPartsEl = document.getElementById('totalParts');
        const prevPartBtn = document.getElementById('prevPart');
        const nextPartBtn = document.getElementById('nextPart');
        const copyCurrentPartBtn = document.getElementById('copyCurrentPart');

        function showSplitNav(total, current) {
            splitState = { total, current };
            splitNav.style.display = 'block';
            currentPartEl.textContent = current;
            totalPartsEl.textContent = total;
            prevPartBtn.disabled = current <= 1;
            nextPartBtn.disabled = current >= total;
        }

        prevPartBtn.addEventListener('click', () => {
            if (splitState.current > 1) {
                vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current - 2 });
            }
        });

        nextPartBtn.addEventListener('click', () => {
            if (splitState.current < splitState.total) {
                vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current });
            }
        });

        copyCurrentPartBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current - 1 });
        });

        // 初期化完了を通知
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=SidebarProvider.js.map