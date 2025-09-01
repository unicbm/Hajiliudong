import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dbPath = join(__dirname, '../data/sf_rotator.db');
    
    // 确保数据目录存在
    const dataDir = dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);
    this.createTables();
    this.migrateData();
  }

  createTables() {
    const tables = [
      // 禁用 Key 列表
      `CREATE TABLE IF NOT EXISTS disabled_keys (
        key_id TEXT PRIMARY KEY,
        disabled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        disabled_reason TEXT
      )`,

      // API Keys 基础信息
      `CREATE TABLE IF NOT EXISTS api_keys (
        key_id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE, -- 存储key的hash（安全考虑）
        balance REAL DEFAULT 0,
        charge_balance REAL DEFAULT 0,
        total_balance REAL DEFAULT 0,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 调用记录
      `CREATE TABLE IF NOT EXISTS usage_records (
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
        error_message TEXT,
        FOREIGN KEY (key_id) REFERENCES api_keys (key_id)
      )`,

      // 每日统计数据
      `CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        calls_total INTEGER DEFAULT 0,
        tokens_total INTEGER DEFAULT 0,
        cost_total REAL DEFAULT 0,
        active_keys INTEGER DEFAULT 0,
        new_keys INTEGER DEFAULT 0,
        disabled_keys INTEGER DEFAULT 0
      )`,

      // 每小时统计数据
      `CREATE TABLE IF NOT EXISTS hourly_stats (
        hour TEXT PRIMARY KEY, -- YYYY-MM-DD-HH
        date TEXT,
        hour_of_day INTEGER,
        calls_total INTEGER DEFAULT 0,
        tokens_total INTEGER DEFAULT 0,
        cost_total REAL DEFAULT 0,
        active_keys INTEGER DEFAULT 0
      )`,

      // Token 使用情况
      `CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT,
        date TEXT,
        tokens_prompt INTEGER DEFAULT 0,
        tokens_completion INTEGER DEFAULT 0,
        tokens_total INTEGER DEFAULT 0,
        calls_count INTEGER DEFAULT 0,
        UNIQUE(key_id, date),
        FOREIGN KEY (key_id) REFERENCES api_keys (key_id)
      )`,

      // 余额变化历史
      `CREATE TABLE IF NOT EXISTS balance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        balance_before REAL,
        balance_after REAL,
        change_amount REAL,
        reason TEXT,
        FOREIGN KEY (key_id) REFERENCES api_keys (key_id)
      )`
    ];

    tables.forEach(sql => {
      this.db.run(sql);
    });

    // 创建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_usage_key_id ON usage_records(key_id)',
      'CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date)',
      'CREATE INDEX IF NOT EXISTS idx_balance_history_key ON balance_history(key_id)',
      'CREATE INDEX IF NOT EXISTS idx_hourly_stats_date ON hourly_stats(date)'
    ];

    indexes.forEach(sql => {
      this.db.run(sql);
    });
  }

  // 迁移旧数据（如果需要）
  async migrateData() {
    // 这里可以添加数据迁移逻辑
  }

  // API Key 管理
  async saveApiKey(keyId, keyHash, balanceData = {}) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO api_keys (key_id, key_hash, balance, charge_balance, total_balance, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `;
      this.db.run(sql, [
        keyId,
        keyHash,
        balanceData.balance || 0,
        balanceData.chargeBalance || 0,
        balanceData.totalBalance || 0
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getApiKey(keyId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM api_keys WHERE key_id = ?';
      this.db.get(sql, [keyId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getAllApiKeys() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM api_keys ORDER BY key_id';
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async disableKey(keyId, reason = '手动禁用') {
    return new Promise((resolve, reject) => {
      const sql1 = 'INSERT OR REPLACE INTO disabled_keys (key_id, disabled_reason) VALUES (?, ?)';
      const sql2 = 'UPDATE api_keys SET enabled = 0 WHERE key_id = ?';
      
      this.db.serialize(() => {
        this.db.run(sql1, [keyId, reason], (err) => {
          if (err) reject(err);
          else {
            this.db.run(sql2, [keyId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });
  }

  async enableKey(keyId) {
    return new Promise((resolve, reject) => {
      const sql1 = 'DELETE FROM disabled_keys WHERE key_id = ?';
      const sql2 = 'UPDATE api_keys SET enabled = 1 WHERE key_id = ?';
      
      this.db.serialize(() => {
        this.db.run(sql1, [keyId], (err) => {
          if (err) reject(err);
          else {
            this.db.run(sql2, [keyId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });
  }

  async getDisabledKeys() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT key_id, disabled_at, disabled_reason FROM disabled_keys ORDER BY disabled_at DESC';
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.key_id));
      });
    });
  }

  // 使用记录
  async recordUsage(keyId, usageData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO usage_records (key_id, tokens_prompt, tokens_completion, tokens_total, 
                                 cost, balance_before, balance_after, request_type, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        keyId,
        usageData.tokensPrompt || 0,
        usageData.tokensCompletion || 0,
        usageData.tokensTotal || 0,
        usageData.cost || 0,
        usageData.balanceBefore,
        usageData.balanceAfter,
        usageData.requestType || 'unknown',
        usageData.status || 200,
        usageData.errorMessage
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // 更新统计数据
  async updateStats(keyId, usageData, date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    const hourStr = date.toISOString().slice(0, 13).replace('T', '-');
    const hourOfDay = date.getHours();

    // 更新每日统计
    await this.updateDailyStats(dateStr, usageData);
    
    // 更新每小时统计
    await this.updateHourlyStats(hourStr, dateStr, hourOfDay, usageData);
    
    // 更新Token使用统计
    await this.updateTokenUsage(keyId, dateStr, usageData);
  }

  async updateDailyStats(date, usageData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO daily_stats (date, calls_total, tokens_total, cost_total)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          calls_total = calls_total + ?,
          tokens_total = tokens_total + ?,
          cost_total = cost_total + ?
      `;
      
      this.db.run(sql, [
        date,
        usageData.calls || 1,
        usageData.tokensTotal || 0,
        usageData.cost || 0,
        usageData.calls || 1,
        usageData.tokensTotal || 0,
        usageData.cost || 0
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async updateHourlyStats(hour, date, hourOfDay, usageData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO hourly_stats (hour, date, hour_of_day, calls_total, tokens_total, cost_total)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(hour) DO UPDATE SET
          calls_total = calls_total + ?,
          tokens_total = tokens_total + ?,
          cost_total = cost_total + ?
      `;
      
      this.db.run(sql, [
        hour, date, hourOfDay,
        usageData.calls || 1,
        usageData.tokensTotal || 0,
        usageData.cost || 0,
        usageData.calls || 1,
        usageData.tokensTotal || 0,
        usageData.cost || 0
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async updateTokenUsage(keyId, date, usageData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO token_usage (key_id, date, tokens_prompt, tokens_completion, tokens_total, calls_count)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key_id, date) DO UPDATE SET
          tokens_prompt = tokens_prompt + ?,
          tokens_completion = tokens_completion + ?,
          tokens_total = tokens_total + ?,
          calls_count = calls_count + ?
      `;
      
      this.db.run(sql, [
        keyId, date,
        usageData.tokensPrompt || 0,
        usageData.tokensCompletion || 0,
        usageData.tokensTotal || 0,
        usageData.calls || 1,
        usageData.tokensPrompt || 0,
        usageData.tokensCompletion || 0,
        usageData.tokensTotal || 0,
        usageData.calls || 1
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 获取统计数据
  async getStatsSummary() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM api_keys WHERE enabled = 1) as enabled_keys,
          (SELECT COUNT(*) FROM disabled_keys) as disabled_keys,
          (SELECT SUM(balance) FROM api_keys WHERE enabled = 1) as total_balance,
          COALESCE((SELECT SUM(cost_total) FROM daily_stats WHERE date = date('now')), 0) as today_cost,
          COALESCE((SELECT SUM(tokens_total) FROM daily_stats WHERE date = date('now')), 0) as today_tokens,
          COALESCE((SELECT SUM(calls_total) FROM daily_stats WHERE date = date('now')), 0) as today_calls
      `;
      
      this.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getDailyStats(range = 7) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT date, calls_total, tokens_total, cost_total
        FROM daily_stats
        WHERE date >= date('now', '-${range} days')
        ORDER BY date ASC
      `;
      
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getHourlyStats(range = 24) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT hour, calls_total, tokens_total, cost_total
        FROM hourly_stats
        WHERE hour >= datetime('now', '-${range} hours')
        ORDER BY hour ASC
      `;
      
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getKeyUsageStats(keyId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COALESCE(SUM(calls_total), 0) as total_calls,
          COALESCE(SUM(tokens_total), 0) as total_tokens,
          COALESCE(SUM(cost_total), 0) as total_cost,
          COALESCE(AVG(tokens_total), 0) as avg_tokens_per_call
        FROM token_usage
        WHERE key_id = ?
      `;
      
      this.db.get(sql, [keyId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getKeyTokensByDateRange(keyId, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT date, tokens_total, calls_count
        FROM token_usage
        WHERE key_id = ? AND date >= ? AND date <= ?
        ORDER BY date ASC
      `;
      
      this.db.all(sql, [keyId, startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 关闭数据库连接
  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// 创建全局数据库实例
export const db = new Database();

export default Database;