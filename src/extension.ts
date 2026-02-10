import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';
import { ContextManager } from './context/ContextManager';
import { PromptGenerator } from './prompt/PromptGenerator';
import { ResponseParser, ParseResult } from './parsers/ResponseParser'; // ParseResultをResponseParserから直接インポート
import { HistoryManager, HistoryEntry, PromptGeneratedDetails, ResponseAppliedDetails, ActionDetail, UserActionDetails } from './history/HistoryManager'; // HistoryManager関連をインポート

let outputChannel: vscode.OutputChannel; // グローバルでOutputChannelを宣言

export function activate(context: vscode.ExtensionContext) {
    console.log('LLM Copilot Bridge is now active!');
    outputChannel = vscode.window.createOutputChannel('LLM Bridge Log');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] LLM Copilot Bridge activated.`);
    console.log(`[LLM Bridge] LLM Copilot Bridge activated. OutputChannel: "LLM Bridge Log"`);

    // 共有インスタンスを作成
    const contextManager = new ContextManager();
    const promptGenerator = new PromptGenerator(contextManager);
    const responseParser = new ResponseParser();
    const historyManager = new HistoryManager(); // HistoryManagerをインスタンス化

    // サイドバープロバイダーを登録
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        contextManager,
        promptGenerator,
        responseParser,
        historyManager // SidebarProviderにもHistoryManagerを渡す
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
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: generatePrompt ---`);
            console.log(`[LLM Bridge] --- COMMAND: generatePrompt ---`);
            try {
                const limitResult = await promptGenerator.checkCharLimit(); // 文字数制限をチェック

                let generatedPrompt = '';
                if (limitResult.exceeded) {
                    // 分割送信が必要
                    const parts = await promptGenerator.generateSplit(limitResult.limit);
                    if (parts.length > 0) {
                        generatedPrompt = parts[0];
                        await vscode.env.clipboard.writeText(generatedPrompt);
                        vscode.window.showInformationMessage(
                            `パート 1/${parts.length} をクリップボードにコピーしました (${generatedPrompt.length}文字)`
                        );
                        sidebarProvider.postMessageToWebview({
                            type: 'splitPromptGenerated',
                            totalParts: parts.length,
                            currentPart: 1
                        });
                        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 分割プロンプト パート 1/${parts.length} をクリップボードにコピーしました (${generatedPrompt.length}文字)`);
                        console.log(`[LLM Bridge] 分割プロンプト パート 1/${parts.length} をクリップボードにコピーしました (${generatedPrompt.length}文字)`);
                    } else {
                        // プロンプト生成に失敗したがエラーがスローされなかった場合
                        vscode.window.showErrorMessage('プロンプト生成に失敗しました (空のプロンプトが生成されました)。');
                        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] エラー: プロンプト生成に失敗しました (空のプロンプト)。`);
                        console.error(`[LLM Bridge] エラー: プロンプト生成に失敗しました (空のプロンプト)。`);
                        return; // 履歴に追加せずに終了
                    }
                } else {
                    // 分割不要
                    generatedPrompt = await promptGenerator.generate();
                    await vscode.env.clipboard.writeText(generatedPrompt);
                    vscode.window.showInformationMessage(
                        `プロンプトをクリップボードにコピーしました (${generatedPrompt.length}文字)`
                    );
                    sidebarProvider.postMessageToWebview({ type: 'promptCopied' }); // UIフィードバック用
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] プロンプト生成 (${generatedPrompt.length}文字)`);
                    console.log(`[LLM Bridge] プロンプト生成 (${generatedPrompt.length}文字)`);
                    outputChannel.appendLine('--- Generated Prompt (truncated to 500 chars) ---');
                    outputChannel.appendLine(generatedPrompt.substring(0, 500) + (generatedPrompt.length > 500 ? '\n...(truncated)' : ''));
                    outputChannel.appendLine('--------------------------------------------------');
                }

                // 履歴に追加
                const promptGeneratedDetails: PromptGeneratedDetails = {
                    promptSummary: generatedPrompt.substring(0, 200) + (generatedPrompt.length > 200 ? '...' : ''),
                    fullPromptLength: generatedPrompt.length,
                    mode: contextManager.getMode(),
                    systemPromptLevel: promptGenerator.getSystemPromptLevel(),
                    taskType: promptGenerator.getTaskType(),
                    filesInContext: contextManager.getFiles().map(f => f.relativePath),
                    instruction: contextManager.getInstruction(),
                };
                historyManager.addEntry({
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'prompt_generated',
                    details: promptGeneratedDetails,
                });
                sidebarProvider.refresh(); // サイドバーの履歴を更新

            } catch (error) {
                vscode.window.showErrorMessage(
                    `プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`
                );
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] エラー: プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
                console.error(`[LLM Bridge] エラー: プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.setSystemPromptLevel', (level: 'full' | 'minimal') => {
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: setSystemPromptLevel ---`);
            console.log(`[LLM Bridge] --- COMMAND: setSystemPromptLevel ---`);
            promptGenerator.setSystemPromptLevel(level);
            sidebarProvider.refresh(); // UIを更新して変更を反映
            vscode.window.showInformationMessage(`システムプロンプトレベルを「${level === 'full' ? '詳細' : '最小限'}」に設定しました。`);
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] システムプロンプトレベルを「${level}」に設定しました。`);
            console.log(`[LLM Bridge] システムプロンプトレベルを「${level}」に設定しました。`);
            outputChannel.appendLine('========================================');
            console.log('========================================');

            // 履歴に追加
            historyManager.addEntry({
                timestamp: new Date().toLocaleTimeString(),
                type: 'user_action',
                details: {
                    actionType: 'set_system_prompt_level',
                    target: level,
                    status: 'success',
                    message: `システムプロンプトレベルを「${level === 'full' ? '詳細' : '最小限'}」に設定`,
                }
            });
            sidebarProvider.refresh(); // サイドバーの履歴を更新
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.setInputCharLimit', (limit: number) => {
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: setInputCharLimit ---`);
            console.log(`[LLM Bridge] --- COMMAND: setInputCharLimit ---`);
            promptGenerator.setInputCharLimit(limit);
            // vscode.workspace.getConfiguration('llmBridge').update('inputCharLimit', limit, vscode.ConfigurationTarget.Global); // 設定に保存することも可能
            sidebarProvider.refresh(); // UIを更新して変更を反映
            vscode.window.showInformationMessage(`文字数上限を ${limit} に設定しました。`);
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 文字数上限を ${limit} に設定しました。`);
            console.log(`[LLM Bridge] 文字数上限を ${limit} に設定しました。`);
            outputChannel.appendLine('========================================');
            console.log('========================================');

            // 履歴に追加
            historyManager.addEntry({
                timestamp: new Date().toLocaleTimeString(),
                type: 'user_action',
                details: {
                    actionType: 'set_input_char_limit',
                    target: limit.toString(),
                    status: 'success',
                    message: `文字数上限を ${limit} に設定`,
                }
            });
            sidebarProvider.refresh(); // サイドバーの履歴を更新
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.generateSplitPromptPart', async (partIndex: number) => {
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: generateSplitPromptPart (${partIndex}) ---`);
            console.log(`[LLM Bridge] --- COMMAND: generateSplitPromptPart (${partIndex}) ---`);
            try {
                const limitResult = await promptGenerator.checkCharLimit();
                const parts = await promptGenerator.generateSplit(limitResult.limit);

                if (partIndex >= 0 && partIndex < parts.length) {
                    await vscode.env.clipboard.writeText(parts[partIndex]);
                    vscode.window.showInformationMessage(
                        `パート ${partIndex + 1}/${parts.length} をコピーしました (${parts[partIndex].length}文字)`
                    );
                    sidebarProvider.postMessageToWebview({
                        type: 'splitPromptGenerated',
                        totalParts: parts.length,
                        currentPart: partIndex + 1
                    });
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 分割プロンプト パート ${partIndex + 1}/${parts.length} をクリップボードにコピーしました。`);
                    console.log(`[LLM Bridge] 分割プロンプト パート ${partIndex + 1}/${parts.length} をクリップボードにコピーしました。`);
                } else {
                    vscode.window.showErrorMessage(`無効な分割パート番号: ${partIndex}`);
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] エラー: 無効な分割パート番号: ${partIndex}`);
                    console.error(`[LLM Bridge] エラー: 無効な分割パート番号: ${partIndex}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `分割プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`
                );
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] エラー: 分割プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
                console.error(`[LLM Bridge] エラー: 分割プロンプト生成に失敗: ${error instanceof Error ? error.message : String(error)}`);
            }
            outputChannel.appendLine('========================================');
            console.log('========================================');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmBridge.applyResponse', async () => {
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: applyResponse ---`);
            console.log(`[LLM Bridge] --- COMMAND: applyResponse ---`);
            const response = await vscode.env.clipboard.readText();
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] LLM応答を適用中...`);
            console.log(`[LLM Bridge] LLM応答を適用中...`);
            outputChannel.appendLine('--- LLM Response ---');
            outputChannel.appendLine(response);
            outputChannel.appendLine('--------------------');
            
            const result: ParseResult = await responseParser.parseAndApply(response); // ResponseParserのParseResult型を使用
            const actionsTaken: ActionDetail[] = [];
            let overallSuccess = result.status === 'success'; // statusから判断
            let errorMessage: string | undefined = result.error;

            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ResponseParser.parseAndApply 結果: success=${result.success}, error=${result.error}`);
            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ResponseParser.parseAndApply 結果: status=${result.status}`); // statusもログに出力
            console.log(`[LLM Bridge] ResponseParser.parseAndApply 結果: success=${result.success}, error=${result.error}`);
            console.log(`[LLM Bridge] ResponseParser.parseAndApply 結果: status=${result.status}`);
            outputChannel.appendLine(`  - ファイル変更数: ${result.filesModified}`);
            outputChannel.appendLine(`  - ファイルリクエスト: ${result.requestedFiles ? result.requestedFiles.length : 0}件`);
            outputChannel.appendLine(`  - モード切り替えリクエスト: ${result.switchModeTo || 'なし'}`);
            outputChannel.appendLine(`  - 続きを要求: ${result.continueRequested ? 'はい' : 'いいえ'}`);
            console.log(`[LLM Bridge]   - ファイル変更数: ${result.filesModified}`);
            console.log(`[LLM Bridge]   - ファイルリクエスト: ${result.requestedFiles ? result.requestedFiles.length : 0}件`);
            console.log(`[LLM Bridge]   - モード切り替えリクエスト: ${result.switchModeTo || 'なし'}`);
            console.log(`[LLM Bridge]   - 続きを要求: ${result.continueRequested ? 'はい' : 'いいえ'}`);


            if (result.status === 'pending') { // プレビュー中の場合
                vscode.window.showInformationMessage('変更内容をプレビュー表示中。確認後、コマンド「LLM Bridge: 変更を適用」を実行してください。');
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: プレビュー表示中。`);
                console.log(`[LLM Bridge] 処理分岐: プレビュー表示中。`);
                actionsTaken.push({ actionType: 'none', status: 'pending', message: result.error }); // errorはundefinedだがメッセージとして利用
            } else if (result.status === 'success' || result.status === 'failure') { // 成功または失敗の場合
                if (result.status === 'failure') {
                    overallSuccess = false;
                }
                if (result.switchModeTo) { // モード切り替えが最優先 (成功時のみ)
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: モード切り替えリクエストを検出。`);
                    console.log(`[LLM Bridge] 処理分岐: モード切り替えリクエストを検出。`);
                    contextManager.setMode(result.switchModeTo); // モード切り替え
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}]   モードを ${result.switchModeTo} に設定しました。`);
                    console.log(`[LLM Bridge]   モードを ${result.switchModeTo} に設定しました。`);
                    actionsTaken.push({ actionType: 'mode_switch', target: result.switchModeTo, status: result.status });
                    
                    // モード切り替えに伴いリクエストされたファイルがある場合もここで処理
                    if (result.requestedFiles && result.requestedFiles.length > 0) {
                        for (const filePath of result.requestedFiles) {
                            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}]   モード切り替えに伴いファイルをコンテキストに追加: ${filePath}`);
                            console.log(`[LLM Bridge]   モード切り替えに伴いファイルをコンテキストに追加: ${filePath}`);
                            try {
                                await contextManager.addPath(filePath);
                                actionsTaken.push({ actionType: 'file_request_add', target: filePath, status: 'success', message: 'モード切り替えに伴い追加' });
                            } catch (e) {
                                actionsTaken.push({ actionType: 'file_request_add', target: filePath, status: 'failure', message: `追加失敗: ${e instanceof Error ? e.message : String(e)}` });
                                overallSuccess = false;
                                errorMessage = errorMessage ? `${errorMessage}; ${filePath}追加失敗` : `${filePath}追加失敗`;
                            }
                        }
                    }
                    sidebarProvider.refresh();
                    const newPrompt = await promptGenerator.generate();
                    await vscode.env.clipboard.writeText(newPrompt);
                    vscode.window.showInformationMessage(
                        `LLMがモードを「${result.switchModeTo === 'browse' ? '閲覧' : '編集'}」に切り替えることを要求しました。${result.requestReason ? `理由: ${result.requestReason}` : ''}新しいプロンプトをクリップボードにコピーしました。LLMにペーストしてください。`
                    );
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 新しいプロンプトをクリップボードにコピーしました。`);
                    console.log(`[LLM Bridge] 新しいプロンプトをクリップボードにコピーしました。`);

                } else if (result.requestedFiles && result.requestedFiles.length > 0) { // 次にファイルリクエスト (成功時のみ)
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: ファイルリクエストを検出。`);
                    console.log(`[LLM Bridge] 処理分岐: ファイルリクエストを検出。`);
                    for (const filePath of result.requestedFiles) {
                        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}]   ファイルをコンテキストに追加: ${filePath}`);
                        console.log(`[LLM Bridge]   ファイルをコンテキストに追加: ${filePath}`);
                        try {
                            await contextManager.addPath(filePath);
                            actionsTaken.push({ actionType: 'file_request_add', target: filePath, status: 'success' });
                        } catch (e) {
                            actionsTaken.push({ actionType: 'file_request_add', target: filePath, status: 'failure', message: `追加失敗: ${e instanceof Error ? e.message : String(e)}` });
                            overallSuccess = false;
                            errorMessage = errorMessage ? `${errorMessage}; ${filePath}追加失敗` : `${filePath}追加失敗`;
                        }
                    }
                    sidebarProvider.refresh();
                    const newPrompt = await promptGenerator.generate();
                    await vscode.env.clipboard.writeText(newPrompt);
                    vscode.window.showInformationMessage(
                        `LLMが${result.requestedFiles.length}個のファイルをリクエストしました。コンテキストに追加し、新しいプロンプトをクリップボードにコピーしました。LLMにペーストしてください。`
                    );
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 新しいプロンプトをクリップボードにコピーしました。`);
                    console.log(`[LLM Bridge] 新しいプロンプトをクリップボードにコピーしました。`);
                    
                    if (contextManager.getMode() === 'browse') { // このヒントはファイルリクエストのみの場合に意味がある
                        vscode.window.showInformationMessage(
                            '現在のモードは閲覧モードです。ファイル全文が必要な場合は、LLMの応答に <<<SWITCH_MODE: edit>>> も含めてリクエストしてください。'
                        );
                        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ヒント: 閲覧モードでファイルがリクエストされました。全文が必要ならLLMに編集モードへの切り替えも促してください。`);
                        console.log(`[LLM Bridge] ヒント: 閲覧モードでファイルがリクエストされました。全文が必要ならLLMに編集モードへの切り替えも促してください。`);
                    }

                } else if (result.continueRequested) {
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: 続きを要求。`);
                    console.log(`[LLM Bridge] 処理分岐: 続きを要求。`);
                    vscode.window.showInformationMessage(
                        `LLMが応答の続きを要求しています。LLMに「続けて」と入力するか、再度プロンプトを生成してペーストしてください。`
                    );
                    actionsTaken.push({ actionType: 'continue_request', status: 'success' });
                
                } else if (result.filesModified > 0) {
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: ファイル変更を適用。`);
                    console.log(`[LLM Bridge] 処理分岐: ファイル変更を適用。`);
                    vscode.window.showInformationMessage(
                        `${result.filesModified}個のファイルを更新しました`
                    );
                    // ファイル変更はapplyAllChangesでまとめて処理されるため、ここでは個別のActionDetailを記録しない
                    // applyAllChangesの成功/失敗を記録する
                    actionsTaken.push({ actionType: 'file_modify', target: `${result.filesModified} files`, status: result.status, message: 'ユーザー確認待ち' });
                } else {
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: 変更/リクエストなし。`);
                    console.log(`[LLM Bridge] 処理分岐: 変更/リクエストなし。`);
                     vscode.window.showInformationMessage('LLMからの応答に適用可能な変更やリクエストはありませんでした。');
                     actionsTaken.push({ actionType: 'none', message: '適用可能な変更/リクエストなし', status: 'skipped' });
                }

            } else if (result.status === 'failure') { // 失敗の場合
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 処理分岐: エラーを検出。`);
                console.log(`[LLM Bridge] 処理分岐: エラーを検出。`);
                if (result.error) {
                    vscode.window.showErrorMessage(`LLM応答の処理に失敗: ${result.error}`);
                }
                actionsTaken.push({ actionType: 'error', status: 'failure', message: result.error });
                overallSuccess = false;
            } // 'pending'の場合は何もしない (メッセージはshowFileChangePreviewが出す)
            outputChannel.appendLine('========================================');
            console.log('========================================');

            // LLM応答適用結果を履歴に追加
            const responseAppliedDetails: ResponseAppliedDetails = {
                llmResponse: response,
                parseResult: { ...result }, // resultオブジェクト全体をコピーして、changesプロパティも含む
                actionsTaken: actionsTaken,
                overallSuccess: overallSuccess,
                errorMessage: errorMessage,
            };
            historyManager.addEntry({
                timestamp: new Date().toLocaleTimeString(),
                type: 'response_applied',
                details: responseAppliedDetails,
            });
            sidebarProvider.refresh(); // サイドバーの履歴を更新
            return result; // applyResponse コマンドの戻り値として ParseResult を返す
         })
     );

     context.subscriptions.push(
         vscode.commands.registerCommand('llmBridge.addFileToContext', async (uri: vscode.Uri) => {
             outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: addFileToContext ---`);
             console.log(`[LLM Bridge] --- COMMAND: addFileToContext ---`);
             const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
             if (fileUri) {
                 outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 手動でファイルをコンテキストに追加: ${vscode.workspace.asRelativePath(fileUri)}`);
                 console.log(`[LLM Bridge] 手動でファイルをコンテキストに追加: ${vscode.workspace.asRelativePath(fileUri)}`);
                 try {
                     await contextManager.addPath(fileUri.fsPath);
                     historyManager.addEntry({
                         timestamp: new Date().toLocaleTimeString(),
                         type: 'user_action',
                         details: {
                             actionType: 'add_file_to_context',
                             target: vscode.workspace.asRelativePath(fileUri),
                             status: 'success',
                             message: '手動でファイルをコンテキストに追加',
                         }
                     });
                 } catch (error) {
                     console.error("Failed to add file to context:", error);
                     historyManager.addEntry({
                         timestamp: new Date().toLocaleTimeString(),
                         type: 'user_action',
                         details: {
                             actionType: 'add_file_to_context',
                             target: vscode.workspace.asRelativePath(fileUri),
                             status: 'failure',
                             message: `ファイルの追加に失敗: ${error instanceof Error ? error.message : String(error)}`,
                         }
                     });
                 }
                 sidebarProvider.refresh();
                 vscode.window.showInformationMessage(
                     `コンテキストに追加: ${vscode.workspace.asRelativePath(fileUri)}`
                 );
             }
             outputChannel.appendLine('========================================');
             console.log('========================================');
         })
     );

     context.subscriptions.push(
         vscode.commands.registerCommand('llmBridge.confirmApply', async () => {
             outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] --- COMMAND: confirmApply ---`);
             console.log(`[LLM Bridge] --- COMMAND: confirmApply ---`);
             outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 保留中の変更を適用中...`);
             console.log(`[LLM Bridge] 保留中の変更を適用中...`);
             const result = await responseParser.confirmAndApply();
             const actionsTaken: ActionDetail[] = [];
             let overallSuccess = result.status === 'success';
             let errorMessage: string | undefined = result.error;

             if (result.status === 'success') {
                 vscode.window.showInformationMessage(
                     `${result.filesModified}個のファイルを更新しました`
                 );
                 outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 保留中の変更を適用しました: ${result.filesModified}個のファイルを更新。`);
                 console.log(`[LLM Bridge] 保留中の変更を適用しました: ${result.filesModified}個のファイルを更新。`);
                 result.changes.forEach(change => actionsTaken.push({
                     actionType: `file_${change.type}` as ActionDetail['actionType'],
                     target: change.filePath,
                     status: 'success',
                     message: '変更適用済',
                 }));
             } else if (result.status === 'failure') {
                 vscode.window.showWarningMessage(result.error ?? '変更の適用に失敗しました');
                 outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 保留中の変更の適用に失敗: ${result.error}`);
                 console.log(`[LLM Bridge] 保留中の変更の適用に失敗: ${result.error}`);
                 actionsTaken.push({ actionType: 'error', status: 'failure', message: result.error ?? '不明なエラー' }); // エラーメッセージを追加
                 overallSuccess = false;
             }
             outputChannel.appendLine('========================================');
             console.log('========================================');

             historyManager.addEntry({
                 timestamp: new Date().toLocaleTimeString(),
                 type: 'user_action',
                 details: {
                     actionType: 'confirm_apply',
                     target: `${result.filesModified} files`,
                     status: overallSuccess ? 'success' : 'failure',
                     message: overallSuccess ? '変更を適用しました' : `変更の適用に失敗: ${errorMessage ?? '不明なエラー'}`,
                 }
             });
             sidebarProvider.refresh(); // サイドバーの履歴を更新
         })
     );
 }

 export function deactivate() { }
