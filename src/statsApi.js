import express from 'express';
import { db } from './database.js';
import { statsCollector } from './statsCollector.js';

const router = express.Router();

// 全局统计数据
router.get('/stats/global', async (req, res) => {
  try {
    const stats = await statsCollector.getGlobalStats();
    if (!stats) {
      return res.status(500).json({ error: '无法获取统计数据' });
    }

    // 获取key列表进行补充统计
    const keysData = global.sharedKeys || [];
    const enabledKeys = keysData.filter(k => k.enabled && k.balance > 0);
    const disabledKeys = await db.getDisabledKeys();

    // 计算总消耗
    const totalCost = keysData.reduce((sum, key) => {
      // 这是一个估算，实际需要根据历史记录计算
      return sum + (key.totalBalance || 0) - (key.balance || 0);
    }, 0);

    const response = {
      success: true,
      data: {
        totalKeys: keysData.length,
        enabledKeys: enabledKeys.length,
        disabledKeys: disabledKeys.length,
        totalBalance: keysData.reduce((sum, k) => sum + (k.balance || 0), 0),
        totalTokens: stats.today_tokens || 0,
        todayCalls: stats.today_calls || 0,
        todayCost: stats.today_cost || 0,
        todayTokens: stats.today_tokens || 0,
        totalCost,
        trends: {
          daily: stats.dailyTrend || [],
          hourly: stats.hourlyTrend || []
        },
        lastUpdated: stats.lastUpdated
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取全局统计数据错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 单个key统计
router.get('/stats/key/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const stats = await statsCollector.getKeyStats(keyId);
    
    if (!stats) {
      return res.status(404).json({ success: false, error: 'Key不存在' });
    }

    const keyData = (global.sharedKeys || []).find(k => k.id === keyId);
    if (!keyData) {
      return res.status(404).json({ success: false, error: 'Key不在列表中' });
    }

    const response = {
      success: true,
      data: {
        key: {
          id: keyData.id,
          balance: keyData.balance || 0,
          totalBalance: keyData.totalBalance || 0,
          enabled: keyData.enabled,
          lastCall: keyData.lastCall,
          errors: keyData.errors || 0
        },
        stats: {
          totalCalls: stats.stats.total_calls || 0,
          totalTokens: stats.stats.total_tokens || 0,
          totalCost: stats.stats.total_cost || 0,
          avgTokensPerCall: stats.stats.avg_tokens_per_call || 0,
          tokenTrend: stats.tokenTrend || []
        },
        lastUpdated: stats.lastUpdated
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取Key统计数据错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取历史趋势数据
router.get('/stats/history', async (req, res) => {
  try {
    const { type = 'daily', range = 7, keyId } = req.query;
    
    let data;
    let title;
    
    switch (type) {
      case 'hourly':
        data = await db.getHourlyStats(Math.min(parseInt(range), 168)); // 最大7天
        title = '每小时趋势';
        break;
      case 'daily':
      default:
        data = await db.getDailyStats(Math.min(parseInt(range), 30)); // 最大30天
        title = '每日趋势';
        break;
    }

    // 如果指定了keyId，过滤特定key的数据
    if (keyId) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(range));
      
      if (type === 'daily') {
        data = await db.getKeyTokensByDateRange(
          keyId,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );
      }
    }

    const response = {
      success: true,
      data: {
        type,
        range: parseInt(range),
        keyId: keyId || null,
        title,
        data: data || [],
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取历史趋势数据错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取key使用排行
router.get('/stats/ranking', async (req, {
  res}) => {
  try {
    const { metric = 'tokens', limit = 10 } = req.query;
    
    let sql, params = [];
    
    switch (metric) {
      case 'calls':
        sql = `
          SELECT key_id, SUM(calls_count) as value
          FROM token_usage
          GROUP BY key_id
          ORDER BY value DESC
          LIMIT ?
        `;
        break;
      case 'cost':
        sql = `
          SELECT key_id, SUM(tokens_total * 0.0014 / 1000) as value
          FROM token_usage
          GROUP BY key_id
          ORDER BY value DESC
          LIMIT ?
        `;
        break;
      case 'tokens':
      default:
        sql = `
          SELECT key_id, SUM(tokens_total) as value
          FROM token_usage
          GROUP BY key_id
          ORDER BY value DESC
          LIMIT ?
        `;
        break;
    }
    
    params.push(Math.min(parseInt(limit), 50));

    const data = await new Promise((resolve, reject) => {
      db.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // 添加key的显示名称
    const rankingData = data.map(item => {
      const key = (global.sharedKeys || []).find(k => k.id === item.key_id);
      return {
        keyId: item.key_id,
        displayName: key ? `${key.id.slice(0, 8)}...${key.id.slice(-4)}` : item.key_id.slice(0, 12) + '...',
        value: item.value,
        unit: metric === 'tokens' ? 'tokens' : metric === 'calls' ? '次' : '元'
      };
    });

    const response = {
      success: true,
      data: {
        metric,
        unit: metric === 'tokens' ? 'tokens' : metric === 'calls' ? '次' : '元',
        ranking: rankingData,
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取排行数据错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取余额分布
router.get('/stats/balance-distribution', async (req, res) => {
  try {
    const keysData = global.sharedKeys || [];
    const enabledKeys = keysData.filter(k => k.enabled && k.balance > 0);
    
    const distribution = enabledKeys.map(key => ({
      keyId: key.id,
      displayName: key.id.slice(0, 8) + '...' + key.id.slice(-4),
      balance: key.balance || 0,
      percentage: 0  // 由前端计算
    }));

    const totalBalance = enabledKeys.reduce((sum, k) => sum + k.balance, 0);
    
    const response = {
      success: true,
      data: {
        distribution,
        totalBalance,
        enabledKeysCount: enabledKeys.length,
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取余额分布错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 禁用Key
router.post('/keys/:keyId/disable', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { reason = '用户手动禁用' } = req.body;

    // 检查key是否存在
    const key = (global.sharedKeys || []).find(k => k.id === keyId);
    if (!key) {
      return res.status(404).json({ success: false, error: 'Key不存在' });
    }

    // 禁用key
    await db.disableKey(keyId, reason);
    
    // 更新key状态
    key.enabled = false;

    console.log(`[API] Key ${keyId} 已被禁用，原因: ${reason}`);

    res.json({ 
      success: true, 
      message: 'Key已禁用',
      key: {
        id: keyId,
        enabled: key.enabled,
        disabledAt: new Date().toISOString(),
        reason
      }
    });
  } catch (error) {
    console.error('[API] 禁用Key错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 启用Key
router.post('/keys/:keyId/enable', async (req, res) => {
  try {
    const { keyId } = req.params;

    // 检查key是否存在
    const key = (global.sharedKeys || []).find(k => k.id === keyId);
    if (!key) {
      return res.status(404).json({ success: false, error: 'Key不存在' });
    }

    // 启用key
    await db.enableKey(keyId);
    
    // 更新key状态
    key.enabled = true;

    console.log(`[API] Key ${keyId} 已被启用`);

    res.json({ 
      success: true, 
      message: 'Key已启用',
      key: {
        id: keyId,
        enabled: key.enabled,
        enabledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[API] 启用Key错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取禁用Key列表
router.get('/keys/disabled', async (req, res) => {
  try {
    const disabledKeys = await db.getDisabledKeys();
    
    const response = {
      success: true,
      data: {
        disabledKeys,
        count: disabledKeys.length,
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[API] 获取禁用Key列表错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出统计数据
router.get('/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { type = 'all', keyId } = req.query;

    let data;
    let filename;
    let contentType;

    switch (type) {
      case 'daily':
        data = await db.getDailyStats(90);
        filename = `daily_stats_${new Date().toISOString().slice(0, 10)}`;
        contentType = 'application/json';
        break;
      case 'key':
        if (keyId) {
          data = await statsCollector.getKeyStats(keyId);
          filename = `key_stats_${keyId}_${new Date().toISOString().slice(0, 10)}`;
        } else {
          return res.status(400).json({ success: false, error: '需要指定keyId' });
        }
        break;
      case 'all':
      default:
        data = await statsCollector.getGlobalStats();
        filename = `global_stats_${new Date().toISOString().slice(0, 10)}`;
        break;
    }

    if (format === 'csv') {
      contentType = 'text/csv';
      filename += '.csv';
      
      // 简单CSV转换
      if (Array.isArray(data)) {
        if (data.length > 0) {
          const headers = Object.keys(data[0]).join(',');
          const rows = data.map(row => Object.values(row).join(','));
          data = [headers, ...rows].join('\n');
        } else {
          data = 'No data\';
        }
      } else {
        data = JSON.stringify(data, null, 2);
      }
    } else {
      contentType = 'application/json';
      filename += '.json';
      data = JSON.stringify(data, null, 2);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(data);

  } catch (error) {
    console.error('[API] 导出统计数据错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;