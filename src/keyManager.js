import fs from 'fs';
import { fetch } from 'undici';
import { maskKey, delay } from './util.js';

export class KeyManager {
  constructor(env = process.env) {
    this.cooldownSeconds = parseInt(env.COOLDOWN_SECONDS) || 60;
    this.keys = [];
    this.ptr = 0;
    this.initializeKeys(env);
  }

  static fromEnv(env = process.env) {
    return new KeyManager(env);
  }

  initializeKeys(env) {
    const keySet = new Set();
    
    // Read from environment variable
    if (env.SILICONFLOW_KEYS) {
      env.SILICONFLOW_KEYS.split(',').forEach(key => {
        const trimmed = key.trim();
        if (trimmed) keySet.add(trimmed);
      });
    }

    // Read from file
    if (env.KEY_FILE) {
      try {
        if (fs.existsSync(env.KEY_FILE)) {
          const content = fs.readFileSync(env.KEY_FILE, 'utf8');
          content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              keySet.add(trimmed);
            }
          });
        }
      } catch (error) {
        console.warn(`Warning: Could not read keys file: ${error.message}`);
      }
    }

    // Initialize key objects
    this.keys = Array.from(keySet).map((key, index) => ({
      key,
      id: String(index + 1).padStart(3, '0'),
      disabled: false,
      cooldownUntil: 0,
      stats: { ok: 0, fail: 0 },
      lastError: null,
      balance: null,
      chargeBalance: null,
      totalBalance: null,
      lastBalanceCheck: null,
      disabledReason: null,
      disabledAt: null
    }));

    if (this.keys.length === 0) {
      console.error('No API keys found. Please provide keys in:');
      console.error('  1. SILICONFLOW_KEYS environment variable (comma-separated)');
      console.error('  2. KEYS_FILE file (one key per line)');
      process.exit(1);
    }
  }

  nextUsable() {
    const now = Date.now();
    const usableKeys = this.keys.filter(k => 
      !k.disabled && k.cooldownUntil <= now
    );
    
    if (usableKeys.length === 0) {
      return null;
    }

    // Find next usable key with round-robin
    let attempts = 0;
    while (attempts < this.keys.length) {
      const currentIndex = this.ptr % this.keys.length;
      const keyInfo = this.keys[currentIndex];
      
      // Increment pointer for next round
      this.ptr = (this.ptr + 1) % this.keys.length;
      
      if (!keyInfo.disabled && keyInfo.cooldownUntil <= now) {
        return keyInfo;
      }
      
      attempts++;
    }

    return null;
  }

  markOk(kinfo) {
    kinfo.stats.ok++;
    kinfo.lastError = null;
  }

  markFail(kinfo, reason, { permanent = false } = {}) {
    kinfo.stats.fail++;
    kinfo.lastError = reason;
    
    if (permanent) {
      kinfo.disabled = true;
      kinfo.disabledReason = reason;
      kinfo.disabledAt = new Date().toISOString();
      console.log(`[KEY] Key ${maskKey(kinfo.key)} permanently disabled: ${reason}`);
    } else {
      kinfo.cooldownUntil = Date.now() + (this.cooldownSeconds * 1000);
      console.log(`[KEY] Key ${maskKey(kinfo.key)} cooling down for ${this.cooldownSeconds}s: ${reason}`);
    }
  }

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
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.data?.balance !== undefined) {
        kinfo.balance = parseFloat(result.data.balance || 0);
        kinfo.chargeBalance = parseFloat(result.data.chargeBalance || 0);
        kinfo.totalBalance = parseFloat(result.data.totalBalance || 0);
        kinfo.lastBalanceCheck = new Date().toISOString();
        
        // 自动禁用没有余额的密钥
        if (kinfo.totalBalance <= 0) {
          if (!kinfo.disabled) {
            this.markFail(kinfo, '余额不足，自动禁用', { permanent: true });
            return false;
          }
        }
        return true;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error(`[KEY] Balance check failed for ${maskKey(kinfo.key)}: ${error.message}`);
      return false;
    }
  }

  async checkAllBalances() {
    console.log(`[BALANCE] Checking balances for ${this.keys.length} keys...`);
    let disabledCount = 0;
    
    for (const kinfo of this.keys) {
      if (!kinfo.disabled) {
        const result = await this.checkKeyBalance(kinfo);
        if (!result && kinfo.disabled) {
          disabledCount++;
        }
        await delay(100); // 防止请求过快
      }
    }
    
    if (disabledCount > 0) {
      console.log(`[BALANCE] Auto-disabled ${disabledCount} keys due to insufficient balance`);
    }
  }

  startBalanceChecker(intervalMinutes = 5) {
    // 立即检查一次
    this.checkAllBalances();
    
    // 设置定期检查
    setInterval(() => {
      this.checkAllBalances();
    }, intervalMinutes * 60 * 1000);
    
    console.log(`[BALANCE] Balance checker started, will check every ${intervalMinutes} minutes`);
  }

  health() {
    const now = Date.now();
    return {
      base: 'https://api.siliconflow.cn/v1/',
      totalKeys: this.keys.length,
      usableKeys: this.keys.filter(k => !k.disabled && k.cooldownUntil <= now).length,
      keys: this.keys.map(k => ({
        id: k.id,
        keyMasked: maskKey(k.key),
        disabled: k.disabled,
        cooldownUntil: Math.max(0, k.cooldownUntil - now),
        stats: k.stats,
        lastError: k.lastError,
        balance: k.balance,
        totalBalance: k.totalBalance,
        lastBalanceCheck: k.lastBalanceCheck,
        disabledReason: k.disabledReason,
        disabledAt: k.disabledAt
      }))
    };
  }
}