'use strict';

/**
 * AutoBot Pro — WhatsApp × Shopify × WordPress Automation
 * WhatsApp: Baileys (QR-based) + Socket.IO
 */

require('dotenv').config();
const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const crypto    = require('crypto');
const cors      = require('cors');
const path      = require('path');

const wa            = require('./services/baileys');
const shopifyHandler = require('./handlers/shopify');
const settingsRoute  = require('./routes/settings');
const statusRoute    = require('./routes/status');
const { log }        = require('./utils/logger');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Inject Socket.IO into WA service
wa.setIo(io);

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'x-api-key'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve dashboard HTML if it exists
app.use(express.static(path.join(__dirname, '../public')));

// ─── Dashboard API ───────────────────────────────────────────────
app.use('/api', statusRoute);
app.use('/api/settings', settingsRoute);

// ─── WhatsApp REST API ───────────────────────────────────────────
app.post('/api/wa/test', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  try {
    await wa.sendMessage(phone, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/wa/status', (req, res) => {
  res.json({ connected: wa.isConnected() });
});

// ─── WhatsApp Webhook (Meta — kept for fallback) ─────────────────
app.get('/webhook/whatsapp', (req, res) => {
  const mode  = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200);
});

// ─── Shopify Webhooks ────────────────────────────────────────────
function verifyShopifyHmac(req) {
  const hmac   = req.headers['x-shopify-hmac-sha256'];
  const body   = JSON.stringify(req.body);
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET || '')
    .update(body, 'utf8')
    .digest('base64');
  return hmac === digest;
}

app.post('/webhook/shopify/order-created', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderCreated(req.body); }
  catch (err) { log('❌ order-created: ' + err.message); }
});

app.post('/webhook/shopify/order-fulfilled', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderFulfilled(req.body); }
  catch (err) { log('❌ order-fulfilled: ' + err.message); }
});

app.post('/webhook/shopify/order-cancelled', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderCancelled(req.body); }
  catch (err) { log('❌ order-cancelled: ' + err.message); }
});

app.post('/webhook/shopify/cart-abandoned', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onCartAbandoned(req.body); }
  catch (err) { log('❌ cart-abandoned: ' + err.message); }
});

app.post('/webhook/shopify/product-created', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onProductCreated(req.body); }
  catch (err) { log('❌ product-created: ' + err.message); }
});

// ─── Health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.2', waConnected: wa.isConnected(), timestamp: new Date().toISOString() });
});

// ─── Socket.IO ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  log('🔌 Dashboard connected');

  // Send current WA status immediately on connect
  socket.emit('status', { status: wa.isConnected() ? 'connected' : 'disconnected' });
  if (wa.isConnected()) {
    socket.emit('message_history', wa.msgLog);
  }

  // Client requests disconnect
  socket.on('disconnect_wa', async () => {
    await wa.disconnect();
    log('🔌 WA disconnected via dashboard');
  });

  socket.on('disconnect', () => {
    log('🔌 Dashboard disconnected');
  });
});

// ─── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
server.listen(PORT, async () => {
  log(`🚀 AutoBot Pro running on port ${PORT}`);
  // Start Baileys WA session automatically
  try {
    await wa.startSession();
    log('📱 WhatsApp session starting...');
  } catch (err) {
    log('⚠ WA session error: ' + err.message);
  }
});

