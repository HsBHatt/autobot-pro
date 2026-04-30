/**
 * Shopify Webhook Handler
 * Handles order events and sends WhatsApp notifications
 */

const whatsapp  = require('../integrations/whatsapp');
const wordpress = require('../integrations/wordpress');
const { log }   = require('../utils/logger');

// ─── Order created ─────────────────────────────────────────────────────────

async function onOrderCreated(order) {
  log(`📦 Shopify: Order #${order.order_number} created`);

  const phone = normalizePhone(order.billing_address?.phone || order.customer?.phone);
  if (!phone) return log('⚠️ No phone number for order notification');

  const items  = order.line_items.map(i => `• ${i.name} x${i.quantity}`).join('\n');
  const total  = `${order.currency} ${order.total_price}`;
  const name   = order.customer?.first_name || 'Customer';

  await whatsapp.sendText(phone,
    `🎉 Hi ${name}! Your order is confirmed.\n\n` +
    `*Order #${order.order_number}*\n\n` +
    `${items}\n\n` +
    `💰 Total: *${total}*\n` +
    `📍 Status: Processing\n\n` +
    `We'll send tracking info once shipped. Reply *STATUS* anytime to check your order.`
  );

  // Notify admin
  const admins = (process.env.ADMIN_PHONES || '').split(',').filter(Boolean);
  for (const admin of admins) {
    await whatsapp.sendText(admin,
      `🛒 *New Order #${order.order_number}*\n` +
      `Customer: ${name} (+${phone})\n` +
      `Total: ${total}\n` +
      `Items: ${order.line_items.map(i => i.name).join(', ')}`
    );
  }
}

// ─── Order fulfilled/shipped ───────────────────────────────────────────────

async function onOrderFulfilled(order) {
  log(`🚚 Shopify: Order #${order.order_number} fulfilled`);

  const phone    = normalizePhone(order.billing_address?.phone || order.customer?.phone);
  if (!phone) return;

  const tracking = order.fulfillments?.[0]?.tracking_number || 'N/A';
  const carrier  = order.fulfillments?.[0]?.tracking_company || 'Our courier';
  const trackUrl = order.fulfillments?.[0]?.tracking_url || '';
  const name     = order.customer?.first_name || 'Customer';

  await whatsapp.sendText(phone,
    `🚚 Great news, ${name}! Order #${order.order_number} is on its way!\n\n` +
    `📦 Carrier: *${carrier}*\n` +
    `🔢 Tracking: *${tracking}*\n` +
    (trackUrl ? `🔗 Track here: ${trackUrl}\n` : '') +
    `\nExpected delivery: 2-5 business days.\n` +
    `Reply *TRACK* to get an update anytime.`
  );
}

// ─── Order cancelled ───────────────────────────────────────────────────────

async function onOrderCancelled(order) {
  log(`❌ Shopify: Order #${order.order_number} cancelled`);

  const phone = normalizePhone(order.billing_address?.phone || order.customer?.phone);
  if (!phone) return;

  const name  = order.customer?.first_name || 'Customer';
  const total = `${order.currency} ${order.total_price}`;

  await whatsapp.sendText(phone,
    `ℹ️ Hi ${name}, your order #${order.order_number} has been *cancelled*.\n\n` +
    `💰 Refund of ${total} will be processed in 3-5 business days.\n\n` +
    `Questions? Reply *AGENT* to talk to us.`
  );
}

// ─── Abandoned cart recovery ───────────────────────────────────────────────

async function onCartAbandoned(checkout) {
  log(`🛒 Shopify: Abandoned cart from ${checkout.email}`);

  const phone = normalizePhone(checkout.billing_address?.phone || checkout.phone);
  if (!phone) return log('⚠️ No phone for cart recovery');

  const name     = checkout.billing_address?.first_name || 'there';
  const items    = checkout.line_items?.map(i => i.title).join(', ') || 'your items';
  const total    = `${checkout.currency} ${checkout.total_price}`;
  const cartUrl  = checkout.abandoned_checkout_url || process.env.STORE_URL;

  await whatsapp.sendText(phone,
    `Hey ${name}! 👋 You left something behind...\n\n` +
    `🛍️ *${items}*\n` +
    `💰 Total: ${total}\n\n` +
    `Complete your order here:\n${cartUrl}\n\n` +
    `Reply *STOP* to unsubscribe from reminders.`
  );
}

// ─── New product → WordPress sync ─────────────────────────────────────────

async function onProductCreated(product) {
  log(`🆕 Shopify: New product "${product.title}" — syncing to WordPress`);

  try {
    const price   = product.variants?.[0]?.price || 'N/A';
    const content = product.body_html ||
      `<p>${product.title} is now available for ${product.variants?.[0]?.currency || ''} ${price}.</p>`;

    const post = await wordpress.publishPost({
      title:    product.title,
      content:  content,
      status:   'publish',
      categories: ['Products'],
      meta: {
        shopify_product_id: String(product.id),
        price: String(price),
      }
    });

    log(`✅ WP post created: ${post.link}`);

    // Notify admin
    const admins = (process.env.ADMIN_PHONES || '').split(',').filter(Boolean);
    for (const admin of admins) {
      await whatsapp.sendText(admin,
        `🆕 *New product synced to WordPress*\n` +
        `📦 ${product.title}\n` +
        `💰 ${price}\n` +
        `🔗 ${post.link}`
      );
    }
  } catch (err) {
    log('❌ WP product sync failed: ' + err.message);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[^0-9]/g, '');
}

module.exports = { onOrderCreated, onOrderFulfilled, onOrderCancelled, onCartAbandoned, onProductCreated };
