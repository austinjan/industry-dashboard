[English](deploy.md) | [繁體中文](deploy-tw.md)

# 部署指南

## 快速開始

從 [GitHub Releases](https://github.com/austinjan/industry-dashboard/releases) 下載：
- `dashboard-server-<平台>` （選擇對應的 OS/架構）
- `docker-compose.production.yml`
- `default.env.example`

```bash
# 1. 設定環境變數
cp default.env.example .env
# 編輯 .env — 設定 DB_PASSWORD 和 JWT_SECRET（必填）

# 2. 啟動資料庫
docker compose -f docker-compose.production.yml up -d db

# 3. 等待資料庫就緒（約 5 秒）
docker compose -f docker-compose.production.yml logs db | tail -3

# 4. 啟動伺服器（自動執行資料庫遷移）
source .env
DATABASE_URL="postgres://${DB_USER:-dashboard}:${DB_PASSWORD}@localhost:${DB_PORT:-5432}/${DB_NAME:-industry_dashboard}?sslmode=disable" \
JWT_SECRET="${JWT_SECRET}" \
PORT="${PORT:-8080}" \
./dashboard-server-linux-amd64
```

打開 `http://localhost:8080` — 完成。

---

## 前置需求

- 一台伺服器（Linux、macOS 或 Windows）
- Docker（用於 TimescaleDB）或已安裝 TimescaleDB 擴充的 PostgreSQL
- Release 執行檔（參見[發行指南](release.md)）

## 方式一：Docker Compose（推薦）

最簡單的方式。內含 TimescaleDB，不需要額外安裝資料庫。

### 步驟 1：準備檔案

從 release 中取得以下 3 個檔案：

```
├── docker-compose.production.yml
├── .env.example
└── dashboard-server 映像檔（或 Dockerfile）
```

### 步驟 2：設定環境變數

```bash
cp default.env.example .env
```

編輯 `.env`：

```bash
# 必填 — 請務必修改
DB_PASSWORD=你的安全密碼
JWT_SECRET=你的隨機密鑰字串

# 選填
DB_USER=dashboard
DB_NAME=industry_dashboard
DB_PORT=5432
PORT=8080

# Azure AD SSO（留空則使用開發模式登入）
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
```

### 步驟 3：啟動

```bash
docker compose -f docker-compose.production.yml up -d
```

伺服器會自動：
1. 等待資料庫就緒（health check）
2. 執行所有資料庫遷移
3. 在 `http://你的伺服器:8080` 上提供服務

### 步驟 4：驗證

```bash
curl http://localhost:8080/healthz
# 應回傳：OK
```

用瀏覽器打開 `http://你的伺服器:8080`。

### 管理操作

```bash
# 查看日誌
docker compose -f docker-compose.production.yml logs -f server

# 重啟
docker compose -f docker-compose.production.yml restart server

# 停止
docker compose -f docker-compose.production.yml down

# 更新（取得新版本後）
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

## 方式二：執行檔 + 外部資料庫

適用於已有 PostgreSQL/TimescaleDB 的環境。

### 步驟 1：準備資料庫

確認你的 PostgreSQL 已安裝 TimescaleDB 擴充：

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### 步驟 2：啟動伺服器

```bash
DATABASE_URL="postgres://使用者:密碼@資料庫主機:5432/industry_dashboard?sslmode=require" \
JWT_SECRET="你的隨機密鑰" \
PORT=8080 \
./dashboard-server
```

啟動時自動執行資料庫遷移。現有資料不受影響，只會套用尚未執行的新遷移。

### 步驟 3：設為系統服務（Linux）

建立 `/etc/systemd/system/dashboard.service`：

```ini
[Unit]
Description=Industry Dashboard
After=network.target

[Service]
Type=simple
User=dashboard
EnvironmentFile=/etc/dashboard/.env
ExecStart=/usr/local/bin/dashboard-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

## 部署 Worker

Worker 部署在工廠邊緣設備上，透過 Modbus TCP 連接機台，將資料寫入資料庫。

### 步驟 1：複製執行檔

將 `dashboard-worker` 複製到邊緣設備。

### 步驟 2：建立設定檔

建立 `/etc/dashboard/worker.yaml`：

```yaml
site_code: "FACTORY-01"
site_name: "一廠"
timezone: "Asia/Taipei"
poll_interval: 5s

lines:
  - name: "組裝線 1"
    display_order: 1
    machines:
      - name: "CNC-01"
        model: "Haas VF-2"
        connection:
          host: "192.168.1.101"
          port: 502
          slave_id: 1
        registers:
          - name: temperature
            address: 40001
            type: holding
            data_type: float32
            unit: "°C"
```

### 步驟 3：執行

```bash
DATABASE_URL="postgres://使用者:密碼@資料庫主機:5432/industry_dashboard?sslmode=require" \
./dashboard-worker -config /etc/dashboard/worker.yaml
```

## 設定 CLI

CLI 讓 LLM 代理可以查詢儀表板資料。

### 步驟 1：建立 API 金鑰

在儀表板 UI 中：**管理 > API 金鑰 > 建立金鑰**。複製 `dk_...` 金鑰。

### 步驟 2：設定 CLI

```bash
./dashboard-cli configure --url http://你的伺服器:8080 --api-key dk_你的金鑰
```

### 步驟 3：測試

```bash
./dashboard-cli sites
./dashboard-cli alerts --site 你的廠區代碼 --status open
```

### 步驟 4：安裝為代理技能（選用）

```bash
./dashboard-cli inject-skill claude-code --global
```

## 架構概覽

```
                    ┌──────────────┐
                    │    瀏覽器    │
                    └──────┬───────┘
                           │ :8080
                    ┌──────┴───────┐
                    │    伺服器    │
                    │ (API + 前端) │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │ TimescaleDB  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────┴──┐  ┌──────┴──┐  ┌──────┴──┐
       │ Worker  │  │ Worker  │  │  CLI /   │
       │ (邊緣)  │  │ (邊緣)  │  │  LLM    │
       └─────────┘  └─────────┘  └─────────┘
```

## 部署檢查清單

- [ ] 資料庫運行中（TimescaleDB/PostgreSQL）
- [ ] 已設定 `DB_PASSWORD` 和 `JWT_SECRET`
- [ ] 伺服器已啟動（遷移自動執行）
- [ ] 儀表板可從 `http://伺服器:8080` 存取
- [ ] 已設定 Azure AD（如使用 SSO）
- [ ] Worker 已部署並設定 YAML 設定檔
- [ ] 已建立 CLI/LLM 用的 API 金鑰
- [ ] 已設定資料庫卷的備份

## 疑難排解

| 問題 | 解決方式 |
|------|----------|
| 伺服器無法連線資料庫 | 檢查 `DATABASE_URL`，確認資料庫已啟動且接受連線 |
| 遷移失敗 | 檢查伺服器日誌。若出現 `dirty` 遷移，需手動修正 `schema_migrations` 表 |
| 前端顯示空白頁 | 確認伺服器使用 `make build-server` 編譯（不是 `go build`） |
| CLI 回傳 "unauthorized" | 在管理 > API 金鑰中確認金鑰為啟用狀態 |
| Worker 未收集資料 | 檢查 worker YAML 中的 Modbus 連線設定，確認機台可連線 |
