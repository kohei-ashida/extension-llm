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
exports.PromptGenerator = void 0;
const vscode = __importStar(require("vscode"));
const TEMPLATES = {
    general: {
        name: '汎用',
        taskDescription: '以下のコードについて質問に答えてください。',
    },
    bugfix: {
        name: 'バグ修正',
        taskDescription: '以下のコードのバグを特定し、修正してください。',
    },
    refactor: {
        name: 'リファクタリング',
        taskDescription: '以下のコードをリファクタリングして、可読性・保守性を向上させてください。',
    },
    feature: {
        name: '機能追加',
        taskDescription: '以下のコードに新しい機能を追加してください。',
    },
    review: {
        name: 'コードレビュー',
        taskDescription: '以下のコードをレビューし、改善点・問題点を指摘してください。',
    },
};
/**
 * システムプロンプト - モードと出力形式の詳細説明 (フルバージョン)
 */
const FULL_SYSTEM_PROMPT = `# あなたはコーディングアシスタントです

あなたは優秀なソフトウェアエンジニアとして、ユーザーのコーディングタスクを支援します。
以下のルールに従って回答してください。

---

## 動作モード

このセッションでは2つのモードがあります:

### 📖 閲覧モード (Browse Mode)
- ファイルの**要約**（シグネチャ、構造）のみが提供されます
- 目的: プロジェクトの概要把握、関連ファイルの特定
- このモードでは**コード変更は行わないでください**
- 詳細を見たいファイルがあれば、以下の形式で要求してください:

#### ファイル詳細のリクエスト
\\\`\\\`\\\`
<<<REQUEST_FILE: path/to/file.ts>>>
\\\`\\\`\\\`

複数ファイル:
\\\`\\\`\\\`
<<<REQUEST_FILES>>>
- path/to/file1.ts
- path/to/file2.ts
<<<END>>>
\\\`\\\`\\\`

編集モードへの切替:
\\\`\\\`\\\`
<<<SWITCH_MODE: edit>>>
対象ファイル:
- path/to/file.ts
理由: バグ修正のために完全なコードが必要です
<<<END>>>
\\\`\\\`\\\`

### ✏️ 編集モード (Edit Mode)
- ファイルの**完全な内容**が提供されます
- 目的: 実際のコード変更、バグ修正、機能追加
- このモードでは指定された形式でコード変更を出力してください

---

## 回答形式

### コード変更がある場合

ファイルを変更する場合は、**以下のいずれかの形式（ファイル全体の置換、新規ファイル作成、または部分置換）** で回答してください。
**部分的な変更（Diff形式）はサポートしていません**。

#### 全体置換 (ファイル全体を書き換える場合)
\`\`\`
<<<FILE: path/to/file.ts>>>
// ファイルの完全な内容をここに記述
// すべての行を含めてください
<<<END>>>
\`\`\`

#### 新規ファイル作成 (上記 <<<FILE>>> 形式と同じ)
// 新規ファイルの場合は \`<<<FILE: [NEW] path/to/newfile.ts>>>\` のように \`[NEW]\` を付けてください。

#### 部分置換 (ファイルの一部を変更する場合)
\`\`\`
<<<REPLACE_SECTION: path/to/file.ts>>>
<<<<<<< SEARCH
// 変更対象の厳密な内容をここに記述
// 改行、空白、インデントも含め、ファイル内の内容と完全に一致させてください。
// 余分な行を含めず、変更される行と一意性を確保するための最小限の周囲の行のみを含めてください。
=======
// 新しい内容をここに記述
// SEARCHで指定した内容と置き換えられます。
>>>>>>> REPLACE
<<<<<<< SEARCH
// 別の変更対象...
=======
// 別の新しい内容...
>>>>>>> REPLACE
<<<END>>>
\`\`\`
**\`<<<REPLACE_SECTION>>>\` の重要なルール:**
1.  \`SEARCH\`の内容は、置換対象となるファイル内のセクションと**完全に一致**させてください。
    *   空白、インデント、改行、コメントなども含め、文字通り完全に一致する必要があります。
2.  各\`SEARCH/REPLACE\`ブロックは、最初に見つかった箇所のみを置換します。
    *   複数の変更が必要な場合は、複数の\`SEARCH/REPLACE\`ブロックを記述してください。
    *   各\`SEARCH\`セクションには、変更される行と、その行を一意に特定するために必要な最小限の周囲の行のみを含めてください。
    *   複数の\`SEARCH/REPLACE\`ブロックを記述する場合、ファイル内での出現順に並べてください。
3.  \`SEARCH/REPLACE\`ブロックは簡潔にしてください。
    *   大きな変更は、一連の小さな\`SEARCH/REPLACE\`ブロックに分割してください。
    *   変更されない長い行の連続を\`SEARCH/REPLACE\`ブロックに含めないでください。
4.  特殊な操作:
    *   **コードの削除**: \`REPLACE\`セクションを空にしてください。
    *   **コードの移動**: 2つの\`<<<REPLACE_SECTION>>>\`ブロックを使用します（1つは元の場所からの削除、もう1つは新しい場所への挿入）。

#### ファイル削除
\`\`\`
<<<DELETE: path/to/oldfile.ts>>>
\`\`\`

#### 複数ファイルを変更する場合
// 複数のファイルを変更する場合も、各ファイルごとに上記の \`<<<FILE: ...>>>\` または \`<<<DELETE: ...>>>\` 形式で記述してください。
\`\`\`
<<<FILE: src/utils.ts>>>
...コード...
<<<END>>>

<<<FILE: src/index.ts>>>
...コード...
<<<END>>>
\`\`\`

---

## 文字数制限への対応

### 出力が長くなる場合

回答が長くなりそうな場合は、以下の方法で分割してください:

1. **優先順位を付けて回答**: 最も重要な変更から順に出力
2. **続きがある場合は明示**: 回答の最後に以下を追加
   \\\`\\\`\\\`
   <<<CONTINUE>>>
   残り: N個のファイル変更があります
   - path/to/file1.ts
   - path/to/file2.ts
   <<<END>>>
   \\\`\\\`\\\`
3. ユーザーが「続けて」と言ったら、残りを出力

### 入力が分割されて送られてきた場合

ユーザーから「これは分割送信のパート N/M です」と言われた場合:
- すべてのパートを受け取るまで待ってください
- 最後のパートで「以上ですべてです」と言われたら処理を開始

---

## 重要な注意事項

1. **正確性**: コードは動作することを確認してから出力
2. **完全性**: 部分的なコードではなく、完全なファイル内容を出力
3. **説明**: 変更の理由を簡潔に説明
4. **確認**: 不明点があれば実装前に確認

---
`;
/**
 * システムプロンプト - モードと出力形式の詳細説明 (ミニマルバージョン)
 */
const MINIMAL_SYSTEM_PROMPT = `# あなたはコーディングアシスタントです

あなたは優秀なソフトウェアエンジニアとして、ユーザーのコーディングタスクを支援します。
以下のルールに従って回答してください。

---

## 回答形式

### コード変更がある場合

ファイルを変更する場合は、**以下のいずれかの形式（ファイル全体の置換、新規ファイル作成、または部分置換）** で回答してください。
**部分的な変更（Diff形式）はサポートしていません**。

#### 全体置換 (ファイル全体を書き換える場合)
\`\`\`
<<<FILE: path/to/file.ts>>>
// ファイルの完全な内容
<<<END>>>
\`\`\`

#### 新規ファイル作成
// 新規ファイルの場合は \`<<<FILE: [NEW] path/to/newfile.ts>>>\` のように \`[NEW]\` を付けてください。

#### 部分置換 (ファイルの一部を変更する場合)
\`\`\`
<<<REPLACE_SECTION: path/to/file.ts>>>
<<<<<<< SEARCH
// 変更対象の厳密な内容
=======
// 新しい内容
>>>>>>> REPLACE
<<<END>>>
\`\`\`
**\\\`<<<REPLACE_SECTION>>>\\\` のルール:** \`SEARCH\`の内容は完全に一致、各ブロックは最初のマッチのみ置換、ブロックは簡潔に。

#### ファイル削除
\`\`\`
<<<DELETE: path/to/oldfile.ts>>>
\`\`\`

---

## ファイルリクエスト形式

閲覧モードでファイルの詳細を確認したい場合、LLMは以下の形式で要求します。

### 単一ファイルのリクエスト
\\\`\\\`\\\`
<<<REQUEST_FILE: path/to/file.ts>>>
\\\`\\\`\\\`

### 複数ファイルのリクエスト
\\\`\\\`\\\`
<<<REQUEST_FILES>>>
- path/to/file1.ts
- path/to/file2.ts
<<<END>>>
\\\`\\\`\\\`

### 編集モードへの切替をリクエスト
\\\`\\\`\\\`
<<<SWITCH_MODE: edit>>>
対象ファイル:
- path/to/file.ts
理由: バグ修正のために完全なコードが必要です
<<<END>>>
\\\`\\\`\\\`

---

## 文字数制限への対応

### 出力が長くなる場合

回答が長くなりそうな場合は、以下の方法で分割してください:

1. **続きがある場合は明示**: 回答の最後に以下を追加
   \\\`\\\`\\\`
   <<<CONTINUE>>>
   残り: N個のファイル変更があります
   - path/to/file1.ts
   - path/to/file2.ts
   <<<END>>>
   \\\`\\\`\\\`
`;
/**
 * 分割送信用のヘッダー
 */
function getPartHeader(partNumber, totalParts) {
    return `
---
**📦 分割送信: パート ${partNumber}/${totalParts}**
${partNumber < totalParts ? '（続きがあります。すべて受け取ってから処理してください）' : '（これで最後です。処理を開始してください）'}

---
`;
}
class PromptGenerator {
    constructor(contextManager) {
        this.taskType = 'general';
        this.systemPromptLevel = 'full'; // 新しいプロパティ
        this.contextManager = contextManager;
    }
    /**
     * タスク種別を設定
     */
    setTaskType(type) {
        this.taskType = type;
    }
    /**
     * タスク種別を取得
     */
    getTaskType() {
        return this.taskType;
    }
    /**
     * 利用可能なタスク種別を取得
     */
    getAvailableTaskTypes() {
        return Object.entries(TEMPLATES).map(([id, template]) => ({
            id: id,
            name: template.name,
        }));
    }
    /**
     * システムプロンプトレベルを設定
     */
    setSystemPromptLevel(level) {
        this.systemPromptLevel = level;
    }
    /**
     * システムプロンプトレベルを取得
     */
    getSystemPromptLevel() {
        return this.systemPromptLevel;
    }
    /**
     * プロンプトを生成
     */
    async generate() {
        const template = TEMPLATES[this.taskType];
        const mode = this.contextManager.getMode();
        const instruction = this.contextManager.getInstruction();
        const files = this.contextManager.getFiles();
        let prompt = '';
        // システムプロンプト
        prompt += (this.systemPromptLevel === 'full' ? FULL_SYSTEM_PROMPT : MINIMAL_SYSTEM_PROMPT);
        // 現在のモード表示
        if (mode === 'browse') {
            prompt += `\n# 📖 現在のモード: 閲覧モード\n\n`;
            prompt += `プロジェクトの概要情報を提供します。\n`;
            prompt += `詳細を見たいファイルがあれば教えてください。\n\n`;
        }
        else {
            prompt += `\n# ✏️ 現在のモード: 編集モード\n\n`;
            prompt += `ファイルの完全な内容を提供しています。\n`;
            prompt += `変更がある場合は、上記の回答形式に従って出力してください。\n\n`;
        }
        // タスク説明
        prompt += `## タスク\n${template.taskDescription}\n\n`;
        // ユーザーの追加指示
        if (instruction) {
            prompt += `## ユーザーからの指示\n${instruction}\n\n`;
        }
        // ディレクトリ構造 (閲覧モードの場合)
        if (mode === 'browse') {
            const tree = await this.contextManager.generateDirectoryTree();
            prompt += `## ディレクトリ構造\n\`\`\`\n${tree}\`\`\`\n\n`;
        }
        // ファイル内容
        if (files.length > 0) {
            prompt += `## 提供ファイル (${files.length}件)\n\n`;
            for (const file of files) {
                const content = await this.contextManager.getFileContent(file.path);
                const ext = file.relativePath.split('.').pop() || '';
                prompt += `### ${file.relativePath}\n`;
                prompt += `\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
            }
        }
        return prompt;
    }
    /**
     * 分割されたプロンプトを生成
     */
    async generateSplit(charLimit) {
        const fullPrompt = await this.generate();
        if (fullPrompt.length <= charLimit) {
            return [fullPrompt];
        }
        // システムプロンプトとファイル内容を分離
        const parts = [];
        const systemPromptEnd = fullPrompt.indexOf('## 提供ファイル');
        if (systemPromptEnd === -1) {
            // ファイルがない場合は分割不要
            return [fullPrompt];
        }
        const headerPart = fullPrompt.substring(0, systemPromptEnd);
        const filesPart = fullPrompt.substring(systemPromptEnd);
        // ファイルを個別に分割
        const fileBlocks = this.splitFileBlocks(filesPart);
        let currentPart = headerPart;
        let partIndex = 0;
        const estimatedTotalParts = Math.ceil(fullPrompt.length / charLimit) + 1;
        for (const block of fileBlocks) {
            if (currentPart.length + block.length > charLimit && currentPart !== headerPart) {
                // 現在のパートを保存
                partIndex++;
                parts.push(getPartHeader(partIndex, estimatedTotalParts) + currentPart);
                currentPart = '';
            }
            currentPart += block;
        }
        // 最後のパート
        if (currentPart) {
            partIndex++;
            parts.push(getPartHeader(partIndex, partIndex) + currentPart);
        }
        // パート番号を修正
        return parts.map((part, i) => {
            const total = parts.length;
            return part.replace(/パート \d+\/\d+/, `パート ${i + 1}/${total}`)
                .replace(/これで最後です/, i === total - 1 ? 'これで最後です' : '続きがあります');
        });
    }
    /**
     * ファイルブロックを分割
     */
    splitFileBlocks(filesPart) {
        const blocks = [];
        const lines = filesPart.split('\n');
        let currentBlock = '';
        for (const line of lines) {
            if (line.startsWith('### ') && currentBlock) {
                blocks.push(currentBlock);
                currentBlock = '';
            }
            currentBlock += line + '\n';
        }
        if (currentBlock) {
            blocks.push(currentBlock);
        }
        return blocks;
    }
    /**
     * 文字数制限をチェック
     */
    async checkCharLimit() {
        const config = vscode.workspace.getConfiguration('llmBridge');
        const limit = config.get('inputCharLimit', 4000);
        const prompt = await this.generate();
        const parts = Math.ceil(prompt.length / limit);
        return {
            current: prompt.length,
            limit,
            exceeded: prompt.length > limit,
            parts,
        };
    }
    /**
     * システムプロンプトのみを取得（最初のターン用）
     */
    getSystemPromptOnly() {
        return FULL_SYSTEM_PROMPT; // ここも変更する予定だが、いったんFULL_SYSTEM_PROMPT
    }
}
exports.PromptGenerator = PromptGenerator;
//# sourceMappingURL=PromptGenerator.js.map