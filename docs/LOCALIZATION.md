# 多語系準備

工作名稱為 **Live Vote Board**，沒有把中文諧音綁進產品名稱。這不是商標或網域可用性的聲明；正式名稱尚待決定。

本版正式提供 zh-Hant：

- 網站名稱集中在 site.config.json。
- 行銷頁、教學、隱私與使用說明原始內容位於 content/zh-Hant/。
- 編輯器共用文案與標籤在 public/assets/locales/zh-Hant.mjs；剩餘功能專用標籤與伺服器錯誤訊息仍需於新增語言時抽成對應字典。
- 使用者自訂作品、組名和標題保持原文，不自動翻譯。
- 未發布其他語言前，不生成假的 hreflang、未翻譯語言選單或空白語系頁面。

下一個語言的實作流程：

1. 決定預設語言 URL。建議保留目前首頁，新增 /en/、/ja/ 等實際翻譯頁。
2. 翻譯完整頁面與 UI 字典，將剩餘按鈕、提示及 API 錯誤改為穩定錯誤碼對應字串。
3. 對應各語系的 lang、title、description、Open Graph locale、日期／數字格式。
4. 加入各自 canonical、雙向 hreflang 和 x-default；只有實際完成的頁面才進 sitemap。
5. 驗證長字串、各語系字型與手機排版。不以機器生成的大量近似頁面堆疊 SEO。
