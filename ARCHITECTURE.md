# 硅基流动轮询服务 - 系统架构文档

## 项目概述

硅基流动轮询服务是一个本地代理服务，提供SiliconFlow API密钥的轮询管理，具有OpenAI兼容性。主要功能包括：
- API密钥轮询和负载均衡
- 自动余额检查和密钥禁用
- 可视化管理仪表板
- 错误处理和冷却机制

## 系统架构

### 核心组件

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Dashboard     │    │   Database      │
│                 │    │   (Web UI)      │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         v                       v                       v
┌─────────────────────────────────────────────────────────────────┐
│                    Main Proxy Server                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Key Manager   │  │  Balance Checker │  │  Stats Collector │  │
│  │                 │  │                 │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                v
┌─────────────────────────────────────────────────────────────────┐
│                    SiliconFlow API                              │
│                 https://api.siliconflow.cn/v1/                  │
└─────────────────────────────────────────────────────────────────┘
```

### 服务组件

1. **主代理服务** (`src/server.js`)
   - 端口: 11435 (默认)
   - 功能: API请求代理和密钥轮询

2. **仪表板服务** (`server-with-dashboard.mjs`)
   - 端口: 3000 (默认)
   - 功能: Web管理界面

## 文件结构

```
sf-rotator-local/
├── src/
│   ├── server.js              # 主代理服务器
│   ├── keyManager.js          # 密钥管理核心类
│   ├── util.js                # 工具函数
│   ├── database.js            # 数据库管理
│   ├── statsApi.js            # 统计API
│   └── statsCollector.js      # 统计收集器
├── scripts/
│   ├── check-stats.js         # 密钥状态检查脚本
│   └── win_prepare_keys.ps1   # Windows密钥准备脚本
├── public/
│   └── dashboard.html         # 仪表板前端页面
├── server-with-dashboard.mjs  # 仪表板后端服务
├── start-all.bat              # Windows一键启动脚本
├── stop-all.bat               # Windows一键停止脚本
├── package.json               # 项目配置
└── keys.txt                   # API密钥文件（可选）
```

## 数据模型

### 密钥对象结构

```javascript
{
  key: "sk-xxxxx",              // 原始API密钥
  id: "001",                    // 内部ID
  disabled: false,              // 是否禁用
  cooldownUntil: 0,             // 冷却截止时间
  stats: { ok: 0, fail: 0 },    // 成功/失败统计
  lastError: null,              // 最后错误信息
  balance: 10.50,               // 当前余额
  chargeBalance: 0,             // 充值余额
  totalBalance: 10.50,          // 总余额
  lastBalanceCheck: "2023-...", // 最后余额检查时间
  disabledReason: null,         // 禁用原因
  disabledAt: null              // 禁用时间
}
```

### 数据库表结构

```sql
-- API密钥基础信息
api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE,
  balance REAL DEFAULT 0,
  charge_balance REAL DEFAULT 0,
  total_balance REAL DEFAULT 0,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- 禁用密钥记录
disabled_keys (
  key_id TEXT PRIMARY KEY,
  disabled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  disabled_reason TEXT
)

-- 使用记录
usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  tokens_prompt INTEGER DEFAULT 0,
  tokens_completion INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  balance_before REAL,
  balance_after REAL,
  request_type TEXT,
  status INTEGER,
  error_message TEXT
)

-- 每日/每小时统计
daily_stats, hourly_stats, token_usage, balance_history
```

## 核心功能实现

### 1. 密钥轮询机制

**位置**: `src/keyManager.js:62-89`

```javascript
nextUsable() {
  const now = Date.now();
  const usableKeys = this.keys.filter(k => 
    !k.disabled && k.cooldownUntil <= now
  );
  
  if (usableKeys.length === 0) {
    return null;
  }

  // Round-robin算法选择下一个可用密钥
  // ...
}
```

**特点**:
- Round-robin轮询算法
- 自动排除禁用和冷却中的密钥
- 无可用密钥时返回null

### 2. 自动余额检查

**位置**: `src/keyManager.js:118-158`

```javascript
async checkKeyBalance(kinfo) {
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/user/info', {
      headers: { 
        Authorization: `Bearer ${kinfo.key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 402) {
        this.markFail(kinfo, `Balance check failed: ${response.status} ${response.statusText}`, { permanent: true });
        return false;
      }
    }

    const result = await response.json();
    
    // 自动禁用余额不足的密钥
    if (kinfo.totalBalance <= 0) {
      if (!kinfo.disabled) {
        this.markFail(kinfo, '余额不足，自动禁用', { permanent: true });
        return false;
      }
    }
  } catch (error) {
    // 错误处理
  }
}
```

**触发条件**:
- 总余额 ≤ 0
- API返回401/402状态码
- 网络错误（暂时冷却，不永久禁用）

**检查频率**:
- 主服务: 每5分钟
- 仪表板服务: 每2分钟

### 3. 错误处理机制

**位置**: `src/keyManager.js:96-116`

```javascript
markFail(kinfo, reason, { permanent = false } = {}) {
  kinfo.stats.fail++;
  kinfo.lastError = reason;
  
  if (permanent) {
    kinfo.disabled = true;
    kinfo.disabledReason = reason;
    kinfo.disabledAt = new Date().toISOString();
  } else {
    kinfo.cooldownUntil = Date.now() + (this.cooldownSeconds * 1000);
  }
}
```

**错误分类**:
- **永久禁用**: 401, 402 状态码
- **临时冷却**: 429, 5xx 状态码
- **立即返回**: 其他4xx状态码

### 4. 代理请求处理

**位置**: `src/server.js:34-181`

```javascript
app.all('/v1/*', async (req, res) => {
  let attempts = 0;
  
  while (attempts < MAX_TRIES_PER_REQUEST) {
    const kinfo = keyManager.nextUsable();
    if (!kinfo) {
      return res.status(503).json({
        error: { message: "All keys exhausted" }
      });
    }

    try {
      // 准备请求头和选项
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      delete headers.authorization;
      
      headers['authorization'] = `Bearer ${kinfo.key}`;
      
      // 发送请求到SiliconFlow API
      const response = await fetch(upstreamUrl, options);
      
      // 处理响应（包括流式响应）
      if (response.ok) {
        keyManager.markOk(kinfo);
        // 返回成功响应
      } else {
        // 根据状态码决定重试或返回错误
      }
    } catch (error) {
      // 网络错误处理
    }
  }
});
```

## 仪表板功能

### 后端API

**位置**: `server-with-dashboard.mjs`

```javascript
// API路由
GET  /api/keys         // 获取所有密钥信息
POST /api/keys/toggle  // 切换密钥启用状态
POST /api/keys/import  // 批量导入密钥
GET  /api/keys/export  // 导出密钥列表
```

### 前端界面

**位置**: `public/dashboard.html`

**功能组件**:
- 实时余额显示
- 密钥状态管理
- 批量导入/导出
- 自动禁用状态显示
- 错误监控

**状态显示逻辑**:
```javascript
function getStatusText(key) {
  if (!key.enabled) {
    if (key.disabledReason) {
      return key.disabledReason.includes('余额不足') ? '自动禁用(余额)' : 
             key.disabledReason.includes('密钥无效') ? '自动禁用(无效)' : '已禁用';
    }
    return '已禁用';
  }
  if (key.errors > 10) return '异常';
  if (key.balance < 0.1) return '余额低';
  return '正常';
}
```

## 配置选项

### 环境变量

```bash
# 服务配置
PORT=11435                    # 主服务端口
COOLDOWN_SECONDS=60          # 密钥冷却时间（秒）
MAX_TRIES_PER_REQUEST=6      # 每次请求最大重试次数
ENABLE_STREAMING=true        # 是否启用流式响应

# 密钥配置
SILICONFLOW_KEYS=key1,key2   # 逗号分隔的密钥列表
KEY_FILE=keys.txt            # 密钥文件路径

# API配置
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1/
```

### 启动命令

#### 一键启动（推荐）
```bash
start-all.bat         # Windows一键启动所有服务
stop-all.bat          # Windows一键停止所有服务
```

**一键启动功能特性**:
- 自动检查Node.js环境和依赖
- 同时启动代理服务和仪表板服务
- 显示彩色状态信息（青蓝色主题）
- 正确命名服务窗口标题
- 自动检查服务启动状态
- 显示详细的密钥统计信息
- 自动打开浏览器到管理面板

#### 手动启动
```bash
npm start              # 启动主代理服务
npm run dashboard      # 启动仪表板服务
npm run dev           # 开发模式
```

#### 密钥状态检查
```bash
node scripts/check-stats.js  # 显示密钥统计信息
```

## 监控和日志

### 日志输出

```
[KEY] Key sk-xxx... permanently disabled: 余额不足，自动禁用
[KEY] Key sk-xxx... cooling down for 60s: 429 Too Many Requests
[BALANCE] Checking balances for 10 keys...
[BALANCE] Auto-disabled 2 keys due to insufficient balance
[REQUEST] Attempt 1/6 using key 001
```

### 健康检查

**端点**: `GET /health`

**响应格式**:
```json
{
  "base": "https://api.siliconflow.cn/v1/",
  "totalKeys": 10,
  "usableKeys": 8,
  "keys": [
    {
      "id": "001",
      "keyMasked": "sk-***abc",
      "disabled": false,
      "cooldownUntil": 0,
      "stats": { "ok": 100, "fail": 2 },
      "balance": 10.50,
      "totalBalance": 10.50,
      "lastBalanceCheck": "2023-...",
      "disabledReason": null
    }
  ]
}
```

## 开发指南

### 添加新功能的步骤

1. **修改数据模型**（如需要）
   - 更新密钥对象结构
   - 修改数据库表结构

2. **实现后端逻辑**
   - 在相应的服务文件中添加功能
   - 更新API路由

3. **更新前端界面**（如需要）
   - 修改`dashboard.html`
   - 添加新的JavaScript函数

4. **更新文档**
   - 在`ARCHITECTURE.md`中记录新功能
   - 更新README.md

### 常见修改场景

**添加新的自动禁用条件**:
- 修改`checkKeyBalance`方法
- 添加新的判断逻辑

**修改轮询算法**:
- 修改`nextUsable`方法
- 实现新的选择策略

**添加新的API端点**:
- 在仪表板服务中添加路由
- 更新前端调用逻辑

## 故障排除

### 常见问题

1. **所有密钥都被禁用**
   - 检查密钥余额
   - 查看日志了解禁用原因
   - 手动启用有余额的密钥

2. **请求失败率高**
   - 检查网络连接
   - 调整重试次数和冷却时间
   - 查看SiliconFlow API状态

3. **仪表板显示异常**
   - 检查仪表板服务是否启动
   - 确认API端点可访问
   - 查看浏览器控制台错误

### 性能优化

1. **减少余额检查频率**
   - 调整`startBalanceChecker`的间隔参数

2. **优化数据库查询**
   - 添加索引
   - 批量操作

3. **缓存优化**
   - 缓存余额信息
   - 减少重复API调用

---

*最后更新: 2024-09-01*