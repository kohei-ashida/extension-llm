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
exports.ContextManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ContextManager {
    constructor() {
        this.files = new Map();
        this.mode = 'browse';
        this.userInstruction = '';
    }
    /**
     * ファイルまたはディレクトリをコンテキストに追加
     * ディレクトリの場合は再帰的にファイルを追加
     */
    async addPath(filePath) {
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
            // ディレクトリの場合は中のファイルを再帰的に追加
            await this.addDirectory(filePath);
        }
        else {
            // ファイルの場合は直接追加
            this.addSingleFile(filePath);
        }
    }
    /**
     * 単一ファイルをコンテキストに追加
     */
    addSingleFile(filePath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder
            ? path.relative(workspaceFolder.uri.fsPath, filePath)
            : path.basename(filePath);
        this.files.set(filePath, {
            path: filePath,
            relativePath,
        });
    }
    /**
     * ディレクトリ内のファイルを再帰的に追加
     */
    async addDirectory(dirPath, maxDepth = 3, currentDepth = 0) {
        if (currentDepth >= maxDepth) {
            return;
        }
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const filtered = entries.filter(e => !e.name.startsWith('.') &&
            e.name !== 'node_modules' &&
            e.name !== '__pycache__' &&
            e.name !== 'out' &&
            e.name !== 'dist' &&
            e.name !== '.git');
        for (const entry of filtered) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                await this.addDirectory(fullPath, maxDepth, currentDepth + 1);
            }
            else {
                this.addSingleFile(fullPath);
            }
        }
    }
    /**
     * 後方互換性のためのエイリアス
     * @deprecated addPath を使用してください
     */
    addFile(filePath) {
        // 同期的に呼ばれる可能性があるため、非同期処理は行わず単一ファイルとして追加
        this.addSingleFile(filePath);
    }
    /**
     * ファイルをコンテキストから削除
     */
    removeFile(filePath) {
        this.files.delete(filePath);
    }
    /**
     * コンテキストをクリア
     */
    clear() {
        this.files.clear();
        this.userInstruction = '';
    }
    /**
     * 全ファイルを取得
     */
    getFiles() {
        return Array.from(this.files.values());
    }
    /**
     * モードを設定
     */
    setMode(mode) {
        this.mode = mode;
    }
    /**
     * モードを取得
     */
    getMode() {
        return this.mode;
    }
    /**
     * ユーザー指示を設定
     */
    setInstruction(instruction) {
        this.userInstruction = instruction;
    }
    /**
     * ユーザー指示を取得
     */
    getInstruction() {
        return this.userInstruction;
    }
    /**
     * ファイル内容を取得 (モードに応じて圧縮)
     */
    async getFileContent(filePath) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        if (this.mode === 'edit') {
            // 編集モード: 完全な内容を返す
            return content;
        }
        // 閲覧モード: 要約を返す
        return this.summarizeContent(content, filePath);
    }
    /**
     * コンテンツを要約 (閲覧モード用)
     */
    summarizeContent(content, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const lines = content.split('\n');
        // TypeScript/JavaScript: 関数シグネチャとクラス定義のみ抽出
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            return this.extractTypeScriptSignatures(lines);
        }
        // Python: 関数定義とクラス定義のみ抽出
        if (ext === '.py') {
            return this.extractPythonSignatures(lines);
        }
        // その他: 最初の100行のみ
        return lines.slice(0, 100).join('\n') +
            (lines.length > 100 ? '\n// ... (省略)' : '');
    }
    /**
     * TypeScript/JSからシグネチャを抽出
     */
    extractTypeScriptSignatures(lines) {
        const result = [];
        const signaturePatterns = [
            /^import\s+/,
            /^export\s+(interface|type|class|function|const|enum)/,
            /^(interface|type|class|function|const|enum)\s+/,
            /^\s*(public|private|protected)?\s*(async\s+)?(static\s+)?\w+\s*\(/,
        ];
        let inMultiLineImport = false;
        for (const line of lines) {
            // マルチラインimportの処理
            if (inMultiLineImport) {
                result.push(line);
                if (line.includes(';') || line.includes("from '") || line.includes('from "')) {
                    inMultiLineImport = false;
                }
                continue;
            }
            if (line.trim().startsWith('import ') && !line.includes(';')) {
                inMultiLineImport = true;
                result.push(line);
                continue;
            }
            // パターンにマッチする行を抽出
            if (signaturePatterns.some(p => p.test(line))) {
                result.push(line);
            }
        }
        return result.join('\n') || '// (シグネチャなし)';
    }
    /**
     * Pythonからシグネチャを抽出
     */
    extractPythonSignatures(lines) {
        const result = [];
        const signaturePatterns = [
            /^import\s+/,
            /^from\s+/,
            /^class\s+/,
            /^def\s+/,
            /^\s+def\s+/,
        ];
        for (const line of lines) {
            if (signaturePatterns.some(p => p.test(line))) {
                result.push(line);
            }
        }
        return result.join('\n') || '# (シグネチャなし)';
    }
    /**
     * ディレクトリツリーを生成
     */
    async generateDirectoryTree(rootPath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder && !rootPath) {
            return '(ワークスペースが開かれていません)';
        }
        const root = rootPath || workspaceFolder.uri.fsPath;
        return this.buildTree(root, '', 0, 3);
    }
    /**
     * ツリー構造を構築
     */
    async buildTree(dirPath, prefix, depth, maxDepth) {
        if (depth >= maxDepth) {
            return prefix + '└── ...\n';
        }
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const filtered = entries.filter(e => !e.name.startsWith('.') &&
            e.name !== 'node_modules' &&
            e.name !== '__pycache__' &&
            e.name !== 'out' &&
            e.name !== 'dist');
        let result = '';
        for (let i = 0; i < filtered.length; i++) {
            const entry = filtered[i];
            const isLast = i === filtered.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            if (entry.isDirectory()) {
                result += prefix + connector + entry.name + '/\n';
                result += await this.buildTree(path.join(dirPath, entry.name), newPrefix, depth + 1, maxDepth);
            }
            else {
                result += prefix + connector + entry.name + '\n';
            }
        }
        return result;
    }
    /**
     * 文字数を計算
     */
    async calculateCharCount() {
        let total = 0;
        for (const file of this.files.values()) {
            const content = await this.getFileContent(file.path);
            total += content.length;
        }
        total += this.userInstruction.length;
        return total;
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=ContextManager.js.map