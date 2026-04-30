/**
 * WhatsApp Business API Integration
 * Direct Meta Cloud API calls — no third-party wrapper
 */

const https = require('https');
const { log } = require('../utils/logger');

const BASE_URL  = 'https://graph.facebook.com/v19.0';
const PHONE_ID  = process.env.WA_PHONE_NUMBER_ID;
const TOKEN     = process.env.WA_ACCESS_TOKEN;

// ─── Core send function ────────────────────────────────────────────────────

async function sendRequest(endpoint, body) {
  const data = JSON.stringify(body);
  const url  = `${BASE_URL}/${endpoint}`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(data),
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.error) {
            log(`❌ WA API error: ${json.error.message}`);
            reject(new Error(json.error.message));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Send plain text message ───────────────────────────────────────────────

async function sendText(to, text) {
  if (!PHONE_ID || !TOKEN) {
    log(`[DEV] Would send to ${to}: ${text.slice(0, 60)}...`);
    return;
  }
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text }
  });
}

// ─── Send interactive list (menu) ──────────────────────────────────────────

async function sendInteractiveList(to, header, body, buttonLabel, sections) {
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'list',
      header: { type: 'text', text: header },
      body:   { text: body },
      action: { button: buttonLabel, sections }
    }
  });
}

// ─── Send interactive quick reply buttons ─────────────────────────────────

async function sendButtons(to, bodyText, buttons) {
  // buttons = [{ id: 'btn1', title: 'Yes' }, ...]
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(b => ({
          type:  'reply',
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  });
}

// ─── Send image message ────────────────────────────────────────────────────

async function sendImage(to, imageUrl, caption = '') {
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'image',
    image: { link: imageUrl, caption }
  });
}

// ─── Send template message (for order notifications) ──────────────────────

async function sendTemplate(to, templateName, languageCode, components = []) {
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: languageCode || 'en_US' },
      components
    }
  });
}

// ─── Mark message as read ──────────────────────────────────────────────────

async function markAsRead(messageId) {
  return sendRequest(`${PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    status:            'read',
    message_id:        messageId
  });
}

module.exports = { sendText, sendInteractiveList, sendButtons, sendImage, sendTemplate, markAsRead };
