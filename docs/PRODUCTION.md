# 正式部署紀錄

## 1.1.0 已上線（2026-10-19）

前端與 Cloudflare 後端已完成更新，使用原來的網站網址。

- 功能原始碼 commit：159da30e1b0b9cb9ea6b91fc50dc407c2896645f。
- [GitHub Pages 成功發布流程](https://github.com/York5566/live-vote-board/actions/runs/39191928672)。
- Worker version：abbe334f-4aa6-47b0-b10d-9637b88eb33b。
- 保留原 D1、Turnstile、流量保護綁定及 secrets，沒有資料表 migration。先更新 Worker，再發布前端，舊代碼仍可載入。

本次在正式 HTTPS 網站完成 8 項驗證：發布 commit 成功；新版 JavaScript／CSS／共用模組與本機驗收版本一致；正式設定、SEO、教學正確；Worker 健康與 CORS 正常、未簽章請求及無效驗證被拒；編輯器載入新示範票源與單組版面；畫布改字與復原可操作；投影接收設定且全螢幕完全隱藏控制列；沒有瀏覽器執行例外。使用 Microsoft Edge 無頭模式及隔離資料，不讀取使用者目前的草稿。

本機另通過 50 個資料／後端測試、14 個既有瀏覽器流程、15 個新編輯器流程與 6 個發布檢查。指定 Google 試算表已透過本機 Worker 真實讀取，兩組各 30 票；正式站此輪未完成真人 Turnstile 成功挑戰及雲端代碼保存／載入，不能把本機結果當成該項正式環境驗收。實體第二螢幕、Google 表單送票與大量活動負載仍未實測。

證據保存在本機忽略版本控制的 artifacts/production-v1.1-report.json、production-v1.1-editor.png；本機詳細範圍見 [VALIDATION.md](VALIDATION.md)。既有草稿與個人預設會保留原票源，新的示範來源只套用到預設的新看板。

## 1.0.0 首次正式部署（歷史記錄）

部署日期：2026-10-18（台灣時間）。

## 網址與資源

| 項目 | 位置 |
|---|---|
| 網站首頁 | https://york5566.github.io/live-vote-board/ |
| 編輯器 | https://york5566.github.io/live-vote-board/studio/ |
| 串接教學 | https://york5566.github.io/live-vote-board/guide/ |
| GitHub 原始碼 | https://github.com/York5566/live-vote-board |
| 成功的首次發布流程 | https://github.com/York5566/live-vote-board/actions/runs/39120715705 |
| Cloudflare Worker | live-vote-api |
| API 根網址 | https://live-vote-api.wwwne1198.workers.dev |
| Cloudflare D1 | live-vote-board |
| Turnstile 元件 | Live Vote Board - GitHub Pages |

GitHub 儲存庫為公開；私密設定代碼、使用者圖片和雲端資料庫內容不在儲存庫中。網站使用獨立 D1 資料庫及 Turnstile 元件，未變動帳號內其他專案的資源。

## 已完成的設定

- GitHub Pages 使用 GitHub Actions 發布，預設分支為 main。
- GitHub repository variables 已設定 SITE_URL、API_BASE、TURNSTILE_SITE_KEY；三者均為可公開的前端設定。
- SESSION_SECRET 與 TURNSTILE_SECRET_KEY 已存入 Worker secrets，沒有放入公開原始碼、命令參數或前端。
- 本機 wrangler.jsonc 已填入正式帳號、D1、允許的來源及三組獨立 rate-limit namespace；此檔仍受 .gitignore 排除。
- API 只允許 https://york5566.github.io 來源。Turnstile 只允許 york5566.github.io。
- D1 初始 migration 已成功套用，保留每日清理排程。
- 正式前端的 localDevelopment 為 false，沒有啟用本機略過驗證。
- canonical、sitemap、robots 和 Open Graph 使用正式網站網址；編輯器與投影頁不索引。

## 上線驗證

本機 44 個 Node / Miniflare 測試通過；GitHub Actions 在 Node 22 / Linux 上的安裝、測試、建置、靜態檢查和 Pages 發布均成功。

正式環境另通過 8 組 HTTP / API 檢查：

1. 首頁 HTTPS 200、靜態介紹和正式 canonical。
2. 教學、隱私、使用說明頁 HTTPS 200。
3. 編輯器與投影頁 HTTPS 200，含 noindex。
4. 正式設定正確指向 Worker 與 Turnstile，停用開發模式。
5. CSS、JavaScript、共用模組與分享圖可正常取得。
6. sitemap 與 robots 正確，排除編輯器與投影頁。
7. Worker 健康檢查與 CORS 預檢允許網站來源。
8. 未授權來源、未簽章連線和無效 Turnstile token 均被拒絕。

也已透過 Cloudflare API 確認 D1 資料表、Worker D1 綁定、三個限流器及兩個 secrets 的名稱存在，未輸出 secret 值。完整機器檢查結果保存在本機忽略版本控制的 artifacts/production-report.json。

## 驗證限制

- 此次部署工作所在的側邊對話無法建立瀏覽器分頁，正式站目前完成的是 HTTP / API 驗證；沒有將它宣稱為瀏覽器互動驗收。
- 真人成功通過 Turnstile、儲存並跨裝置載入代碼、實際 Google 表單送票與投影機展示，仍需在正式網站操作確認。原本的本機瀏覽器驗收不等於正式服務驗收。
- 未變更或新增帳號訂閱、付款方案，也未開通 R2。部署憑證沒有 Billing Read 權限，因此無法確認既有 Cloudflare 帳號目前的訂閱方案；請在 Cloudflare 控制台確認 Workers Free。沒有把 default_usage_model 的 standard 當作免費方案的證據。
- 真實活動的 CPU、D1 讀寫及大量同時使用仍需觀察；網站已設應用層保護門檻，但不能保證分散式攻擊不耗盡免費額度。
- 尚未操作 Search Console 或驗證搜尋收錄，尚未綁定自訂網域。

## 後續更新

前端原始碼修改、測試通過後，commit 並 push 到 main 即會觸發 GitHub Pages 發布。部署變數仍由 GitHub repository variables 提供，不需要把私密設定加入原始碼。

Worker 修改後，在已設定的本機專案內執行：

    npm test
    npm run worker:deploy

只有新增資料表 migration 時，才需要執行：

    npx wrangler d1 migrations apply live-vote-board --remote

不需要重建資料庫、重建 Turnstile 或輪替既有 secrets。換電腦後請依部署指南重新準備忽略版本控制的 wrangler.jsonc，並登入原 Cloudflare 帳號。

線上版與本機版各有自己的資料儲存；已在 localhost 編輯的草稿不會因網站發布自動搬到 GitHub 網址。
