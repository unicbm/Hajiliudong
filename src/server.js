import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fetch } from 'undici';
import { KeyManager } from './keyManager.js';
import { delay } from './util.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT) || 11435;
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1/';
const MAX_TRIES_PER_REQUEST = parseInt(process.env.MAX_TRIES_PER_REQUEST) || 6;
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS) || 60;
const ENABLE_STREAMING = process.env.ENABLE_STREAMING !== 'false';

// Initialize key manager
const keyManager = KeyManager.fromEnv();

// Initialize Express app
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  const health = keyManager.health();
  res.json(health);
});

// Main proxy endpoint - handles all /v1/* routes
app.all('/v1/*', async (req, res) => {
  const targetPath = req.path.replace(/^\/v1\//, '');
  const upstreamUrl = `${SILICONFLOW_BASE_URL}${targetPath}`;
  
  let attempts = 0;
  let lastError = null;

  while (attempts < MAX_TRIES_PER_REQUEST) {
    attempts++;
    
    const kinfo = keyManager.nextUsable();
    if (!kinfo) {
      return res.status(503).json({
        error: {
          message: `All keys exhausted. ${MAX_TRIES_PER_REQUEST} attempts made.`,
          details: keyManager.health()
        }
      });
    }

    try {
      // Prepare headers
      const headers = { ...req.headers };
      
      // Remove problematic headers
      delete headers.host;
      delete headers['content-length'];
      delete headers.authorization;
      delete headers.connection;
      
      // Set correct authorization and content-type
      headers['authorization'] = `Bearer ${kinfo.key}`;
      headers['content-type'] = headers['content-type'] || 'application/json';
      headers['accept'] = headers['accept'] || 'application/json';

      // Prepare request options
      const options = {
        method: req.method,
        headers
      };

      // Add body for non-GET/HEAD requests
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = JSON.stringify(req.body);
      }

      console.log(`[REQUEST] Attempt ${attempts}/${MAX_TRIES_PER_REQUEST} using key ${kinfo.id}`);
      
      const response = await fetch(upstreamUrl, options);
      const contentType = response.headers.get('content-type') || '';

      // Handle streaming responses
      if (ENABLE_STREAMING && contentType.includes('text/event-stream')) {
        console.log('[STREAM] Streaming response detected');
        
        // Set response headers
        res.status(response.status);
        response.headers.forEach((value, name) => {
          if (name.toLowerCase() !== 'transfer-encoding' && 
              name.toLowerCase() !== 'content-encoding') {
            res.setHeader(name, value);
          }
        });
        res.setHeader('x-rotator-key-id', kinfo.id);

        // Pipe the stream
        const reader = response.body.getReader();
        keyManager.markOk(kinfo);
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch (streamError) {
          console.error('[STREAM] Error reading stream:', streamError);
        } finally {
          res.end();
        }
        return;
      }

      // Handle regular responses
      const text = await response.text();
      
      if (response.ok) {
        keyManager.markOk(kinfo);
        
        // Set response headers
        res.status(response.status);
        response.headers.forEach((value, name) => {
          if (name.toLowerCase() !== 'transfer-encoding' && 
              name.toLowerCase() !== 'content-encoding') {
            res.setHeader(name, value);
          }
        });
        res.setHeader('x-rotator-key-id', kinfo.id);
        
        res.send(text);
        return;
      }

      // Handle errors
      lastError = `${response.status} ${response.statusText}`;
      
      // Check for permanent failures
      if (response.status === 401 || response.status === 402) {
        keyManager.markFail(kinfo, `${response.status} ${response.statusText}`, { permanent: true });
        continue;
      }
      
      // Check for temporary failures
      if (response.status === 429 || response.status >= 500) {
        keyManager.markFail(kinfo, `${response.status} ${response.statusText}`, { permanent: false });
        await delay(150);
        continue;
      }

      // Other 4xx errors - return to client
      keyManager.markFail(kinfo, `${response.status} ${response.statusText}`, { permanent: false });
      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'transfer-encoding' && 
            name.toLowerCase() !== 'content-encoding') {
          res.setHeader(name, value);
        }
      });
      res.send(text);
      return;

    } catch (error) {
      // Network or other errors
      lastError = error.message;
      console.error(`[ERROR] Network error: ${error.message}`);
      keyManager.markFail(kinfo, `Network error: ${error.message}`, { permanent: false });
      await delay(150);
    }
  }

  // All retries exhausted
  res.status(503).json({
    error: {
      message: `All ${MAX_TRIES_PER_REQUEST} attempts exhausted. Last error: ${lastError}`,
      details: keyManager.health()
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      details: err.message
    }
  });
});

// Start server
app.listen(PORT, 'localhost', () => {
  console.log('='.repeat(60));
  console.log(`🔄 SiliconFlow Key Rotator Started`);
  console.log('='.repeat(60));
  console.log(`📍 Local: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`🌐 Upstream: ${SILICONFLOW_BASE_URL}`);
  console.log(`🔑 Keys loaded: ${keyManager.keys.length}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  
  // 启动余额检查器（每5分钟检查一次）
  keyManager.startBalanceChecker(5);
});