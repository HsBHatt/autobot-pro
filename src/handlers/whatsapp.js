/**
 * WhatsApp Incoming Message Handler
 * Handles all inbound messages and routes them to the bot engine
 */

const whatsapp  = require('../integrations/whatsapp');
const shopify   = require('../integrations/shopify');
const wordpress = require('../integrations/wordpress');
const sessions  = require('../utils/sessions');
const { log }   = require('../utils/logger');

// ─── Bot menu definitions ──────────────────────────────────────────────────

const MAIN_MENU = `Welcome to *${process.env.BUSINESS_NAME || 'Our Store'}*! 👋

Please choose an option:

*1* — Check order status
*2* — Track my shipment
*3* — Browse products
*4* — Talk to an agent
*5* — Publish blog post (admin only)

Reply with the number or keyword.`;

const ADMIN_PHONES = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim());

// ─── Main handler ──────────────────────────────────────────────────────────

async function handleIncoming(payload) {
  const entry   = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;

  if (value?.statuses) return; // ignore delivery receipts

  const message = value?.messages?.[0];
  if (!message) return;

  const from    = message.from;                          // e.g. "923001234567"
  const type    = message.type;                          // text | interactive | image
  const msgText = message.text?.body?.trim() || '';

  log(`📨 WA from ${from}: "${msgText}"`);

  const session = sessions.get(from);

  // ── Route by session state ──────────────────────────────────────────────

  if (session.state === 'AWAIT_ORDER_NUMBER') {
    return handleOrderLookup(from, msgText, session);
  }

  if (session.state === 'AWAIT_BLOG_TITLE') {
    return handleBlogTitle(from, msgText, session);
  }

  if (session.state === 'AWAIT_BLOG_CONTENT') {
    return handleBlogContent(from, msgText, session);
  }

  // ── Route by keyword / number ────────────────────────────────────────────

  const lower = msgText.toLowerCase();
  const num   = msgText.trim();

  if (['hi','hello','hey','start','menu','1','2','3','4','5',
       'order','track','products','agent','post blog','help'].some(k => lower.includes(k))) {

    if (num === '1' || lower.includes('order') || lower.includes('status')) {
      await whatsapp.sendText(from, '🔍 Please reply with your *order number* (e.g. #1042):');
      sessions.setState(from, 'AWAIT_ORDER_NUMBER');
      return;
    }

    if (num === '2' || lower.includes('track')) {
      await whatsapp.sendText(from, '📦 Please reply with your *order number* to get tracking info:');
      sessions.setState(from, 'AWAIT_ORDER_NUMBER', { mode: 'tracking' });
      return;
    }

    if (num === '3' || lower.includes('product') || lower.includes('browse')) {
      return handleProductCatalog(from);
    }

    if (num === '4' || lower.includes('agent') || lower.includes('human')) {
      return handleLiveAgent(from);
    }

    if (num === '5' || lower.includes('post blog') || lower.includes('publish')) {
      if (!ADMIN_PHONES.includes(from)) {
        await whatsapp.sendText(from, '⛔ This feature is for admins only.');
        return;
      }
      await whatsapp.sendText(from, '📝 Please reply with the *title* of your blog post:');
      sessions.setState(from, 'AWAIT_BLOG_TITLE');
      return;
    }
  }

  // Default: show menu
  await whatsapp.sendText(from, MAIN_MENU);
  sessions.clear(from);
}

// ─── Order lookup ──────────────────────────────────────────────────────────

async function handleOrderLookup(from, text, session) {
  const orderNum = text.replace('#', '').trim();
  sessions.clear(from);

  try {
    const order = await shopify.getOrderByNumber(orderNum);
    if (!order) {
      await whatsapp.sendText(from, `❌ Order #${orderNum} not found. Please check the number and try again.\n\nReply *MENU* to go back.`);
      return;
    }

    const product = order.line_items.map(i => `${i.name} x${i.quantity}`).join(', ');
    const total   = `${order.currency} ${order.total_price}`;
    const status  = order.fulfillment_status || 'Processing';
    const tracking = order.fulfillments?.[0]?.tracking_number || 'Not yet shipped';

    if (session.data?.mode === 'tracking') {
      await whatsapp.sendText(from,
        `🚚 *Order #${orderNum} Tracking*\n\n` +
        `Status: *${status}*\n` +
        `Tracking number: *${tracking}*\n` +
        `Carrier: ${order.fulfillments?.[0]?.tracking_company || 'Pending'}\n\n` +
        `Reply *MENU* for more options.`
      );
    } else {
      await whatsapp.sendText(from,
        `✅ *Order #${orderNum} Details*\n\n` +
        `📦 Products: ${product}\n` +
        `💰 Total: ${total}\n` +
        `📍 Status: *${status}*\n` +
        `🚚 Tracking: ${tracking}\n\n` +
        `Reply *MENU* for more options.`
      );
    }
  } catch (err) {
    log('Order lookup error: ' + err.message);
    await whatsapp.sendText(from, '⚠️ Sorry, could not fetch order details right now. Please try again later.');
  }
}

// ─── Product catalog ──────────────────────────────────────────────────────

async function handleProductCatalog(from) {
  try {
    const products = await shopify.getProducts(5);
    if (!products.length) {
      await whatsapp.sendText(from, 'No products found in your store right now.');
      return;
    }

    let msg = `🛍️ *Our Latest Products*\n\n`;
    products.forEach((p, i) => {
      msg += `*${i + 1}. ${p.title}*\n`;
      msg += `   💰 ${p.variants[0]?.price || 'N/A'}\n`;
      if (p.body_html) msg += `   ${p.body_html.replace(/<[^>]+>/g, '').slice(0, 80)}...\n`;
      msg += '\n';
    });
    msg += `Visit our store: ${process.env.STORE_URL || 'https://yourstore.com'}`;

    await whatsapp.sendText(from, msg);
  } catch (err) {
    await whatsapp.sendText(from, '⚠️ Could not load products right now. Please visit our website.');
  }
}

// ─── Live agent handoff ────────────────────────────────────────────────────

async function handleLiveAgent(from) {
  await whatsapp.sendText(from,
    '👤 Connecting you to a live agent...\n\n' +
    'Please wait — we\'ll be with you shortly. Our agents are available 9am–9pm.'
  );

  // Notify admin(s)
  for (const admin of ADMIN_PHONES) {
    if (admin) {
      await whatsapp.sendText(admin,
        `🔔 *Agent request*\nCustomer +${from} needs help.\nReply to them at: https://wa.me/${from}`
      );
    }
  }
  sessions.setState(from, 'WITH_AGENT');
}

// ─── WordPress blog publishing ─────────────────────────────────────────────

async function handleBlogTitle(from, title, session) {
  sessions.setState(from, 'AWAIT_BLOG_CONTENT', { title });
  await whatsapp.sendText(from, `📄 Got it! Title: *${title}*\n\nNow send the *body content* of your blog post:`);
}

async function handleBlogContent(from, content, session) {
  const title = session.data?.title || 'Untitled Post';
  sessions.clear(from);

  try {
    const post = await wordpress.publishPost({ title, content });
    await whatsapp.sendText(from,
      `✅ *Blog post published!*\n\n` +
      `📝 Title: ${post.title.rendered}\n` +
      `🔗 URL: ${post.link}\n\n` +
      `The post is now live on your WordPress site.`
    );
  } catch (err) {
    log('WP publish error: ' + err.message);
    await whatsapp.sendText(from, '❌ Failed to publish post. Please check WordPress credentials.');
  }
}

module.exports = { handleIncoming };
