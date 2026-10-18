# 架構與免費額度保護

## 資料路徑

GitHub Pages 靜態 HTML/CSS/JavaScript → Cloudflare Worker → Google 公開票數表 / D1。

- Google 表單仍負責收票、限制回應次數與原始資料。本站只讀。
- /api/session 經 Turnstile 驗證，將一或兩組白名單來源封裝為有效 24 小時的 HMAC 簽章連線憑證。
- /api/votes 驗證憑證後取得彙總票數。來源只接受 Google 試算表；重新導向亦限定 Google 主機。
- /api/snapshots/save|load|delete 使用 Turnstile。設定代碼有 120 位元隨機性，資料庫只保存 SHA-256；代碼不放網址、日誌或公開列表。
- 每次儲存產生**新代碼**；代碼是版面快照，不是會自動更新的多人協作帳號。設定變更後需再存新代碼。票數仍可連回原票源更新。
- 圖片在瀏覽器解碼、重繪為 WebP，去除原始檔案 metadata；不接受 SVG/GIF。每張上限 150 KB，整份設定含圖片最多 4 MB。
- 設定 JSON 分成最多約 35 個小資料列，避免 D1 單列 2 MB 與每請求 50 次查詢限制。儲存使用 D1 transaction batch，容量檢查與建立資料在同一交易內。
- 一份快照預設保存 180 天，可由部署者設 7～365 天。到期立即禁止載入，排程每天分批清理。使用者可提早刪除。

## 保護層

1. 僅允許設定的 HTTPS Origin；這不是驗證使用者身分的替代品，因為非瀏覽器可偽造 Origin。
2. Cloudflare 原生 rate limiter：IP 180 次／分、重要操作 8 次／分、每連線 12 次／分。IP 上限保留給活動共用網路；主要輪詢限制依連線。
3. 原生 limiter 的計數在 Cloudflare 各位置分開，不宣稱它是全球精確總額度。
4. Turnstile 由伺服器驗證 action 與 hostname；未設定保護時正式 API fail closed。
5. D1 依來源共用至少 15 秒快取，資料庫原子 lease 避免同時重抓同一份表。上游出錯後鎖定 60 秒，保留最近結果。
6. 同瀏覽器操作／投影頁使用 Web Locks + IndexedDB 共用更新間隔；可見頁接手，隱藏頁停止輪詢。BroadcastChannel 依工作視窗 ID 分隔，避免其他看板混入。
7. 非同步請求不重疊；錯誤採指數退避、遵守 Retry-After；上游 8 秒、前端 30 秒逾時。
8. Google 回應最多 1 MB / 10,000 列 / 100 個不同答案；每組看板最多 20 個作品。
9. D1 全站每日保守預留讀寫成本：預設讀 1,000,000、寫 40,000、建立連線與新快照合計 150 次。高用量會先停止新工作；不是宣稱按此數字精確推算 Cloudflare 帳單。
10. 影像與設定內容總量預設限制 180 MiB，保留 D1 單庫 500 MB 的索引與 SQLite 開銷。D1 免費 5 GB 是**帳號總量**，不是單一資料庫容量。
11. 預設不啟用 Workers Observability，避免敏感 payload / 來源進入應用日誌。不得新增記錄代碼或憑證的 debug logging。

## 保護範圍的實際限制

Workers Free 目前每天 100,000 requests，單次 CPU 10 ms；D1 Free 每天讀 500 萬列、寫 10 萬列。這些額度與同帳號其他服務共用。

應用程式內拒絕的 429 / 403 請求，仍然可能消耗 Worker request 額度。分散式大量攻擊無法只靠程式碼保證永遠不耗盡免費額度；Cloudflare 的平台 DDoS 防護與帳號監控仍有必要。保持 Free 計畫可避免自行切換付費後產生用量費用，但超額可能造成當日服務無法使用。

若規模增加，先觀察實際 metrics、延長更新間隔、限制公開觀看規模。大量公開觀眾的即時推播、付費服務或無限保存不在此第一版設計範圍。資料集變大時，改接彙總票數表，避免每次掃描原始回應。

## 驗證層級

- Node tests：資料模型、CSV、URL 防護與實際 Miniflare / D1 的 API 契約。
- 真實瀏覽器：本機測試票源下的編輯、圖片、代碼、跨瀏覽器、投影與手機排版。
- Google 公開服務、Cloudflare 正式帳號 CPU、Turnstile 真實 challenge、GitHub 實際部署與 Search Console 必須在正式帳號／網域就緒後另外驗證。測試使用的固定票數不是使用者真實投票。
