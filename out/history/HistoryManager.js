"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryManager = void 0;
class HistoryManager {
    constructor() {
        this.history = [];
        this.maxEntries = 20; // 保持する履歴の最大数
    }
    addEntry(entry) {
        this.history.unshift(entry); // 新しいものを先頭に追加
        if (this.history.length > this.maxEntries) {
            this.history.pop(); // 古いものを削除
        }
    }
    getHistory() {
        return this.history;
    }
    clearHistory() {
        this.history = [];
    }
}
exports.HistoryManager = HistoryManager;
//# sourceMappingURL=HistoryManager.js.map