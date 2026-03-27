[English](README.md) | [繁體中文](README-tw.md)

# 工業監控儀表板

可自訂的多廠區工業監控儀表板，用於追蹤產線、機台狀態和營運指標。使用者設定監控項目，AI 透過 [json-render](https://github.com/vercel-labs/json-render) 自動產生 UI 佈局。

## 主要功能

- **產線監控** - 即時查看產線狀態與產能
- **機台狀態追蹤** - 監控機台健康度、運行時間與警報
- **自訂儀表板** - 使用者定義監控內容，AI 使用 json-render 產生 UI 佈局
- **角色權限控制 (RBAC)** - 自訂角色與細粒度權限，依廠區分權
- **稽核紀錄** - 完整記錄使用者操作與系統變更

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | React + TypeScript + Vite + [json-render](https://github.com/vercel-labs/json-render) (shadcn/ui 元件) |
| 後端 | Go (chi router) |
| 資料庫 | TimescaleDB (PostgreSQL + 時間序列) |
| 認證 | Microsoft Entra ID (Azure AD) SSO via OIDC |
| 權限 | 自訂角色權限，依廠區分權 |
| 稽核 | 結構化稽核日誌 |

## 快速開始

### 前置需求
- Go 1.22+
- Node.js 18+
- Docker (TimescaleDB 用)

### 安裝

```bash
# 啟動資料庫
make db-up

# 執行資料庫遷移
make migrate

# 啟動後端 (port 8080)
make dev

# 啟動前端 (port 5173，另開終端機)
cd frontend && npm install && npm run dev
```

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `PORT` | `8080` | 後端伺服器埠號 |
| `DATABASE_URL` | `postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable` | TimescaleDB 連線字串 |
| `AZURE_CLIENT_ID` | | Microsoft Entra ID 應用程式用戶端 ID |
| `AZURE_CLIENT_SECRET` | | Microsoft Entra ID 應用程式密碼 |
| `AZURE_TENANT_ID` | | Azure AD 租戶 ID |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT 簽名密鑰 |

## 部署

### 編譯

```bash
# 編譯所有（伺服器含前端 + CLI + Worker）
make build

# 或個別編譯
make build-server    # bin/dashboard-server（13MB，內含前端）
make build-cli       # bin/dashboard-cli
make build-worker    # bin/dashboard-worker
```

### Docker

```bash
# 編譯並啟動完整服務（伺服器 + TimescaleDB）
make docker-run

# 僅編譯映像檔
make docker-build
```

Docker 映像包含 3 個執行檔 + 資料庫遷移檔。伺服器內嵌前端，不需要額外的 Web 伺服器。

### 跨平台編譯（Release）

```bash
make release    # 編譯至 dist/ 目錄
```

產出：
- `dashboard-server-linux-{amd64,arm64}` — 伺服器
- `dashboard-cli-{linux,darwin,windows}-{amd64,arm64}` — 各平台 CLI
- `dashboard-worker-linux-{amd64,arm64}` — Worker

### 正式環境部署

```bash
# 1. 執行資料庫遷移
make migrate

# 2. 啟動伺服器（單一執行檔，同時提供 API + 前端，port 8080）
PORT=8080 DATABASE_URL=postgres://... JWT_SECRET=... ./bin/dashboard-server

# 3. 將 Worker 部署到工廠邊緣設備
./bin/dashboard-worker -config /etc/dashboard/worker.yaml
```

### 透過 `go install` 安裝 CLI

```bash
go install github.com/austinjan/industry-dashboard/cmd/dashboard-cli@latest
```

## 模擬 Worker

模擬 Worker 在沒有真實 Modbus 硬體的情況下產生模擬感測器資料。透過 YAML 設定檔建立廠區、產線和機台，並按照輪詢間隔寫入隨機資料到 TimescaleDB。

### 執行

```bash
# 使用預設設定檔 (cmd/fake-worker/config.yaml)
make fake-worker

# 使用自訂設定檔
make fake-worker-config CONFIG=path/to/config.yaml
```

需要先啟動資料庫 (`make db-up && make migrate`) 並設定 `DATABASE_URL`。

### 設定檔格式

```yaml
site_code: "ALPHA"
site_name: "Factory Alpha"
timezone: "Asia/Taipei"
poll_interval: 5s

lines:
  - name: "Assembly Line 1"
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
            fake:
              min: 60
              max: 95
              pattern: drift
```

### 頂層欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `site_code` | string | 廠區唯一識別碼 |
| `site_name` | string | 廠區顯示名稱 |
| `timezone` | string | IANA 時區 (如 `Asia/Taipei`) |
| `poll_interval` | duration | 資料產生間隔 (如 `5s`、`10s`) |
| `lines` | list | 此廠區的產線列表 |

### 產線欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `name` | string | 產線名稱 |
| `display_order` | int | 顯示排序 |
| `machines` | list | 此產線的機台列表 |

### 機台欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `name` | string | 機台名稱 |
| `model` | string | 機台型號 |
| `connection.host` | string | Modbus TCP 主機位址 |
| `connection.port` | int | Modbus TCP 埠號 |
| `connection.slave_id` | int | Modbus 從站 ID |
| `registers` | list | 要讀取/模擬的資料暫存器 |

### 暫存器欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `name` | string | 指標名稱 (如 `temperature`、`speed`) |
| `address` | int | Modbus 暫存器位址 |
| `type` | string | 暫存器類型 (`holding`) |
| `data_type` | string | `float32`、`uint16`、`int32` |
| `unit` | string | 量測單位 |
| `fake.min` | number | 最小產生值 |
| `fake.max` | number | 最大產生值 |
| `fake.pattern` | string | 資料產生模式 (見下方) |

### 模擬資料模式

| 模式 | 行為 |
|------|------|
| `random` | 在 min 和 max 之間的均勻隨機值（預設） |
| `sine` | 在 min 和 max 之間的正弦波 |
| `drift` | 在 min/max 範圍內的漸進隨機漂移 |
| `spike` | 大部分正常值，偶爾突增到 max |
| `monotonic` | 持續遞增（小幅隨機步進），適用於運行時數等計數器 |

## Dashboard CLI（LLM 整合）

命令列工具，讓 LLM 代理（或人類）以唯讀方式存取儀表板。輸出 JSON 格式，包含分頁與 token 預算控制（每次回應約 1K tokens）。

### 安裝

```bash
# 編譯 CLI
make dashboard-cli

# 在儀表板 UI 建立 API 金鑰：
# 進入 管理 → API 金鑰 → 建立金鑰 → 複製 dk_... 金鑰

# 設定 CLI
./bin/dashboard-cli configure --url http://localhost:8080 --api-key dk_YOUR_KEY
```

### 指令

```bash
# 探索
./bin/dashboard-cli doc                          # 列出所有主題
./bin/dashboard-cli doc alerts                   # 了解 alerts 指令

# 查詢資料
./bin/dashboard-cli sites                        # 列出廠區與統計
./bin/dashboard-cli machines --site ALPHA        # 依產線分組顯示機台
./bin/dashboard-cli alerts --site ALPHA --status open  # 未處理的警報
./bin/dashboard-cli alerts --site ALPHA --severity critical --last 7d
./bin/dashboard-cli audit --last 3d              # 近期稽核紀錄
./bin/dashboard-cli audit --user "Dev User" --action create
./bin/dashboard-cli metrics --machine MACHINE_ID # 最新感測器數值
./bin/dashboard-cli metrics --machine MACHINE_ID --metric temperature --last 1h
./bin/dashboard-cli workers                      # Worker 叢集狀態
./bin/dashboard-cli alert-rules --site ALPHA     # 已設定的警報規則

# API 金鑰管理
./bin/dashboard-cli admin create-key --name "my-agent"
./bin/dashboard-cli admin list-keys
./bin/dashboard-cli admin revoke-key --id KEY_UUID
```

### 分頁與 Token 預算

每個回應都包含 `"meta"` 欄位，提供分頁資訊：

```json
{
  "meta": {
    "usage": "dashboard-cli alerts --site SITE [--severity X] [--status X] [--last 7d] [--page N] [--head N]",
    "showing": 12,
    "total": 58,
    "remaining": 46,
    "next": "dashboard-cli alerts --site ALPHA --page 2"
  },
  "alerts": [...]
}
```

- `--head 0` — 僅顯示 meta，不含資料（最省 token 的方式）
- `--page N` — 取得指定頁面
- 輸出自動限制在每次回應約 1K tokens

### 代理整合

將 CLI 安裝為代理技能，讓 LLM 自動發現並使用：

```bash
# 專案層級（當前目錄）
./bin/dashboard-cli inject-skill claude-code

# 全域（所有專案）
./bin/dashboard-cli inject-skill claude-code --global

# 自訂目標資料夾
./bin/dashboard-cli inject-skill claude-code --target /path/to/project
```

### 環境變數

| 變數 | 說明 |
|------|------|
| `DASHBOARD_URL` | 覆寫伺服器 URL（取代設定檔） |
| `DASHBOARD_API_KEY` | 覆寫 API 金鑰（取代設定檔） |

設定檔位置：`~/.dashboard-cli.yaml`

## 授權

Copyright © austin.jan@gmail.com. All rights reserved.
