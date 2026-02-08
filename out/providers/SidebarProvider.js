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
    constructor(_extensionUri, contextManager, promptGenerator, responseParser, historyManager // HistoryManagerを追加
    ) {
        this._extensionUri = _extensionUri;
        this.contextManager = contextManager;
        this.promptGenerator = promptGenerator;
        this.responseParser = responseParser;
        this.historyManager = historyManager;
    }
    postMessageToWebview(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
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
                    // モード変更もユーザーアクションとして履歴に記録
                    await vscode.commands.executeCommand('llmBridge.recordUserAction', {
                        actionType: 'set_mode',
                        target: data.mode,
                        status: 'success',
                        message: `モードを${data.mode}に設定`,
                    });
                    this.refresh();
                    break;
                case 'setTaskType':
                    this.promptGenerator.setTaskType(data.taskType);
                    // タスク種別変更もユーザーアクションとして履歴に記録
                    await vscode.commands.executeCommand('llmBridge.recordUserAction', {
                        actionType: 'set_task_type',
                        target: data.taskType,
                        status: 'success',
                        message: `タスク種別を${data.taskType}に設定`,
                    });
                    this.refresh(); // タスク種別変更時に文字数も更新したいのでrefresh
                    break;
                case 'setSystemPromptLevel':
                    await vscode.commands.executeCommand('llmBridge.setSystemPromptLevel', data.level);
                    this.refresh();
                    break;
                case 'setInstruction':
                    this.contextManager.setInstruction(data.instruction);
                    // 指示の入力は頻繁なので履歴には記録しない
                    this.updateCharCount();
                    break;
                case 'removeFile':
                    this.contextManager.removeFile(data.filePath);
                    // ファイル削除もユーザーアクションとして履歴に記録
                    await vscode.commands.executeCommand('llmBridge.recordUserAction', {
                        actionType: 'remove_file',
                        target: data.filePath,
                        status: 'success',
                        message: `コンテキストからファイルを削除: ${data.filePath}`,
                    });
                    this.refresh();
                    break;
                case 'clearContext':
                    this.contextManager.clear();
                    // コンテキストクリアもユーザーアクションとして履歴に記録
                    await vscode.commands.executeCommand('llmBridge.recordUserAction', {
                        actionType: 'clear_context',
                        target: 'all files',
                        status: 'success',
                        message: 'コンテキストをクリア',
                    });
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
                systemPromptLevel: this.promptGenerator.getSystemPromptLevel(),
                history: this.historyManager.getHistory(), // 履歴データを追加
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
            await vscode.commands.executeCommand('llmBridge.generatePrompt');
        }
        catch (error) {
            vscode.window.showErrorMessage(`プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleGenerateSplitPrompt(partIndex) {
        await vscode.commands.executeCommand('llmBridge.generateSplitPromptPart', partIndex);
    }
    async handleApplyResponse(response) {
        try {
            await vscode.env.clipboard.writeText(response);
            await vscode.commands.executeCommand('llmBridge.applyResponse');
        }
        catch (error) {
            vscode.window.showErrorMessage(`応答適用に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    _getHtmlForWebview(webview) {
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

        /* History */
        .history-section {
            margin-top: 24px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 16px;
        }
        .history-item {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
            overflow: hidden; /* これが原因でスクロールバーが見えない可能性も */
            min-height: 40px; /* 展開されてない状態でも最低限の高さ */
        }
        .history-header {
            display: flex;
            align-items: center; /* タイトルとタイムスタンプが中央にくるように */
            justify-content: space-between;
            padding: 8px;
            cursor: pointer;
            background: var(--vscode-panelTitle-activeBackground);
            flex-wrap: wrap;
        }
        .history-header.success { background-color: var(--vscode-statusBar-background); color: var(--vscode-statusBar-foreground); }
        .history-header.failure { background-color: var(--vscode-errorBackground); color: var(--vscode-errorForeground); }
        .history-header.warning { background-color: var(--vscode-statusBarItem-warningBackground); color: var(--vscode-statusBarItem-warningForeground); }
        .history-header.info { background-color: var(--vscode-statusBarItem-prominentBackground); color: var(--vscode-statusBarItem-prominentForeground); }

        .history-title {
            font-weight: bold;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-grow: 1;
            word-break: break-word;
            line-height: 1.4em; /* タイトルの行高も明示的に */
        }
        .history-timestamp {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
            margin-left: auto;
            white-space: nowrap;
            line-height: 1.4em; /* タイムスタンプの行高も明示的に */
        }
        .history-content {
            padding: 8px;
            border-top: 1px solid var(--vscode-panel-border);
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            box-sizing: border-box;
            background-color: var(--vscode-editorGroup-background); /* 背景色を明確に */
        }
        .history-item.expanded .history-content {
            /* max-height: none; はtransitionと相性が悪い */
            /* JavaScriptで動的にmax-heightを設定するため、ここでの固定値は不要になるが、
               transitionが効くようにデフォルトのmax-heightを少し大きくしておくか、
               JavaScriptでscrollHeightを設定する */
            /* max-height: 2000px; */ /* この行はJavaScriptが上書きするので削除またはコメントアウト */
            overflow-y: auto;
        }
        .history-detail {
            font-size: 12px;
            margin-bottom: 4px;
            line-height: 1.4em;
            word-break: break-word;
            white-space: normal;
        }
        .history-actions {
            margin-top: 8px;
            border-top: 1px dashed var(--vscode-panel-border);
            padding-top: 8px;
        }
        .action-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .action-status.success { color: var(--vscode-terminal-ansiGreen); }
        .action-status.failure { color: var(--vscode-errorForeground); }
        .action-status.warning { color: var(--vscode-terminal-ansiYellow); }
        .action-status.skipped { color: var(--vscode-descriptionForeground); }
        .action-status.info { color: var(--vscode-terminal-ansiBlue); } /* infoカラー追加 */

        .llm-response-preview {
            max-height: 100px;
            overflow-y: auto;
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 4px;
            margin-top: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
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
        <h2>📝 システムプロンプトレベル</h2>
        <div class="system-prompt-level-toggle">
            <button class="mode-btn active" id="fullPrompt" data-level="full">詳細</button>
            <button class="mode-btn" id="minimalPrompt" data-level="minimal">最小限</button>
        </div>
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

    <div class="section history-section">
        <h2>📜 アクティビティ履歴</h2>
        <div id="historyList">
            <div class="empty-list">まだアクティビティはありません。</div>
        </div>
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
        const fullPromptBtn = document.getElementById('fullPrompt');
        const minimalPromptBtn = document.getElementById('minimalPrompt');
        const historyList = document.getElementById('historyList');

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

        // システムプロンプトレベル切り替え
        fullPromptBtn.addEventListener('click', () => {
            fullPromptBtn.classList.add('active');
            minimalPromptBtn.classList.remove('active');
            vscode.postMessage({ type: 'setSystemPromptLevel', level: 'full' });
        });
        minimalPromptBtn.addEventListener('click', () => {
            minimalPromptBtn.classList.add('active');
            fullPromptBtn.classList.remove('active');
            vscode.postMessage({ type: 'setSystemPromptLevel', level: 'minimal' });
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
                    // 分割ナビゲーションを非表示にする
                    document.getElementById('splitNav').style.display = 'none';
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

            // システムプロンプトレベル
            if (data.systemPromptLevel === 'full') {
                fullPromptBtn.classList.add('active');
                minimalPromptBtn.classList.remove('active');
            } else {
                minimalPromptBtn.classList.add('active');
                fullPromptBtn.classList.remove('active');
            }

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

            // 履歴の更新
            updateHistory(data.history);
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
                vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current - 2 }); // partIndexは0ベース
            }
        });

        nextPartBtn.addEventListener('click', () => {
            if (splitState.current < splitState.total) {
                vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current }); // partIndexは0ベース
            }
        });

        copyCurrentPartBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'generateSplitPrompt', partIndex: splitState.current - 1 }); // partIndexは0ベース
        });

        // 履歴の更新
        function updateHistory(historyData) {
            if (!historyData || historyData.length === 0) {
                historyList.innerHTML = '<div class="empty-list">まだアクティビティはありません。</div>';
                return;
            }

            historyList.innerHTML = historyData.map(entry => {
                let headerClass = '';
                let title = '';
                let contentHtml = '';
                const timestamp = entry.timestamp;

                if (entry.type === 'prompt_generated') {
                    const d = entry.details;
                    title = '🚀 プロンプト生成 (' + d.fullPromptLength + '文字)';
                    headerClass = 'info';
                    contentHtml =
                        '<div class="history-detail">モード: ' + d.mode + '</div>' +
                        '<div class="history-detail">レベル: ' + d.systemPromptLevel + '</div>' +
                        '<div class="history-detail">タスク: ' + d.taskType + '</div>' +
                        '<div class="history-detail">コンテキストファイル (' + d.filesInContext.length + '件): ' + (d.filesInContext.join(', ') || 'なし') + '</div>' +
                        '<div class="history-detail">指示: ' + (d.instruction || 'なし') + '</div>' +
                        '<div class="history-detail llm-response-preview">プロンプト要約: ' + d.promptSummary + '</div>';
                } else if (entry.type === 'response_applied') {
                    const d = entry.details;
                    title = '✅ LLM応答適用 (' + (d.overallSuccess ? '成功' : '失敗') + ')';
                    headerClass = d.overallSuccess ? 'success' : 'failure';
                    contentHtml =
                        '<div class="history-detail">全体結果: <span class="action-status ' + (d.overallSuccess ? 'success' : 'failure') + '">' + (d.overallSuccess ? '成功' : '失敗') + '</span></div>' +
                        (d.errorMessage ? '<div class="history-detail action-status failure">エラー: ' + d.errorMessage + '</div>' : '') +
                        '<div class="history-detail">解析結果: ' + d.parseResult.filesModified + 'ファイル変更, ' + (d.parseResult.requestedFiles ? d.parseResult.requestedFiles.length : 0) + 'ファイルリクエスト, モード: ' + (d.parseResult.switchModeTo || 'なし') + ', 続き: ' + (d.parseResult.continueRequested ? 'はい' : 'いいえ') + '</div>' +
                        '<div class="history-detail llm-response-preview">LLM応答: ' + d.llmResponse.substring(0, 200) + '...</div>' +
                        '<div class="history-actions">' +
                            '<h3>実行されたアクション:</h3>' +
                            d.actionsTaken.map(action =>
                                '<div class="action-item">' +
                                    '<span class="action-status ' + action.status + '">' + getActionIcon(action.status) + '</span>' +
                                    '<span>' + getActionDescription(action) + '</span>' +
                                '</div>'
                            ).join('') +
                        '</div>';
                } else if (entry.type === 'user_action') {
                    const d = entry.details;
                    title = '👤 ユーザーアクション: ' + getUserActionTitle(d.actionType);
                    headerClass = d.status === 'success' ? 'info' : 'failure';
                    contentHtml =
                        '<div class="history-detail">対象: ' + (d.target || 'N/A') + '</div>' +
                        '<div class="history-detail">結果: <span class="action-status ' + d.status + '">' + (d.status === 'success' ? '成功' : '失敗') + '</span></div>' +
                        (d.message ? '<div class="history-detail">メッセージ: ' + d.message + '</div>' : '');
                }

                return (
                    '<div class="history-item" data-expanded="false">' +
                        '<div class="history-header ' + headerClass + '">' +
                            '<div class="history-title">' + title + '</div>' +
                            '<div class="history-timestamp">' + timestamp + '</div>' +
                        '</div>' +
                        '<div class="history-content">' +
                            contentHtml +
                        '</div>' +
                    '</div>'
                );
            }).join('');

            // イベントリスナーを再設定
            historyList.querySelectorAll('.history-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    const item = header.closest('.history-item');
                    const content = item.querySelector('.history-content');
                    if (item.dataset.expanded === 'true') {
                        item.dataset.expanded = 'false';
                        content.style.maxHeight = '0'; // 折りたたむ
                    } else {
                        item.dataset.expanded = 'true';
                        // content.scrollHeight は要素の全高さを返す。
                        // これを max-height に設定することで、内容の高さに完全に合わせられる。
                        content.style.maxHeight = content.scrollHeight + 'px'; // 内容の高さに合わせて展開
                    }
                });
            });
        }

        function getActionIcon(status) {
            switch (status) {
                case 'success': return '✔';
                case 'failure': return '✖';
                case 'warning': return '!';
                case 'skipped': return '-';
                case 'pending': return '…';
                case 'info': return 'ⓘ'; // Infoアイコンを追加
                default: return '';
            }
        }

        function getActionDescription(action) {
            let description = '';
            switch (action.actionType) {
                case 'file_create': description = 'ファイル作成: ' + action.target; break;
                case 'file_modify': description = 'ファイル変更: ' + action.target; break;
                case 'file_delete': description = 'ファイル削除: ' + action.target; break;
                case 'file_request_add': description = 'ファイルを追加リクエスト: ' + action.target; break;
                case 'mode_switch': description = 'モード変更: ' + action.target; break;
                case 'continue_request': description = '続きを要求'; break;
                case 'error': description = 'エラー: ' + action.message; break;
                case 'warning': description = '警告: ' + action.message; break;
                case 'none': description = 'アクションなし: ' + action.message; break;
                case 'add_file_to_context': description = 'ファイルをコンテキストに追加: ' + action.target; break;
                case 'clear_context': description = 'コンテキストをクリア'; break;
                case 'confirm_apply': description = '変更を適用'; break;
                case 'remove_file': description = 'ファイルをコンテキストから削除: ' + action.target; break;
                case 'set_mode': description = 'モード設定: ' + action.target; break;
                case 'set_task_type': description = 'タスク種別設定: ' + action.target; break;
                case 'set_instruction': description = '指示設定'; break;
                case 'set_system_prompt_level': description = 'システムプロンプトレベル設定: ' + action.target; break;
                default: description = '不明なアクション: ' + action.actionType; break;
            }
            return description + (action.message && action.actionType !== 'error' && action.actionType !== 'warning' && action.status !== 'success' ? ' (' + action.message + ')' : '');
        }

        function getUserActionTitle(actionType) {
            switch (actionType) {
                case 'add_file_to_context': return 'ファイルをコンテキストに追加';
                case 'clear_context': return 'コンテキストをクリア';
                case 'confirm_apply': return '変更を適用';
                case 'remove_file': return 'ファイルをコンテキストから削除';
                case 'set_mode': return 'モード設定';
                case 'set_task_type': return 'タスク種別設定';
                case 'set_instruction': return '指示設定';
                case 'set_system_prompt_level': return 'システムプロンプトレベル設定';
                default: return actionType;
            }
        }

        // 初期化完了を通知
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=SidebarProvider.js.map