'use strict';
/**
 * Drop this file into your Railway bot as: routes/status.js
 * Then in server.js add:
 *   const statusRoute = require('./routes/status');
 *   app.use('/api', statusRoute);
 */
const express = require('express');
const router  = express.Router();

/* GET /api/status — called by the frontend dashboard */
router.get('/status', (req, res) => {
  res.json({
    ok: true,
    version: '2.1',
    waMethod: 'meta-cloud-api',          // tells the frontend which WA mode
    waConnected: !!process.env.WA_PHONE_NUMBER_ID && !!process.env.WA_ACCESS_TOKEN,
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || null,
    shopifyConfigured: !!process.env.SHOPIFY_WEBHOOK_SECRET,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
