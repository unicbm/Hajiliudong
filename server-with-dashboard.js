const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// 从 keys.txt 读取初始 keys
function loadKeysFromFile() {
  const keysPath = path.join(__dirname, "keys.txt");
  if (!fs.existsSync(keysPath)) {
    return [];
  }
  const data = fs.readFileSync(keysPath, "utf-8");
  return data
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(id => ({
      id,
      enabled: true,
      balance: 0,
      calls: 0,
      errors: 0,
      lastCall: null,
      lastBalanceCheck: null
    }));
}

let keys = loadKeysFromFile();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== API 路由 =====
app.get("/api/keys", (req, res) => res.json(keys));

app.post("/api/keys/toggle", (req, res) => {
  const key = keys.find(k => k.id === req.body.id);
  if (!key) return res.status(404).json({ success: false });
  key.enabled = !key.enabled;
  res.json({ success: true, key });
});

app.post("/api/keys/import", (req, res) => {
  if (Array.isArray(req.body.newKeys)) {
    keys = req.body.newKeys.map(id => ({
      id, 
      enabled: true, 
      balance: 0, 
      calls: 0, 
      errors: 0, 
      lastCall: null,
      lastBalanceCheck: null
    }));
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, message: "Invalid format" });
});

app.get("/api/keys/export", (req, res) => res.json(keys));

// ===== 余额查询逻辑 =====
async function updateBalances() {
  console.log(`[${new Date().toISOString()}] 开始更新余额...`);
  for (const key of keys) {
    if (!key.enabled) continue;
    
    try {
      const resp = await fetch("https://api.siliconflow.cn/v1/user/info", {
        headers: { Authorization: `Bearer ${key.id}` },
      });
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      
      const result = await resp.json();
      
      if (result.data?.balance !== undefined) {
        key.balance = parseFloat(result.data.balance);
        key.chargeBalance = parseFloat(result.data.chargeBalance || 0);
        key.totalBalance = parseFloat(result.data.totalBalance || 0);
        key.lastBalanceCheck = new Date().toISOString();
        key.status = result.data.status || 'unknown';
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(`❌ Key ${key.id.slice(0, 8)}... 余额查询失败:`, err.message);
      key.errors += 1;
    }
  }
}

// ===== 启动时立即更新一次，然后每60秒更新 =====
async function startServer() {
  // 首次更新
  if (keys.length > 0) {
    await updateBalances();
  }
  
  // 启动服务器
  app.listen(PORT, () => {
    console.log(`✅ Dashboard 服务启动成功`);
    console.log(`📊 管理面板: http://localhost:${PORT}/dashboard`);
    console.log(`📄 API接口: http://localhost:${PORT}/api/keys`);
    console.log(`🔑 已加载 ${keys.length} 个 API Key`);
  });

  // 定时更新
  setInterval(updateBalances, 60 * 1000);
}

startServer();