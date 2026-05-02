package com.readympos.model;

// 離線同步狀態，對應前端 IndexedDB 的 syncStatus 欄位
public enum SyncStatus {
    PENDING,   // 前端本地建立，尚未同步到後端
    SYNCED,    // 後端已接收並儲存，視為同步完成
    CONFLICT   // 前後端資料衝突，需人工確認後解決
}
