# LLM Copilot Bridge - 開発経過メモ

## 最終更新日時: 2026年2月9日 (月)

このドキュメントは、LLM Copilot Bridge VS Code拡張機能の開発経緯と主要な変更点を記録します。

---

## 1. プロジェクトの初期状態と目的

本プロジェクトは、LLM (Large Language Model) を活用したコーディングアシスタントのVS Code拡張機能です。`PLAN_PROMPT.md`に記載されたプロンプト設計に基づき、LLMとの対話形式、出力フォーマット、モード切替などの仕様に沿って、拡張機能の主要機能を実装することが目的です。

初期のファイル構成:
- `src/extension.ts`: 拡張機能のエントリポイント
- `src/context/ContextManager.ts`: LLMに提供するファイルコンテキストとモードの管理
- `src/prompt/PromptGenerator.ts`: LLMへのプロンプト生成
- `src/parsers/ResponseParser.ts`: LLMからの応答解析とコード変更適用
- `src/providers/SidebarProvider.ts`: サイドバーUIの提供（初期段階）

## 2. `PLAN_PROMPT.md`に基づく主要機能の実装

### 2.1. `ResponseParser.ts`の機能拡張

LLMからの応答を正確に解釈し、VS Code上でアクションを実行するために、`src/parsers/ResponseParser.ts`に以下の機能が追加されました。

*   **Diff形式 (`<<<DIFF: ...>>>`) の解析と適用**: LLMが提供するUnified Diff形式のコード変更を解析し、既存のファイル内容に適用して新しいファイル内容を生成するロジックを実装しました。これにより、ファイルの一部を効率的に変更できるようになりました。
*   **各種リクエストの解析**:
    *   **ファイルリクエスト (`<<<REQUEST_FILE: ...>>>`, `<<<REQUEST_FILES>>>`)**: LLMがコンテキストへのファイル追加を要求するパターンを解析。
    *   **モード切り替えリクエスト (`<<<SWITCH_MODE: edit>>>`)**: LLMが閲覧モードと編集モードの切り替えを要求するパターンを解析。
    *   **続きの要求 (`<<<CONTINUE>>>`)**: LLMが長文応答の続きを要求するパターンを解析。
*   **`ParseResult`インターフェースの拡張**: 上記リクエスト情報を保持できるよう、`ParseResult`インターフェースを拡張しました。
*   **ロバスト性の向上**: `applyUnifiedDiff`メソッドにおいて、`originalLines`の範囲チェック、Diffコンテキストの不一致チェックなど、適用ロジックの堅牢性を高めました。
*   **デバッグログの強化**: `parse`メソッド内に詳細なデバッグログを追加し、LLM応答の解析結果を明確に追跡できるようにしました。

### 2.2. `extension.ts`のオーケストレーション強化

拡張機能のエントリポイントである`src/extension.ts`は、`ResponseParser`からの解析結果に基づき、適切なアクションを実行するように強化されました。

*   **LLMリクエストの処理フロー**:
    *   `llmBridge.applyResponse`コマンドにおいて、`ResponseParser.parseAndApply`の結果を詳細にチェック。
    *   `requestedFiles`があれば`ContextManager.addPath()`でファイルを追加し、新しいプロンプトを生成してクリップボードにコピーします。
    *   `switchModeTo`があれば`ContextManager.setMode()`でモードを切り替え、新しいプロンプトを生成してクリップボードにコピーします。
    *   `continueRequested`があれば、LLMが応答の続きを要求していることをユーザーに通知します。
    *   これらのリクエストは、ファイル変更の適用よりも優先して処理されます。
*   **ユーザーへのフィードバック強化**:
    *   LLMがファイルリクエストを行った際に、現在のモードが閲覧モードであれば、全文が必要な場合は`<<<SWITCH_MODE: edit>>>`もリクエストするように促すメッセージを表示します。これはLLMの適切な利用を促すためのヒントです。
*   **エラーハンドリングとログ機能の統合**:
    *   `vscode.OutputChannel` (`LLM Bridge Log`) を作成し、主要なコマンドの実行状況、解析結果、エラーなどを詳細にログ出力するようにしました。
    *   同時に、デバッグコンソール (`console.log`) にも同じ内容を出力することで、デバッグ時の可視性を高めました。

### 2.3. `ContextManager.ts`の機能拡張

LLMへのファイルコンテキスト提供の信頼性を高めるため、`src/context/ContextManager.ts`に以下の改善を加えました。

*   **エラーハンドリングの追加**: `addPath`メソッドにエラーハンドリングを追加し、ファイルが見つからないなどの問題が発生した場合にユーザーに明確なエラーメッセージを表示するようにしました。

## 3. 現在の拡張機能の状態

*   `PLAN_PROMPT.md`に記載されたLLM Copilot Bridgeの主要なプロンプト設計関連機能は実装が完了しています。
*   `npm install`と`npm run compile`コマンドにより、プロジェクトはビルド可能です。
*   拡張機能はVS Code上でアクティベートされ、コマンドを通じて利用可能です。
*   Output Channel (`LLM Bridge Log`) およびデバッグコンソールを通じて、詳細な動作ログを確認できます。

## 4. 今後の提案 (TODO)

*   **UI (`SidebarProvider.ts`) の機能強化**: 現在は基本的なサイドバーですが、コンテキストファイルの表示、モード切り替え、タスク種別選択などのUI要素を実装することで、ユーザー体験が向上します。
*   **LLM応答の続きの生成**: LLMが`<<<CONTINUE>>>`を出力した場合に、ユーザーがボタンをクリックするなどの操作で、続きのプロンプトを自動的に生成してクリップボードにコピーする機能。
*   **LLM APIとの直接連携**: 現在はクリップボードを介していますが、VS CodeのAPIを活用してLLMと直接通信する機能の実装。

---
