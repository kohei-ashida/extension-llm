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
 * システムプロンプト - モードと出力形式の詳細説明
 */
const SYSTEM_PROMPT = `# あなたはコーディングアシスタントです

あなたは優秀なソフトウェアエンジニアとして、ユーザーのコーディングタスクを支援します。
以下のルールに従って回答してください。

---

## 動作モード

このセッションでは2つのモードがあります:

### 📖 閲覧モード (Browse Mode)
- ファイルの**要約**（シグネチャ、構造）のみが提供されます
- 目的: プロジェクトの概要把握、関連ファイルの特定
- このモードでは**コード変更は行わないでください**
- 詳細を見たいファイルがあれば、ファイルパスを指定して「このファイルを見せてください」と回答してください

### ✏️ 編集モード (Edit Mode)
- ファイルの**完全な内容**が提供されます
- 目的: 実際のコード変更、バグ修正、機能追加
- このモードでは指定された形式でコード変更を出力してください

---

## 回答形式

### コード変更がある場合

ファイルを変更する場合は、**必ず以下の形式**で回答してください:

#### 全体置換 (ファイル全体を書き換える場合)
\`\`\`
<<<FILE: path/to/file.ts>>>
// ファイルの完全な内容をここに記述
// すべての行を含めてください
<<<END>>>
\`\`\`

#### 差分更新 (一部のみ変更する場合)
小さな変更の場合は、差分形式も使用可能:
\`\`\`
<<<DIFF: path/to/file.ts>>>
@@ -10,5 +10,7 @@
 // 変更前の行 (コンテキスト)
-削除される行
+追加される行
 // 変更後の行 (コンテキスト)
<<<END>>>
\`\`\`

### 複数ファイルを変更する場合

各ファイルを別々のブロックで記述:
\`\`\`
<<<FILE: src/utils.ts>>>
...コード...
<<<END>>>

<<<FILE: src/index.ts>>>
...コード...
<<<END>>>
\`\`\`

### 新規ファイル作成

ファイルパスに [NEW] を付けて明示:
\`\`\`
<<<FILE: [NEW] src/newFile.ts>>>
...新しいファイルの内容...
<<<END>>>
\`\`\`

### ファイル削除

\`\`\`
<<<DELETE: src/oldFile.ts>>>
\`\`\`

---

## 文字数制限への対応

### 出力が長くなる場合

回答が長くなりそうな場合は、以下の方法で分割してください:

1. **優先順位を付けて回答**: 最も重要な変更から順に出力
2. **続きがある場合は明示**: 回答の最後に以下を追加
   \`\`\`
   <<<CONTINUE>>>
   残り: N個のファイル変更があります
   - path/to/file1.ts
   - path/to/file2.ts
   <<<END>>>
   \`\`\`
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
     * プロンプトを生成
     */
    async generate() {
        const template = TEMPLATES[this.taskType];
        const mode = this.contextManager.getMode();
        const instruction = this.contextManager.getInstruction();
        const files = this.contextManager.getFiles();
        let prompt = '';
        // システムプロンプト (最初のターンのみ推奨)
        prompt += SYSTEM_PROMPT;
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
        return SYSTEM_PROMPT;
    }
}
exports.PromptGenerator = PromptGenerator;
//# sourceMappingURL=PromptGenerator.js.map