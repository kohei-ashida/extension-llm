const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const filePath = path.join(projectRoot, 'src', 'prompt', 'PromptGenerator.ts');

let content = fs.readFileSync(filePath, 'utf-8');

const oldCode = String.raw`#### 差分更新 (一部のみ変更する場合)
```
<<<DIFF: path/to/file.ts>>>
@@ -10,5 +10,7 @@
 // 変更前の行 (コンテキスト)
-削除される行
+追加される行
 // 変更後の行 (コンテキスト)
<<<END>>>
```
`;

const newCode = String.raw`#### 差分更新 (一部のみ変更する場合)
```
<<<DIFF: path/to/file.ts>>>
// Unified Diff形式で変更を記述してください。
// 「@@ -start_line,num_lines +start_line,num_lines @@」ヘッダーが必須です。
//   - `start_line`: 変更が始まる行番号（1から開始）
//   - `num_lines`: 変更される行数
// ` ` (スペース) で始まる行は変更されないコンテキスト行です。
// `-` で始まる行は削除される行です。
// `+` で始まる行は追加される行です。
// 例: ファイルの10行目から5行を削除し、そこに7行を追加する場合
@@ -10,5 +10,7 @@
 // この行は変更されないコンテキスト行 (例: 削除されるコードの前の行)
-const oldFunction = () => {
-  console.log('Old logic');
-  // More old code
-};
-// End of old function
+const newFunction = () => {
+  console.log('New logic applied');
+  // Updated code
+};
+// End of new function
+// Another new line
// この行も変更されないコンテキスト行 (例: 削除されるコードの後の行)
<<<END>>>
```
`;

const updatedContent = content.replace(oldCode, newCode);

if (content === updatedContent) {
    console.error('Error: SYSTEM_PROMPT Diff section not found or no change applied.');
    process.exit(1);
}

fs.writeFileSync(filePath, updatedContent, 'utf-8');
console.log('Successfully updated SYSTEM_PROMPT in ' + filePath);
