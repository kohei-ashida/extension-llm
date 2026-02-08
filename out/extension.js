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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const SidebarProvider_1 = require("./providers/SidebarProvider");
const ContextManager_1 = require("./context/ContextManager");
const PromptGenerator_1 = require("./prompt/PromptGenerator");
const ResponseParser_1 = require("./parsers/ResponseParser");
function activate(context) {
    console.log('LLM Copilot Bridge is now active!');
    // 共有インスタンスを作成
    const contextManager = new ContextManager_1.ContextManager();
    const promptGenerator = new PromptGenerator_1.PromptGenerator(contextManager);
    const responseParser = new ResponseParser_1.ResponseParser();
    // サイドバープロバイダーを登録
    const sidebarProvider = new SidebarProvider_1.SidebarProvider(context.extensionUri, contextManager, promptGenerator, responseParser);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('llmBridge.sidebar', sidebarProvider));
    // コマンドを登録
    context.subscriptions.push(vscode.commands.registerCommand('llmBridge.generatePrompt', async () => {
        const prompt = await promptGenerator.generate();
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage(`プロンプトをクリップボードにコピーしました (${prompt.length}文字)`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('llmBridge.applyResponse', async () => {
        const response = await vscode.env.clipboard.readText();
        const result = await responseParser.parseAndApply(response);
        if (result.success) {
            vscode.window.showInformationMessage(`${result.filesModified}個のファイルを更新しました`);
        }
        else {
            vscode.window.showErrorMessage(`適用に失敗: ${result.error}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('llmBridge.addFileToContext', async (uri) => {
        const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (fileUri) {
            await contextManager.addPath(fileUri.fsPath);
            sidebarProvider.refresh();
            vscode.window.showInformationMessage(`コンテキストに追加: ${vscode.workspace.asRelativePath(fileUri)}`);
        }
    }));
    // プレビュー後の確認適用コマンド
    context.subscriptions.push(vscode.commands.registerCommand('llmBridge.confirmApply', async () => {
        const result = await responseParser.confirmAndApply();
        if (result.success) {
            vscode.window.showInformationMessage(`${result.filesModified}個のファイルを更新しました`);
        }
        else if (result.error) {
            vscode.window.showWarningMessage(result.error);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map