# 硅基流动密钥轮换器 - 本地代理

一个本地的 **OpenAI 兼容代理**，可在多个 SiliconFlow API Key 之间轮换，以提升可靠性和容错能力。

## 🚀 快速开始

### 方法一：一键启动（Windows，推荐）
1. 将 API Key 添加到 `keys.txt` 文件中（每行一个key，以 `sk-` 开头）
2. **双击** `start-all.bat`
3. 系统将自动：
   - ✅ 检查Node.js环境和依赖
   - ✅ 启动代理服务（端口11435）
   - ✅ 启动管理面板（端口3000）  
   - ✅ 显示密钥统计信息（包括禁用密钥数量）
   - ✅ 自动打开浏览器到管理面板
4. **保持服务窗口开启**，即可在应用中使用

### 方法二：手动设置
1. **安装依赖：**
   ```cmd
   npm install
   ```

2. **准备密钥：**
   - 选项 A：使用 PowerShell 脚本
   ```powershell
   PowerShell -ExecutionPolicy Bypass -File scripts\win_prepare_keys.ps1
   ```

   - 选项 B：手动创建 `keys.txt`
   ```txt
   sk-siliconflow-your-key-1
   sk-siliconflow-your-key-2
   sk-siliconflow-your-key-3
   ```

3. **配置环境：**
   ```cmd
   copy .env.example .env
   ```
   如有需要，编辑 `.env`（大多数默认配置即可使用）。

4. **启动服务：**
   ```cmd
   npm run dev
   ```

---

## 🔗 Claude Code Router 配置

在 Claude Code Router 配置中设置：
- **Base URL：** `http://localhost:11435/v1`
- **API Key：** 任意字符串（真实 key 由 rotator 管理）
- **Model：** `deepseek-ai/DeepSeek-V3`（或任意可用模型）
- **Streaming：** 开启（推荐）

---

## 📊 健康检查与监控

访问 `http://localhost:11435/health` 可查看：
- Key 状态总览
- 每个 Key 的使用统计
- Key 掩码显示（不会展示完整 key）
- 当前配置

示例健康检查输出：
```json
{
  "base": "https://api.siliconflow.cn/v1/",
  "totalKeys": 3,
  "usableKeys": 3,
  "keys": [
    {
      "id": "001",
      "keyMasked": "sk-si...key1",
      "disabled": false,
      "cooldownUntil": 0,
      "stats": { "ok": 15, "fail": 2 },
      "lastError": null
    }
  ]
}
```

---

## 🔐 Key 安全性

- **完整 Key 永不记录日志**  
- **日志中仅显示掩码形式**：`sk-ABCD...WXYZ`  
- **仅本地服务**：只绑定在 localhost  
- **自动清理**：会自动检测并移除无效 key  

---

## ⚙️ 配置项

在 `.env` 中可配置：

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | `11435` | 代理服务端口 |
| `SILICONFLOW_BASE_URL` | `https://api.siliconflow.cn/v1/` | SiliconFlow API 基础地址 |
| `KEY_FILE` | `./keys.txt` | 存放 API key 的文件 |
| `SILICONFLOW_KEYS` | ` ` | 通过环境变量传入的逗号分隔 key |
| `MAX_TRIES_PER_REQUEST` | `6` | 单请求最大尝试次数 |
| `COOLDOWN_SECONDS` | `60` | 临时失败的冷却时间（秒） |
| `ENABLE_STREAMING` | `true` | 是否启用 SSE 流式输出 |

---

## 🔄 Key 轮换特性

- **智能重试**：遇到 401/402 错误时，永久拉黑该 key  
- **冷却机制**：临时错误触发冷却  
- **负载均衡**：轮询选择 key  
- **健康监控**：实时 key 状态监控 `/health`  
- **错误恢复**：失败时自动切换其他 key
- 🆕 **自动余额检查**：每5分钟检查所有密钥余额
- 🆕 **智能禁用**：自动禁用余额不足或无效的密钥
- 🆕 **轮询排除**：被禁用的密钥自动从轮询中排除  

---

## 🔧 支持的 Key 文件格式

### 文本文件（`keys.txt`）
```
sk-siliconflow-abc123def456
# 注释行
sk-siliconflow-xyz789uvw012
```

### JSON 文件（`keys.json`）
```json
["sk-siliconflow-key1", "sk-siliconflow-key2"]
```

### CSV 文件（`keys.csv`）
```csv
key
sk-siliconflow-key1
sk-siliconflow-key2
```

---

## 🐛 故障排查

### 常见问题：

1. **“No keys found”**  
   - 确认 key 以 `sk-` 开头  
   - 检查 `keys.txt` 是否存在  
   - 确认文件为 UTF-8 编码  

2. **“Connection refused”**  
   - 确认服务正在运行（窗口需保持开启）  
   - 检查防火墙设置  
   - 验证 `localhost:11435` 可访问  

3. **"All keys exhausted"**  
   - 访问 http://localhost:11435/health 查看状态  
   - 确认 key 有效且余额充足  
   - 检查 401/402 错误（无效 key）
   - 🆕 检查Dashboard查看哪些密钥被自动禁用  

4. **PowerShell 策略报错**  
   - 管理员执行：`Set-ExecutionPolicy RemoteSigned`  
   - 或使用：`PowerShell -ExecutionPolicy Bypass -File scripts\win_prepare_keys.ps1`

### 检查服务状态：
```cmd
curl http://localhost:11435/health
```
或浏览器访问： http://localhost:11435/health  

---

## 📱 集成示例

### 直接 API 调用：
```bash
curl http://localhost:11435/v1/chat/completions \
  -H "Authorization: Bearer anything" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-ai/DeepSeek-V3","messages":[{"role":"user","content":"Hello"}]}'
```

### 与 Claude CLI 搭配：
```bash
claude --set base-url http://localhost:11435/v1
claude --set api-key placeholder
```

---

## 🗂️ 项目结构

```
sf-rotator-local/
├── src/
│   ├── server.js              # 主代理服务器
│   ├── keyManager.js          # Key 轮换逻辑
│   ├── util.js                # 工具函数
│   ├── database.js            # 数据库管理
│   ├── statsApi.js            # 统计API
│   └── statsCollector.js      # 统计收集器
├── scripts/
│   ├── check-stats.js         # 密钥状态检查脚本
│   └── win_prepare_keys.ps1   # Windows Key 准备脚本
├── public/
│   └── dashboard.html         # Web管理界面
├── server-with-dashboard.mjs  # 仪表板后端服务
├── start-all.bat              # Windows一键启动脚本
├── stop-all.bat               # Windows一键停止脚本
├── .env.example               # 配置模板
├── keys.example.txt           # 示例 Key 文件
├── package.json               # 依赖与脚本
└── README.md                  # 本文件
```

---

## 🔄 自动 Key 检测

脚本会自动查找以下文件中的 Key：
- 项目根目录下的 `keys.txt`
- 任意 `.txt`、`.csv`、`.json` 文件中包含 `sk-` 的内容
- 递归扫描整个项目目录  

---

## 🚨 安全注意事项

- **切勿将 API Key 提交到版本控制**  
- **不要上传 `keys.txt`**  
- **Key 仅本地存储**  
- **服务只绑定 localhost**  
- **不会暴露任何外部 API**  

## 🤖 自动密钥管理

### 自动禁用机制
系统会自动检测和禁用以下类型的密钥：

1. **余额不足密钥**
   - 当总余额 ≤ 0 时自动禁用
   - 显示状态：`自动禁用(余额)`

2. **无效密钥**
   - API返回401/402错误时自动禁用
   - 显示状态：`自动禁用(无效)`

3. **检查频率**
   - 主代理服务：每5分钟检查一次
   - 仪表板服务：每2分钟检查一次

### 智能轮询
- 被禁用的密钥会自动从轮询队列中排除
- 只有启用且未冷却的密钥参与轮询
- 实现真正的"无人值守"运行

### 恢复机制
- 如果密钥余额恢复，可在Dashboard中手动重新启用
- 系统不会自动重新启用已禁用的密钥（防止频繁切换）

---

## 💡 小技巧

1. **多来源配置**：同时设置 `KEY_FILE` 与 `SILICONFLOW_KEYS`，增强冗余性  
2. **健康监控**：将 `/health` 接口加入系统监控  
3. **动态更新**：更新 `keys.txt` 后重启即可增删 Key  
4. **测试**：生产前用 `/health` 接口验证 Key 状态
5. **一键停止**：使用 `stop-all.bat` 快速停止所有服务
6. **状态检查**：使用 `node scripts/check-stats.js` 随时查看密钥统计

---

# SiliconFlow Key Rotator - Local Proxy

A local OpenAI-compatible proxy that rotates between multiple SiliconFlow API keys for improved reliability and failover.

## 🚀 Quick Start

### Method 1: One-Click Start (Windows)
1. Add your API keys to any file (`.txt`, `.csv`, `.json`) - the keys should start with `sk-`
2. **Double-click** `RUN_WINDOWS.bat`
3. Follow the prompts in the command window
4. **Leave the window open** while using Claude Code Router

### Method 2: Manual Setup
1. **Install dependencies:**
   ```cmd
   npm install
   ```

2. **Prepare keys:**
   - Option A: Use the PowerShell script
   ```powershell
   PowerShell -ExecutionPolicy Bypass -File scripts\win_prepare_keys.ps1
   ```
   
   - Option B: Create `keys.txt` manually
   ```txt
   sk-siliconflow-your-key-1
   sk-siliconflow-your-key-2
   sk-siliconflow-your-key-3
   ```

3. **Configure environment:**
   ```cmd
   copy .env.example .env
   ```
   Edit `.env` if needed (most defaults should work).

4. **Start the service:**
   ```cmd
   npm run dev
   ```

## 🔗 Claude Code Router Configuration

In Claude Code Router configuration, set:
- **Base URL:** `http://localhost:11435/v1`
- **API Key:** *can be anything - keys are managed by the rotator*
- **Model:** `deepseek-ai/DeepSeek-V3` (or any available model)
- **Streaming:** Enabled (recommended)

## 📊 Health & Monitoring

Visit `http://localhost:11435/health` for:
- Keys status overview
- Usage statistics per key
- Key masking (never shows full keys)
- Configured settings

Example health output:
```json
{
  "base": "https://api.siliconflow.cn/v1/",
  "totalKeys": 3,
  "usableKeys": 3,
  "keys": [
    {
      "id": "001",
      "keyMasked": "sk-si...key1",
      "disabled": false,
      "cooldownUntil": 0,
      "stats": { "ok": 15, "fail": 2 },
      "lastError": null
    }
  ]
}
```

## 🔐 Key Security

- **Full API keys never logged**
- **Masked keys shown in logs**: `sk-ABCD...WXYZ`
- **Local-only service**: Only binds to localhost
- **Automatic cleanup**: Detects and removes invalid keys

## ⚙️ Configuration

Environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `11435` | Port for the proxy server |
| `SILICONFLOW_BASE_URL` | `https://api.siliconflow.cn/v1/` | SiliconFlow API base URL |
| `KEY_FILE` | `./keys.txt` | File containing API keys |
| `SILICONFLOW_KEYS` | ` ` | Comma-separated keys in env var |
| `MAX_TRIES_PER_REQUEST` | `6` | Max attempts before giving up |
| `COOLDOWN_SECONDS` | `60` | Cooldown for temporarily failed keys |
| `ENABLE_STREAMING` | `true` | Enable SSE streaming |

## 🔄 Key Rotation Features

- **Smart retry**: On 401/402 errors, permanently blacklist keys
- **Cooldown system**: Temporary failures trigger cooling
- **Load balancing**: Round-robin key selection
- **Health monitoring**: Real-time key status via /health
- **Error recovery**: Automatic key switching on failures

## 🔧 Key Formats Supported

### Plain text files (`keys.txt`):
```
sk-siliconflow-abc123def456
# Comments work
sk-siliconflow-xyz789uvw012
```

### JSON files (`keys.json`):
```json
["sk-siliconflow-key1", "sk-siliconflow-key2"]
```

### CSV files (`keys.csv`):
```csv
key
sk-siliconflow-key1
sk-siliconflow-key2
```

## 🐛 Troubleshooting

### Common Issues:

1. **"No keys found"**:
   - Ensure keys start with `sk-`
   - Check that keys.txt exists or run key preparation
   - Keys file should be UTF-8 encoded

2. **"Connection refused"**:
   - Ensure the service is running (command window stays open)
   - Check firewall settings
   - Verify localhost:11435 is accessible

3. **"All keys exhausted"**:
   - Check health endpoint: http://localhost:11435/health
   - Verify keys are valid and have sufficient credits
   - Check for 401/402 errors indicating invalid keys

4. **PowerShell execution policy error**:
   - Run as Administrator: `Set-ExecutionPolicy RemoteSigned`
   - Or use: `PowerShell -ExecutionPolicy Bypass -File scripts\win_prepare_keys.ps1`

### Check Service Status:
```cmd
curl http://localhost:11435/health
```

Or visit in browser: http://localhost:11435/health

## 📊 Web Dashboard

新增的**可视化密钥管理界面**，可实时查看和管理API密钥：

### 启动Dashboard
```cmd
npm run dashboard
```

### 访问Dashboard
打开浏览器访问： **http://localhost:3000/dashboard**

### Dashboard功能
- ✅ 实时密钥余额显示
- ✅ 密钥启用/禁用控制
- ✅ 调用统计和错误监控
- ✅ 批量导入/导出密钥
- ✅ 余额低预警提醒
- ✅ 自动2分钟更新一次
- 🆕 **自动禁用没有余额的密钥**
- 🆕 **自动禁用无效密钥（401/402错误）**
- 🆕 **显示自动禁用原因和时间**

![Dashboard界面](https://via.placeholder.com/800x400/4f46e5/white?text=SiliconFlow+Key+Dashboard)

### 启动多个服务

#### 方法1：一键启动（推荐）
```cmd
# 双击运行或命令行执行
start-all.bat
```

**功能特点：**
- ✅ 自动安装依赖（首次运行）
- ✅ 同时启动代理服务和仪表板
- ✅ 自动打开浏览器访问管理面板
- ✅ 服务状态检查和提示
- ✅ 详细的使用说明

#### 方法2：手动分别启动
可**同时运行**主代理服务和Dashboard：

1. **窗口1** - 启动代理服务：
```cmd
npm run dev
```

2. **窗口2** - 启动Dashboard：
```cmd
npm run dashboard
```

#### 停止所有服务
```cmd
# 双击运行或命令行执行
stop-all.bat
```

**服务地址：**
- **代理服务**: http://localhost:11435
- **管理面板**: http://localhost:3000

## 📱 API集成示例

### Direct API usage:
```bash
curl http://localhost:11435/v1/chat/completions \
  -H "Authorization: Bearer anything" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-ai/DeepSeek-V3","messages":[{"role":"user","content":"Hello"}]}'
```

### With Claude CLI:
```bash
claude --set base-url http://localhost:11435/v1
claude --set api-key placeholder
```

## 🗂️ Project Structure

```
sf-rotator-local/
├── src/
│   ├── server.js       # Main proxy server
│   ├── keyManager.js   # Key rotation logic  
│   ├── util.js         # Utility functions
│   ├── database.js     # Database management (SQLite)
│   ├── statsApi.js     # Statistics API endpoints
│   └── statsCollector.js # Usage statistics collector
├── scripts/
│   └── win_prepare_keys.ps1  # Windows key preparation
├── public/
│   └── dashboard.html  # Web dashboard frontend
├── server-with-dashboard.mjs  # Dashboard backend server
├── .env.example        # Configuration template
├── keys.example.txt    # Key file example
├── package.json        # Dependencies & scripts
├── RUN_WINDOWS.bat   # One-click start (Windows)
├── start-all.bat       # 一键启动所有服务（推荐）
├── stop-all.bat        # 一键停止所有服务
├── ARCHITECTURE.md     # 系统架构技术文档
└── README.md          # This file
```

## 🔄 Auto Key Detection

The preparation script automatically finds keys in:
- `keys.txt` in project root
- Any `.txt`, `.csv`, or `.json` files containing `sk-` patterns
- Recursively scans project directory

## 🚨 Security Notes

- **Never commit API keys to version control**
- **Keep keys.txt out of repositories**
- **Keys are stored locally only**
- **Service binds exclusively to localhost**
- **No external API exposure**

---

## 💡 Tips

1. **Multiple sources**: Set both `KEY_FILE` and `SILICONFLOW_KEYS` for redundancy
2. **Health monitoring**: Add the health endpoint to system monitoring
3. **Key rotation**: Add/remove keys dynamically by updating keys.txt and restarting
4. **Testing**: Use health endpoint to verify key status before production use