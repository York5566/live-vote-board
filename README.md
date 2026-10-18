# Live Vote Board

免費 Google 表單即時投票看板的獨立網頁版。前端可部署至 GitHub Pages；後端使用 Cloudflare Workers + D1 Free，無需 R2。現有單組與雙組 Windows 程式未修改。

## 功能

- 單組，或雙組上下排列。沒有左右排列與投票結算功能。
- Google 試算表彙總票數，或直接統計表單回應欄位；A / B 票源獨立。
- 自訂圖片、Logo、背景圖與遮罩；文字、票數、總票數、進度條、排名、卡片底色等可調。
- 小數調整、數字範圍內才生效的滾輪、可拖動且固定在右側的即時預覽。
- 雲端設定代碼包含圖片，每次儲存產生新快照；其他電腦可載入。另有本機預設。
- 投影與操作頁共用更新節奏，可見的視窗接手自動更新。
- 靜態介紹、教學、隱私與使用說明；canonical、OG 圖、sitemap、robots 與 noindex 配置。
- 多層流量、來源、容量與請求保護。

## 開發

    npm ci
    npm run dev

開啟 http://127.0.0.1:4173/ 。本機資料保存於忽略版本控制的 .wrangler/local-d1。

    npm test
    npm run build
    npm run check

瀏覽器測試需安裝 Playwright Chromium 或電腦上已有 Microsoft Edge：

    npx playwright install chromium
    npm run test:browser
    npm run test:release

測試流程會自行啟動專用本機伺服器與固定資料，不需要也不會修改真實 Google 試算表。

## 交付壓縮檔

delivery/LiveVoteBoard-1.0.0.zip 包含原始碼、部署範本、可預覽的 dist 靜態網站、驗收截圖及 SHA-256 檔案清單。解壓縮後的專案位於 LiveVoteBoard 資料夾。

靜態網站請透過 HTTP 伺服器開啟，不能直接雙擊 index.html。交付的 dist 不含正式 API 連線，正式部署必須依下方指南重新建置。

重新封裝：

    npm run test:browser
    npm run test:release
    npm run package

壓縮檔不包含 node_modules、帳號憑證或本機資料庫；首次啟動仍需 npm ci。

## 部署與文件

- [部署步驟](docs/DEPLOY.md)
- [架構、容量與流量保護](docs/ARCHITECTURE.md)
- [多語系準備](docs/LOCALIZATION.md)
- [測試與交付記錄](docs/VALIDATION.md)

網站名稱、GitHub 儲存庫與網域尚未決定。交付內容不代表網站已上線，也不代表已完成 Google 搜尋收錄。請依部署指南填入正式 Cloudflare、Turnstile 與 Pages 設定。
