'use strict';
/**
 * Drop this file into your Railway bot as: routes/settings.js
 * Then in server.js add:
 *   const settingsRoute = require('./routes/settings');
 *   app.use('/api/settings', settingsRoute);
 *
 * Uses a simple JSON file as a lightweight store.
 * Swap readSettings/writeSettings with your DB if you have one.
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

function readSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return getDefaults();
  }
}

function writeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function getDefaults() {
  return {
    confirmation: {
      enabled: true,
      delayMinutes: 5,
      paymentStatuses: { paid: true, pending: true, cod: false },
      message: "Hello {customer_name}! 👋\n\nYour order *#{order_number}* for *{amount}* has been placed.\n\nPlease confirm your order below:",
      pollOptions: [
        { label: "✅ Confirm Order", tag: "CONFIRM", response: "Great! Your order #{order_number} is confirmed. We'll ship it soon! 🚀" },
        { label: "❌ Cancel Order",  tag: "CANCEL",  response: "We've cancelled your order #{order_number}. Contact us if you need help." },
        { label: "📞 Call Me",       tag: "CALL",    response: "Our team will call you shortly regarding order #{order_number}." },
      ],
    },
    fulfillment: {
      enabled: true,
      trigger: 'on_fulfillment',
      includeTrackingLink: true,
      message: "Hi {customer_name}! 🎉 Your order *#{order_number}* has been fulfilled!\nTracking: {tracking_number} 📦",
    },
    cancellation: {
      enabled: true,
      notifyCustomer: true,
      notifyAdmin: true,
      message: "Hi {customer_name},\n\nYour order *#{order_number}* has been cancelled.\nReason: {cancel_reason}\nRefund: {refund_amount} in 3-5 days. 💙",
      reasons: ['Out of stock', 'Customer request', 'Payment failed', 'Fraud suspected'],
    },
    orderNotifications: {
      placed:    { enabled: true,  message: "Hi {customer_name}! 🛍️ Order #{order_number} placed. Total: {amount}" },
      paid:      { enabled: true,  message: "Payment received for order #{order_number}. Thank you! ✅" },
      fulfilled: { enabled: true,  message: "Order #{order_number} is on its way! Track: {tracking_url} 📦" },
      delivered: { enabled: false, message: "Your order #{order_number} has been delivered! 🎉" },
      refunded:  { enabled: true,  message: "Refund of {refund_amount} processed for order #{order_number}." },
    },
    adminNotifications: {
      adminPhone: process.env.ADMIN_PHONE || '',
      events: { new_order: true, cancellation: true, failed_payment: true, low_stock: false, new_review: false },
      dailySummary: { enabled: false, time: '09:00' },
    },
    abandonedCart: {
      enabled: true,
      firstMessageDelayMinutes: 60,
      discountCode: '',
      firstMessage: "Hey {customer_name}! 👀 Your cart ({cart_items}) worth *{cart_total}* is waiting.\n{checkout_url} 🛒",
      followUp: {
        enabled: true,
        delayMinutes: 1440,
        message: "Hi {customer_name}! Last chance 🔥 Use *SAVE10* for 10% off.\n{checkout_url}",
      },
    },
  };
}

/* Simple API key guard — add API_KEY=<random> to your Railway env vars */
function guard(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (process.env.API_KEY && key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/* GET /api/settings */
router.get('/', guard, (req, res) => {
  res.json(readSettings());
});

/* PATCH /api/settings/:section */
router.patch('/:section', guard, (req, res) => {
  const allowed = ['confirmation','fulfillment','cancellation','orderNotifications','adminNotifications','abandonedCart'];
  if (!allowed.includes(req.params.section)) return res.status(400).json({ error: 'Unknown section' });
  const current = readSettings();
  current[req.params.section] = { ...current[req.params.section], ...req.body };
  writeSettings(current);
  res.json({ ok: true, section: req.params.section, data: current[req.params.section] });
});

/* PUT /api/settings — full replace */
router.put('/', guard, (req, res) => {
  writeSettings(req.body);
  res.json({ ok: true });
});

module.exports = router;
