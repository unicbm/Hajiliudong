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

## 📱 Integration Examples

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
│   └── util.js         # Utility functions
├── scripts/
│   └── win_prepare_keys.ps1  # Windows key preparation
├── .env.example        # Configuration template
├── keys.example.txt    # Key file example
├── package.json        # Dependencies & scripts
├── RUN_WINDOWS.bat   # One-click start (Windows)
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