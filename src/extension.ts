import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';
import { ContextManager } from './context/ContextManager';
import { PromptGenerator } from './prompt/PromptGenerator';
import { ResponseParser } from './parsers/ResponseParser';

export function activate(context: vscode.ExtensionContext) {
    console.log('LLM Copilot Bridge is now active!');

    // 共有インスタンスを作成
    const contextManager = new ContextManager();
    const promptGenerator = new PromptGenerator(contextManager);
    const responseParser = new ResponseParser();

    // サイドバープロバイダーを登録
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        contextManager,
        promptGenerator,
        responseParser
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'llmBridge.sidebar',
            sidebarProvider
        )
    );

    // コマンドを登録
    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.generatePrompt', async () => {
            const prompt = await promptGenerator.generate();
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                `プロンプトをクリップボードにコピーしました (${prompt.length}文字)`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.applyResponse', async () => {
            const response = await vscode.env.clipboard.readText();
            const result = await responseParser.parseAndApply(response);
            if (result.success) {
                vscode.window.showInformationMessage(
                    `${result.filesModified}個のファイルを更新しました`
                );
            } else {
                vscode.window.showErrorMessage(`適用に失敗: ${result.error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.addFileToContext', async (uri: vscode.Uri) => {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (fileUri) {
                await contextManager.addPath(fileUri.fsPath);
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(
                    `コンテキストに追加: ${vscode.workspace.asRelativePath(fileUri)}`
                );
            }
        })
    );

    // プレビュー後の確認適用コマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.confirmApply', async () => {
            const result = await responseParser.confirmAndApply();
            if (result.success) {
                vscode.window.showInformationMessage(
                    `${result.filesModified}個のファイルを更新しました`
                );
            } else if (result.error) {
                vscode.window.showWarningMessage(result.error);
            }
        })
    );
}

export function deactivate() { }
