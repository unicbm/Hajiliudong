import { fetch } from 'undici';
import cron from 'node-cron';
import crypto from 'crypto';
import { db } from './database.js';

class StatsCollector {
  constructor() {
    this.isRunning = false;
    this.startScheduledTasks();
  }

  // 开始定时任务
  startScheduledTasks() {
    // 每2分钟更新Key余额
    cron.schedule('*/2 * * * *', () => {
      console.log('[Scheduler] 开始更新余额统计...');
      this.updateAllKeysBalance();
    });

    // 每小时更新统计数据
    cron.schedule('0 */1 * * *', () => {
      console.log('[Scheduler] 开始更新每日统计...');
      this.updateDailyStats();
    });

    // 每5分钟清理过期数据（保留90天）
    cron.schedule('*/5 * * * *', () => {
      console.log('[Scheduler] 开始清理过期数据...');
      this.cleanupOldData();
    });
  }

  // 生成key的hash（用于存储，避免存储原始key）
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  // 更新所有key的余额信息
  async updateAllKeysBalance() {
    if (this.isRunning) return;
    
    try {
      this.isRunning = true;
      
      // 这里需要从代理服务获取key列表，暂时用内存中的
      const keys = global.sharedKeys || [];
      
      for (const key of keys) {
        try {
          await this.updateSingleKeyBalance(key);
        } catch (error) {
          console.error(`[Stats] 更新key ${key.id} 余额失败:`, error.message);
        }
        
        // 避免请求过频
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } finally {
      this.isRunning = false;
    }
  }

  // 更新单个key的余额
  async updateSingleKeyBalance(key) {
    try {
      const resp = await fetch('https://api.siliconflow.cn/v1/user/info', {
        headers: { Authorization: `Bearer ${key.id}` },
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const result = await resp.json();
      const data = result.data || {};

      // 保存到数据库
      await db.saveApiKey(key.id, this.hashApiKey(key.id), {
        balance: parseFloat(data.balance || 0),
        chargeBalance: parseFloat(data.chargeBalance || 0),
        totalBalance: parseFloat(data.totalBalance || 0)
      });

      // 记录余额变化
      await this.recordBalanceChange(key.id, key.balance || 0, parseFloat(data.balance || 0));

      // 更新key对象
      key.balance = parseFloat(data.balance || 0);
      key.chargeBalance = parseFloat(data.chargeBalance || 0);
      key.totalBalance = parseFloat(data.totalBalance || 0);
      key.lastBalanceCheck = new Date().toISOString();
      key.status = data.status || 'unknown';

    } catch (error) {
      console.error(`[Stats] 获取key ${key.id} 余额失败:`, error.message);
      key.errors = (key.errors || 0) + 1;
    }
  }

  // 记录API调用使用数据
  async recordApiUsage(keyId, usageData) {
    try {
      const {
        tokensPrompt = 0,
        tokensCompletion = 0,
        status = 200,
        errorMessage = null,
        requestType = 'chat-completions',
        cost = this.calculateCost(tokensPrompt + tokensCompletion)
      } = usageData;

      const totalTokens = tokensPrompt + tokensCompletion;
      const key = global.sharedKeys?.find(k => k.id === keyId);
      const balanceBefore = key?.balance || 0;

      // 记录使用记录
      await db.recordUsage(keyId, {
        tokensPrompt,
        tokensCompletion,
        tokensTotal: totalTokens,
        cost,
        balanceBefore,
        balanceAfter: balanceBefore - cost,
        requestType,
        status,
        errorMessage
      });

      if (key) {
        key.balance = balanceBefore - cost;
        key.calls = (key.calls || 0) + 1;
        
        if (status >= 400) {
          key.errors = (key.errors || 0) + 1;
        }
      }

      // 更新统计
      const now = new Date();
      await db.updateStats(keyId, {
        tokensPrompt,
        tokensCompletion,
        tokensTotal: totalTokens,
        cost,
        calls: 1
      }, now);

    } catch (error) {
      console.error('[Stats] 记录API使用数据失败:', error.message);
    }
  }

  // 记录余额变化
  async recordBalanceChange(keyId, balanceBefore, balanceAfter) {
    try {
      const change = balanceAfter - balanceBefore;
      if (Math.abs(change) > 0.0001) {  // 只有当变化足够大时才记录
        await db.saveApiKey(keyId, this.hashApiKey(keyId), {
          balance: balanceAfter
        });
      }
    } catch (error) {
      console.error('[Stats] 记录余额变化失败:', error.message);
    }
  }

  // 计算API调用成本（基于SiliconFlow定价）
  calculateCost(tokens, model = 'general') {
    // SiliconFlow定价：每1000 tokens约0.0014美元≈0.01元人民币
    const ratePer1K = 0.01;  // 元
    return (tokens / 1000) * ratePer1K;
  }

  // 更新每日统计数据
  async updateDailyStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // 获取今天的激活key数量
      const activeKeys = global.sharedKeys?.filter(k => k.enabled && k.balance > 0).length || 0;
      
      // 更新每日统计数据
      const sql = `
        UPDATE daily_stats SET 
          active_keys = ?,
          disabled_keys = (SELECT COUNT(*) FROM disabled_keys)
        WHERE date = ?
      `;
      
      await new Promise((resolve, reject) => {
        db.db.run(sql, [activeKeys, today], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

    } catch (error) {
      console.error('[Stats] 更新每日统计数据失败:', error.message);
    }
  }

  // 清理过期数据
  async cleanupOldData() {
    try {
      // 删除90天前的使用记录
      const deleteUsages = new Promise((resolve, reject) => {
        const sql = `DELETE FROM usage_records WHERE timestamp < datetime('now', '-90 days')`;
        db.db.run(sql, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });

      // 删除90天前的token使用统计
      const deleteTokenUsage = new Promise((resolve, reject) => {
        const sql = `DELETE FROM token_usage WHERE date < date('now', '-90 days')`;
        db.db.run(sql, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });

      // 删除90天前的每日统计
      const deleteDailyStats = new Promise((resolve, reject) => {
        const sql = `DELETE FROM daily_stats WHERE date < date('now', '-90 days')`;
        db.db.run(sql, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });

      const [deletedUsages, deletedTokenUsage, deletedDailyStats] = await Promise.all([
        deleteUsages, deleteTokenUsage, deleteDailyStats
      ]);

      console.log(`[Stats] 清理过期数据完成: 删除记录 ${deletedUsages}, 删除token统计 ${deletedTokenUsage}, 删除每日统计 ${deletedDailyStats}`);

    } catch (error) {
      console.error('[Stats] 清理过期数据失败:', error.message);
    }
  }

  // 获取全局统计数据
  async getGlobalStats() {
    try {
      const stats = await db.getStatsSummary();
      const dailyStats = await db.getDailyStats(7);
      const hourlyStats = await db.getHourlyStats(24);

      return {
        ...stats,
        dailyTrend: dailyStats,
        hourlyTrend: hourlyStats,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Stats] 获取全局统计数据失败:', error.message);
      return null;
    }
  }

  // 获取单个Key的详细统计
  async getKeyStats(keyId) {
    try {
      const keyData = await db.getApiKey(keyId);
      const stats = await db.getKeyUsageStats(keyId);
      const tokenTrend = await db.getKeyTokensByDateRange(
        keyId, 
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );

      return {
        keyData,
        stats,
        tokenTrend,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Stats] 获取Key统计数据失败:', error.message);
      return null;
    }
  }
}

// 创建全局实例
export const statsCollector = new StatsCollector();

// 监听key更新事件
export function updateSharedKeys(keys) {
  global.sharedKeys = keys;
}

export default StatsCollector;