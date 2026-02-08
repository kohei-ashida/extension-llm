export interface HistoryEntry {
    timestamp: string;
    type: 'prompt_generated' | 'response_applied' | 'user_action';
    details: PromptGeneratedDetails | ResponseAppliedDetails | UserActionDetails;
}

export interface PromptGeneratedDetails {
    promptSummary: string; // 生成されたプロンプトの要約（例: 最初のN文字）
    fullPromptLength: number;
    mode: 'browse' | 'edit';
    systemPromptLevel: 'full' | 'minimal';
    taskType: string;
    filesInContext: string[]; // プロンプトに含まれたファイルのリスト (relativePath)
    instruction: string; // ユーザーの追加指示
}

export interface ResponseAppliedDetails {
    llmResponse: string; // LLMからの生応答
    parseResult: {
        success: boolean;
        error?: string;
        filesModified: number;
        requestedFiles?: string[];
        switchModeTo?: 'browse' | 'edit';
        continueRequested?: boolean;
        requestReason?: string;
    }; // ResponseParserの結果の要約
    actionsTaken: ActionDetail[]; // 実行されたアクションの詳細
    overallSuccess: boolean;
    errorMessage?: string; // 全体的なエラーメッセージ
}

export interface UserActionDetails {
    actionType: 'add_file_to_context' | 'clear_context' | 'confirm_apply' | 'remove_file' | 'set_mode' | 'set_task_type' | 'set_instruction' | 'set_system_prompt_level';
    target?: string;
    status: 'success' | 'failure';
    message?: string;
}

export interface ActionDetail {
    actionType: 'file_create' | 'file_modify' | 'file_delete' | 'file_request_add' | 'mode_switch' | 'continue_request' | 'none' | 'error' | 'warning';
    target?: string; // ファイルパス、モード、エラーメッセージなど
    status: 'success' | 'failure' | 'skipped' | 'pending' | 'warning';
    message?: string; // 成功/失敗/警告メッセージ
    diffPreviewAvailable?: boolean; // Diffプレビューが利用可能か
}

export class HistoryManager {
    private history: HistoryEntry[] = [];
    private maxEntries = 120; // 保持する履歴の最大数

    public addEntry(entry: HistoryEntry) {
        this.history.unshift(entry); // 新しいものを先頭に追加
        if (this.history.length > this.maxEntries) {
            this.history.pop(); // 古いものを削除
        }
    }

    public getHistory(): HistoryEntry[] {
        return this.history;
    }

    public clearHistory(): void {
        this.history = [];
    }
}
