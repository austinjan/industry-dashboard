# Microsoft Entra ID (Azure AD) 設定與測試指南

## 環境變數

```bash
AZURE_TENANT_ID=c23e4976-33c4-4c55-9500-72e717b53adc
AZURE_CLIENT_ID=807b3275-1fd9-4a76-b6c2-eb83339191a4
AZURE_CLIENT_SECRET=<see .env file or secrets manager>
AZURE_REDIRECT_URL=http://localhost:8080/api/auth/callback  # 本地開發
```

生產環境 Redirect URL: `https://login.powermetal.com.tw/callback`

## Azure Portal 設定

1. 前往 [Azure Portal](https://portal.azure.com) → **App registrations** → 找到已註冊的應用程式
2. **Authentication** → Redirect URIs → 確認已加入：
   - `http://localhost:8080/api/auth/callback`（本地開發）
   - `https://login.powermetal.com.tw/callback`（生產環境）
3. **Certificates & secrets** → 確認 Client Secret 未過期

## 本地測試步驟

### 1. 建立 .env 檔

```bash
cd /path/to/industry-dashboard
cp .env.example .env  # 或手動建立
```

`.env` 內容：
```
AZURE_TENANT_ID=c23e4976-33c4-4c55-9500-72e717b53adc
AZURE_CLIENT_ID=807b3275-1fd9-4a76-b6c2-eb83339191a4
AZURE_CLIENT_SECRET=<your-secret>
AZURE_REDIRECT_URL=http://localhost:8080/api/auth/callback
```

### 2. 啟動 Backend（帶 .env）

```bash
export $(cat .env | xargs) && DEV_MODE=1 make dev
```

### 3. 測試登入流程

1. 開啟 `http://localhost:5173`
2. 點擊 **Sign in with Microsoft**
3. 應跳轉到 Microsoft 登入頁面
4. 輸入公司帳號密碼
5. 成功後應跳轉回 dashboard，顯示使用者名稱

### 4. 驗證項目

- [ ] Microsoft 登入按鈕正常跳轉
- [ ] 登入後 `/api/auth/me` 回傳正確的 user 資訊（id, email, name）
- [ ] JWT cookie 正確設定（access_token, refresh_token）
- [ ] Token 過期後自動 refresh（15 分鐘後）
- [ ] 登出後清除 cookie，跳轉到登入頁
- [ ] 新使用者首次登入自動建立 user record
- [ ] RBAC 權限正確（新使用者預設無權限，需 admin 指派角色）

## 注意事項

- `.env` 已在 `.gitignore` 中，不會被 commit
- Client Secret 有過期日，需定期更新
- DEV_MODE=1 時同時啟用 dev login（`/dev/login`）和 Microsoft login
- 生產環境不要設定 DEV_MODE

## 相關程式碼

| 檔案 | 說明 |
|------|------|
| `internal/config/config.go` | 讀取環境變數 |
| `internal/auth/oidc.go` | OIDC client 設定 |
| `internal/auth/handler.go` | Login, Callback, Me, Refresh, Logout handlers |
| `cmd/server/main.go:76-83` | OIDC client 初始化（AzureClientID 為空時跳過） |
| `frontend/src/pages/LoginPage.tsx` | 登入頁面 UI |
| `frontend/src/lib/auth.tsx` | 前端 auth context |
