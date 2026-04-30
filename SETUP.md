# AutoBot Pro — Complete Setup Guide
## WhatsApp × Shopify × WordPress Automation

> **No Zapier. No Make. No middleware. Direct API only.**
> Sell this as a white-label product to your clients.

---

## Architecture

```
Client's WhatsApp
      ↕
Meta Cloud API (WhatsApp Business)
      ↕
Your Server (Node.js) ← This bot
      ↕             ↕
Shopify Admin API   WordPress REST API
```

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Node.js 18+ | nodejs.org |
| A server (VPS/cloud) | Hostinger, DigitalOcean, Railway, Render |
| HTTPS domain | Let's Encrypt (free) |
| Meta Developer account | developers.facebook.com |
| Shopify store + custom app | Shopify Partners or Admin |
| WordPress site | Any WP 5.6+ install |

---

## Step 1 — Install

```bash
# Clone or upload to your server
git clone <your-repo>
cd autobot-pro

# Install dependencies (only 2!)
npm install

# Copy env file
cp .env.example .env
nano .env   # fill in your values
```

---

## Step 2 — WhatsApp Setup

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create an App → Business type
3. Add **WhatsApp** product
4. Under **WhatsApp → API Setup**:
   - Copy your **Phone Number ID** → `WA_PHONE_NUMBER_ID`
   - Generate a **Permanent Access Token** → `WA_ACCESS_TOKEN`
5. Under **Webhooks**, set:
   - URL: `https://yourdomain.com/webhook/whatsapp`
   - Verify token: match your `WA_VERIFY_TOKEN`
   - Subscribe to: `messages`

---

## Step 3 — Shopify Setup

1. In Shopify Admin → **Settings → Apps → Develop apps**
2. Create a new app, grant these API scopes:
   - `read_orders`, `read_products`, `read_customers`
   - `write_draft_orders` (optional)
3. Install app → copy **Admin API access token** → `SHOPIFY_TOKEN`
4. Webhooks are auto-registered when you run:
   ```bash
   npm run setup-webhooks
   ```
   Or add manually in Shopify → Notifications → Webhooks

---

## Step 4 — WordPress Setup

1. In WP Admin → **Users → Your Profile**
2. Scroll to **Application Passwords** section
3. Add new: name it "AutoBot Pro"
4. Copy the generated password → `WP_APP_PASS`
5. Make sure **Permalinks** are set (not plain) for REST API to work

---

## Step 5 — Deploy & Run

```bash
# Development
npm run dev

# Production (use PM2 for process management)
npm install -g pm2
pm2 start src/server.js --name autobot-pro
pm2 save
pm2 startup   # auto-restart on reboot

# Check logs
pm2 logs autobot-pro
```

---

## Bot Commands (Customer-facing)

| Customer says | Bot does |
|---|---|
| `1` or `order status` | Asks for order #, fetches from Shopify |
| `2` or `track` | Returns tracking number |
| `3` or `products` | Lists latest Shopify products |
| `4` or `agent` | Handoffs to human + notifies admin WA |
| `menu` or `hi` | Shows main menu |

## Admin Commands (Admin phone numbers only)

| Admin sends | Action |
|---|---|
| `5` or `post blog` | Guided WP blog post via WhatsApp |
| N/A | New Shopify orders auto-notify admin |
| N/A | New products auto-sync to WordPress |

---

## Automation Flows (Built-in)

### Shopify → WhatsApp
- ✅ Order placed → Confirmation WA message
- ✅ Order shipped → Tracking number WA message
- ✅ Order cancelled → Cancellation + refund info
- ✅ Cart abandoned → Recovery message (configurable delay)
- ✅ New product → Auto-post to WordPress

### WhatsApp → Shopify
- ✅ Customer asks for order status → live Shopify data
- ✅ Customer asks for tracking → real fulfillment data

### WhatsApp → WordPress
- ✅ Admin sends `POST BLOG` → guided post creation → live on WP
- ✅ Admin sends product → creates WP post

---

## Selling to Clients

### What to charge
| Service | Suggested pricing |
|---|---|
| One-time setup | $300–$800 |
| Monthly maintenance | $50–$150/mo |
| Per automation flow | $50–$100 each |

### White-labeling
1. Update `BUSINESS_NAME` in `.env`
2. Change bot messages in `handlers/whatsapp.js` (look for `MAIN_MENU`)
3. Update `package.json` name to your product name
4. Optionally add a web dashboard (admin panel) on top

### What each client needs
- Their own Meta Business account + verified phone number
- Their Shopify store credentials
- Their WordPress credentials
- A VPS (you can host all clients on one server)

---

## File Structure

```
autobot-pro/
├── src/
│   ├── server.js                 — Express server, all routes
│   ├── handlers/
│   │   ├── whatsapp.js           — Incoming WA message router + bot brain
│   │   └── shopify.js            — Shopify webhook event handlers
│   ├── integrations/
│   │   ├── whatsapp.js           — Meta Cloud API calls
│   │   ├── shopify.js            — Shopify Admin API calls
│   │   └── wordpress.js          — WordPress REST API calls
│   └── utils/
│       ├── sessions.js           — Per-user conversation state
│       └── logger.js             — Timestamped logging
├── .env.example                  — Config template
├── package.json
└── SETUP.md                      — This file
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| WA webhook fails verification | Check `WA_VERIFY_TOKEN` matches Meta dashboard |
| Shopify webhook 401 | Check `SHOPIFY_WEBHOOK_SECRET` |
| WordPress 403 | Enable Application Passwords in WP settings |
| Bot not responding | Check `pm2 logs`, ensure HTTPS is working |
| Orders not found | Ensure `read_orders` scope in Shopify app |
