/**
 * AutoBot Pro — WhatsApp × Shopify × WordPress Automation
 * No third-party middleware. Direct API integrations only.
 * (c) Your Agency Name — White-label ready
 */

require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const cors    = require('cors');
const app     = express();

const whatsappHandler = require('./handlers/whatsapp');
const shopifyHandler  = require('./handlers/shopify');
const settingsRoute   = require('./routes/settings');
const statusRoute     = require('./routes/status');
const { log }         = require('./utils/logger');

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'x-api-key'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Dashboard API ──────────────────────────────────────────────────────────
app.use('/api', statusRoute);
app.use('/api/settings', settingsRoute);

// ─── WhatsApp Webhook ───────────────────────────────────────────────────────
app.get('/webhook/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200);
  try {
    await whatsappHandler.handleIncoming(req.body);
  } catch (err) {
    log('❌ WhatsApp handler error: ' + err.message);
  }
});

// ─── Shopify Webhooks ───────────────────────────────────────────────────────
function verifyShopifyHmac(req) {
  const hmac   = req.headers['x-shopify-hmac-sha256'];
  const body   = JSON.stringify(req.body);
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hmac === digest;
}

app.post('/webhook/shopify/order-created', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderCreated(req.body); }
  catch (err) { log('❌ Shopify order-created error: ' + err.message); }
});

app.post('/webhook/shopify/order-fulfilled', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderFulfilled(req.body); }
  catch (err) { log('❌ Shopify order-fulfilled error: ' + err.message); }
});

app.post('/webhook/shopify/order-cancelled', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onOrderCancelled(req.body); }
  catch (err) { log('❌ Shopify order-cancelled error: ' + err.message); }
});

app.post('/webhook/shopify/cart-abandoned', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onCartAbandoned(req.body); }
  catch (err) { log('❌ Shopify cart-abandoned error: ' + err.message); }
});

app.post('/webhook/shopify/product-created', async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try { await shopifyHandler.onProductCreated(req.body); }
  catch (err) { log('❌ Shopify product-created error: ' + err.message); }
});

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.1', timestamp: new Date().toISOString() });
});

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => log(`🚀 AutoBot Pro running on port ${PORT}`));
