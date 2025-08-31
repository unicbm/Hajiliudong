import fs from 'fs';
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
      lastError: null
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
      console.log(`[KEY] Key ${maskKey(kinfo.key)} permanently disabled: ${reason}`);
    } else {
      kinfo.cooldownUntil = Date.now() + (this.cooldownSeconds * 1000);
      console.log(`[KEY] Key ${maskKey(kinfo.key)} cooling down for ${this.cooldownSeconds}s: ${reason}`);
    }
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
        lastError: k.lastError
      }))
    };
  }
}