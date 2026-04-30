/**
 * Shopify Admin API Integration
 * Direct REST API calls — no third-party SDK
 */

const https   = require('https');
const { log } = require('../utils/logger');

const STORE   = process.env.SHOPIFY_STORE;   // e.g. "mystore.myshopify.com"
const TOKEN   = process.env.SHOPIFY_TOKEN;   // Admin API access token

// ─── Core request helper ───────────────────────────────────────────────────

async function shopifyRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data    = body ? JSON.stringify(body) : null;
    const options = {
      hostname: STORE,
      path:     `/admin/api/2024-01${path}`,
      method,
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type':           'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Get order by order number ─────────────────────────────────────────────

async function getOrderByNumber(orderNumber) {
  const { orders } = await shopifyRequest('GET',
    `/orders.json?name=%23${orderNumber}&status=any`
  );
  return orders?.[0] || null;
}

// ─── Get order by ID ───────────────────────────────────────────────────────

async function getOrderById(id) {
  const { order } = await shopifyRequest('GET', `/orders/${id}.json`);
  return order;
}

// ─── Get all recent orders ─────────────────────────────────────────────────

async function getRecentOrders(limit = 10) {
  const { orders } = await shopifyRequest('GET',
    `/orders.json?status=any&limit=${limit}&order=created_at+desc`
  );
  return orders || [];
}

// ─── Get products ──────────────────────────────────────────────────────────

async function getProducts(limit = 10) {
  const { products } = await shopifyRequest('GET',
    `/products.json?limit=${limit}&published_status=published`
  );
  return products || [];
}

// ─── Get customer by phone ─────────────────────────────────────────────────

async function getCustomerByPhone(phone) {
  const { customers } = await shopifyRequest('GET',
    `/customers/search.json?query=phone:${phone}`
  );
  return customers?.[0] || null;
}

// ─── Get customer orders ───────────────────────────────────────────────────

async function getCustomerOrders(customerId) {
  const { orders } = await shopifyRequest('GET',
    `/orders.json?customer_id=${customerId}&status=any`
  );
  return orders || [];
}

// ─── Create discount code ──────────────────────────────────────────────────

async function createDiscountCode(priceRuleId, code) {
  const { discount_code } = await shopifyRequest('POST',
    `/price_rules/${priceRuleId}/discount_codes.json`,
    { discount_code: { code } }
  );
  return discount_code;
}

// ─── Register webhooks programmatically ───────────────────────────────────

async function registerWebhooks(baseUrl) {
  const topics = [
    { topic: 'orders/create',    address: `${baseUrl}/webhook/shopify/order-created`   },
    { topic: 'orders/fulfilled', address: `${baseUrl}/webhook/shopify/order-fulfilled` },
    { topic: 'orders/cancelled', address: `${baseUrl}/webhook/shopify/order-cancelled` },
    { topic: 'checkouts/create', address: `${baseUrl}/webhook/shopify/cart-abandoned`  },
    { topic: 'products/create',  address: `${baseUrl}/webhook/shopify/product-created` },
  ];

  for (const wh of topics) {
    const result = await shopifyRequest('POST', '/webhooks.json', {
      webhook: { topic: wh.topic, address: wh.address, format: 'json' }
    });
    log(`✅ Webhook registered: ${wh.topic}`);
  }
}

module.exports = {
  getOrderByNumber,
  getOrderById,
  getRecentOrders,
  getProducts,
  getCustomerByPhone,
  getCustomerOrders,
  createDiscountCode,
  registerWebhooks
};
