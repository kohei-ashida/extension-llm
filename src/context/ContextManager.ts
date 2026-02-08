import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ContextFile {
    path: string;
    relativePath: string;
    content?: string;
    summary?: string;
}

export type ContextMode = 'browse' | 'edit';

export class ContextManager {
    private files: Map<string, ContextFile> = new Map();
    private mode: ContextMode = 'browse';
    private userInstruction: string = '';

    /**
     * ファイルまたはディレクトリをコンテキストに追加
     * ディレクトリの場合は再帰的にファイルを追加
     */
    async addPath(filePath: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('ワークスペースが開かれていません');
            }

            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(workspaceFolder.uri.fsPath, filePath);

            const stat = await fs.promises.stat(absolutePath);

            if (stat.isDirectory()) {
                // ディレクトリの場合は中のファイルを再帰的に追加
                await this.addDirectory(absolutePath);
            } else {
                // ファイルの場合は直接追加
                this.addSingleFile(absolutePath);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`ファイルの追加に失敗: ${filePath}. エラー: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`Error adding path ${filePath}:`, error);
        }
    }

    /**
     * 単一ファイルをコンテキストに追加
     */
    private addSingleFile(filePath: string): void {
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
    private async addDirectory(dirPath: string, maxDepth: number = 3, currentDepth: number = 0): Promise<void> {
        if (currentDepth >= maxDepth) {
            return;
        }

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const filtered = entries.filter(e =>
            !e.name.startsWith('.') &&
            e.name !== 'node_modules' &&
            e.name !== '__pycache__' &&
            e.name !== 'out' &&
            e.name !== 'dist' &&
            e.name !== '.git'
        );

        for (const entry of filtered) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                await this.addDirectory(fullPath, maxDepth, currentDepth + 1);
            } else {
                this.addSingleFile(fullPath);
            }
        }
    }

    /**
     * 後方互換性のためのエイリアス
     * @deprecated addPath を使用してください
     */
    addFile(filePath: string): void {
        // 同期的に呼ばれる可能性があるため、非同期処理は行わず単一ファイルとして追加
        this.addSingleFile(filePath);
    }

    /**
     * ファイルをコンテキストから削除
     */
    removeFile(filePath: string): void {
        this.files.delete(filePath);
    }

    /**
     * コンテキストをクリア
     */
    clear(): void {
        this.files.clear();
        this.userInstruction = '';
    }

    /**
     * 全ファイルを取得
     */
    getFiles(): ContextFile[] {
        return Array.from(this.files.values());
    }

    /**
     * モードを設定
     */
    setMode(mode: ContextMode): void {
        this.mode = mode;
    }

    /**
     * モードを取得
     */
    getMode(): ContextMode {
        return this.mode;
    }

    /**
     * ユーザー指示を設定
     */
    setInstruction(instruction: string): void {
        this.userInstruction = instruction;
    }

    /**
     * ユーザー指示を取得
     */
    getInstruction(): string {
        return this.userInstruction;
    }

    /**
     * ファイル内容を取得 (モードに応じて圧縮)
     */
    async getFileContent(filePath: string): Promise<string> {
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
    private summarizeContent(content: string, filePath: string): string {
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
    private extractTypeScriptSignatures(lines: string[]): string {
        const result: string[] = [];
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
    private extractPythonSignatures(lines: string[]): string {
        const result: string[] = [];
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
    async generateDirectoryTree(rootPath?: string): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder && !rootPath) {
            return '(ワークスペースが開かれていません)';
        }

        const root = rootPath || workspaceFolder!.uri.fsPath;
        return this.buildTree(root, '', 0, 3);
    }

    /**
     * ツリー構造を構築
     */
    private async buildTree(
        dirPath: string,
        prefix: string,
        depth: number,
        maxDepth: number
    ): Promise<string> {
        if (depth >= maxDepth) {
            return prefix + '└── ...\n';
        }

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const filtered = entries.filter(e =>
            !e.name.startsWith('.') &&
            e.name !== 'node_modules' &&
            e.name !== '__pycache__' &&
            e.name !== 'out' &&
            e.name !== 'dist'
        );

        let result = '';
        for (let i = 0; i < filtered.length; i++) {
            const entry = filtered[i];
            const isLast = i === filtered.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');

            if (entry.isDirectory()) {
                result += prefix + connector + entry.name + '/\n';
                result += await this.buildTree(
                    path.join(dirPath, entry.name),
                    newPrefix,
                    depth + 1,
                    maxDepth
                );
            } else {
                result += prefix + connector + entry.name + '\n';
            }
        }

        return result;
    }

    /**
     * 文字数を計算
     */
    async calculateCharCount(): Promise<number> {
        let total = 0;

        for (const file of this.files.values()) {
            const content = await this.getFileContent(file.path);
            total += content.length;
        }

        total += this.userInstruction.length;
        return total;
    }
}
