import express from "express";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// 从 keys.txt 读取初始 keys
function loadKeysFromFile() {
  const keysPath = join(__dirname, "keys.txt");
  if (!existsSync(keysPath)) {
    return [];
  }
  const data = readFileSync(keysPath, "utf-8");
  return data
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((id, index) => ({
      id,
      enabled: true,
      balance: 0,
      chargeBalance: 0,
      totalBalance: 0,
      calls: 0,
      errors: 0,
      lastCall: null,
      lastBalanceCheck: null,
      key: `key_${index + 1}`
    }));
}

let keys = loadKeysFromFile();

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ===== 根路径和dashboard路由 =====
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(join(__dirname, "public", "dashboard.html"));
});

// ===== API 路由 =====
app.get("/api/keys", (req, res) => res.json(keys));

app.post("/api/keys/toggle", async (req, res) => {
  const { id } = req.body;
  const key = keys.find(k => k.id === id);
  if (!key) return res.status(404).json({ success: false });
  
  key.enabled = !key.enabled;
  
  // 如果启用，立即刷新余额
  if (key.enabled) {
    await updateSingleKeyBalance(key);
  }
  
  res.json({ success: true, key });
});

app.post("/api/keys/import", async (req, res) => {
  if (Array.isArray(req.body.newKeys)) {
    keys = req.body.newKeys.map((id, index) => ({
      id,
      enabled: true,
      balance: 0,
      chargeBalance: 0,
      totalBalance: 0,
      calls: 0,
      errors: 0,
      lastCall: null,
      lastBalanceCheck: null,
      key: `key_${index + 1}`
    }));
    
    // 导入后立刻更新余额
    await updateBalances();
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, message: "格式错误" });
});

app.get("/api/keys/export", (req, res) => res.json(keys));

// ===== 单一key余额查询 =====
async function updateSingleKeyBalance(key) {
  if (!key.enabled) return;
  
  try {
    const resp = await fetch("https://api.siliconflow.cn/v1/user/info", {
      headers: { Authorization: `Bearer ${key.id}` },
    });
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    
    const result = await resp.json();
    
    if (result.data?.balance !== undefined) {
      key.balance = parseFloat(result.data.balance || 0);
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

// ===== 批量余额查询 =====
async function updateBalances() {
  console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 开始更新余额...`);
  
  for (const key of keys) {
    await updateSingleKeyBalance(key);
    await new Promise(resolve => setTimeout(resolve, 100)); // 防止请求过快
  }
  
  console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 余额更新完成 ✅`);
}

// ===== 启动时 =====
async function startServer() {
  console.log(`🚀 正在启动 SiliconFlow Key Dashboard...`);
  console.log(`📊 已加载 ${keys.length} 个 API Key`);
  
  try {
    if (keys.length > 0) {
      console.log("🔄 首次更新余额中...");
      await updateBalances();
    }
    
    app.listen(PORT, () => {
      console.log(`✅ Dashboard 启动成功！`);
      console.log(`🌐 管理面板: http://localhost:${PORT}/dashboard`);
      console.log(`📡 API接口: http://localhost:${PORT}/api/keys`);
      console.log();
      console.log(`📱 功能导航:`);
      console.log(`   - 查看实时余额`);
      console.log(`   - 启用/禁用 Key`);
      console.log(`   - 批量导入导出`);
      console.log(`   - 错误状态监控`);
    });

    // 定时更新：每2分钟更新一次
    setInterval(updateBalances, 2 * 60 * 1000);
    
  } catch (err) {
    console.error("启动失败:", err);
  }
}

// 处理SIGTERM优雅关闭
process.on('SIGTERM', () => {
  console.log('接收到关闭信号...');
  process.exit(0);
});

startServer();