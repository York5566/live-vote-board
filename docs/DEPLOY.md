# GitHub Pages + Cloudflare Workers / D1 部署

此專案已於 2026-10-18 完成 GitHub Pages 與 Cloudflare 部署，網址與驗證紀錄見 [PRODUCTION.md](PRODUCTION.md)。以下保留從零部署至其他帳號或網域的操作步驟。不需要 OpenAI Sites 帳號或 hosting.json。

## 1. 本機試用

安裝 Node.js 22 以上，在本資料夾執行：

    npm ci
    npm run dev

開啟 http://127.0.0.1:4173/ 。本機使用 Miniflare 模擬 Workers / D1；本機驗證會略過 Turnstile，正式設定不允許這個開關。第一次使用不要把 dist 預覽輸出直接推上正式網站。

如果 npm 提示安裝腳本尚未允許，可執行 npm install-scripts approve workerd esbuild。較舊 npm 沒有這個命令時，正常安裝即可。

## 2. 建立 Cloudflare D1 與 Worker

以下指令在這份專案根目錄執行。Cloudflare 帳號保持 Workers Free，勿自行改成 Paid。D1 沒有要求使用 R2。

    npx wrangler login
    npx wrangler d1 create vote-board

把 wrangler.example.jsonc 複製為 wrangler.jsonc。將剛產生的 database_id 填入。wrangler.jsonc 已列入 .gitignore。

修改：

- ALLOWED_ORIGINS：例如 https://your-name.github.io 。填來源網域，**不要加儲存庫路徑**。多個來源用逗號分隔；不要使用 *。
- TURNSTILE_HOSTNAMES：例如 your-name.github.io，不要加 https:// 或路徑。自訂網域亦同。
- Worker 名稱可自行修改。
- Rate limit namespace ID 使用此範例專用的三組整數；同帳號若已使用相同 namespace，請換成未使用的數字。

套用資料表：

    npx wrangler d1 migrations apply vote-board --remote

產生長隨機金鑰並放入 Cloudflare Secret。**不要貼到公開 GitHub 或前端設定檔。**

    npx wrangler secret put SESSION_SECRET
    npx wrangler secret put TURNSTILE_SECRET_KEY

SESSION_SECRET 建議至少 48 個隨機字元。TURNSTILE_SECRET_KEY 在下一步取得。透過命令的互動式輸入貼上，不放在命令參數、Git 檔案或聊天訊息。

## 3. 設定 Turnstile

Cloudflare 控制台 → Turnstile → 新增 Widget → Managed：

1. 加入正式網站 hostname，例如 your-name.github.io。
2. 複製公開 Site Key，稍後放進 GitHub repository variable。
3. 將 Secret Key 用上方 wrangler secret put TURNSTILE_SECRET_KEY 保存。
4. 正式環境不可使用官方測試 key；伺服器會驗證 success、action 與 hostname。

部署 Worker：

    npm test
    npm run worker:deploy

保存輸出的 HTTPS Worker 網址，例如 https://your-worker.your-subdomain.workers.dev 。不需要附加 /api。

## 4. 放到 GitHub 並啟用 Pages

建立你的 GitHub 儲存庫，上傳原始碼，包括 .github、content、public、shared、worker、migrations、scripts、tests、package 檔案與 site.config.json。

**不要上傳** node_modules、.wrangler、.dev.vars、.env*、site.local.json、wrangler.jsonc、測試 artifacts 或使用者草稿。預設 .gitignore 已排除。

GitHub Free 的 Pages 使用公開儲存庫；資料庫和設定代碼不在儲存庫中。若原始碼必須保密，請另選支援 private repository Pages 的方案或改用 Cloudflare 託管前端。

儲存庫 Settings → Pages → Source 選 **GitHub Actions**。

Settings → Secrets and variables → Actions → Variables 新增：

| 變數 | 內容 |
|---|---|
| API_BASE | Worker 的 HTTPS 根網址 |
| TURNSTILE_SITE_KEY | Turnstile 的公開 Site Key |
| SITE_URL | 選填；自訂網域時必填，例如 https://votes.example.org/ |

普通 Pages 專案網址會由 Actions 自動取得，含 /repo-name/ 子路徑，不需要手動猜測。

推送到 main 或手動執行 Publish website to GitHub Pages。流程會測試、建置、檢查內部連結，再部署 dist。若正式設定缺少任一必要值，建置會停止，避免把沒有雲端功能的預覽當成正式版本。

只有公開 Site Key 放在前端。Cloudflare 帳號 API Token、SESSION_SECRET、Turnstile Secret 都不應出現在 GitHub variables 或網頁中。

## 5. SEO 與網域

- 正式 SITE_URL 會生成 canonical、Open Graph 網址、sitemap.xml 和 robots.txt。
- 自訂網域會額外產生 CNAME；另依 GitHub Pages 指示設定 DNS 與 HTTPS。
- 首頁、教學、隱私與使用說明為靜態 HTML，可直接被索引。
- 編輯器與投影頁使用 noindex,nofollow；設定代碼不放 URL。
- 向 Google Search Console 驗證正式網域並提交 sitemap.xml。本交付未操作你的 Search Console，收錄及排名也尚未驗證。
- 不要在未填正式網址的預覽版本提交 sitemap。
- GitHub Pages 無法自訂所有 HTTP 安全標頭；本版使用可在靜態 HTML 設定的防護，API 另外回傳安全標頭。

## 6. 正式活動前驗收

1. 使用**不含個資**的測試 Google 表單與票數工作表。
2. 表單送一票 → Google 試算表更新 → 網頁票數正確增加。
3. A、B 組選不同欄位，確認沒有混票。確認排名、總票數、複選比例。
4. 上傳圖片、儲存代碼，在另一台電腦或全新瀏覽器載入。
5. 開投影並將操作頁切至背景，確認投影接手更新；兩個視窗都可見時不重複讀取。
6. 網路中斷時應保留最後票數；恢復後確認能更新。
7. 檢查 Cloudflare 的 Workers requests / CPU、D1 rows read / written 和資料庫容量。
8. 用最大預期圖片數與實際 Sheet 大小驗證 Free Worker CPU 時間；本機測試無法證明正式帳號所有負載均低於 10 ms。

## 官方參考

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Workers 定價](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 定價](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)
- [Turnstile 伺服器驗證](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 1.1 更新順序與投影螢幕

這版在 shared/model.mjs 增加每張候選卡片的外觀與畫布位置，在 shared/sheets.mjs 增加標題列辨識。先執行 npm run worker:deploy，再推送前端 main，避免舊後端丟棄新設定欄位。不需新增 D1 migration，也不需重建資料庫或更換 secrets。舊代碼仍可載入。

投影選擇使用瀏覽器 Window Management API，需使用者允許。無法列出螢幕時，仍可先拖動投影視窗，再進入目前螢幕全螢幕。

- [Chrome Window Management API](https://developer.chrome.com/docs/capabilities/web-apis/window-management)
- [MDN requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
