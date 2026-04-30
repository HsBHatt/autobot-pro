/**
 * WordPress REST API Integration
 * Direct WP REST API — no plugin required on the site
 */

const https   = require('https');
const http    = require('http');
const { log } = require('../utils/logger');

const WP_URL  = process.env.WP_URL;       // e.g. "https://myblog.com"
const WP_USER = process.env.WP_USER;      // WordPress username
const WP_PASS = process.env.WP_APP_PASS;  // Application password (WordPress 5.6+)

// ─── Core request helper ───────────────────────────────────────────────────

async function wpRequest(method, endpoint, body = null) {
  const url      = new URL(`${WP_URL}/wp-json/wp/v2${endpoint}`);
  const isHttps  = url.protocol === 'https:';
  const lib      = isHttps ? https : http;
  const token    = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
  const data     = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method,
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type':  'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.code && json.message) {
            reject(new Error(`WP API: ${json.message}`));
          } else {
            resolve(json);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Publish a post ────────────────────────────────────────────────────────

async function publishPost({ title, content, status = 'publish', categories = [], tags = [], meta = {} }) {
  const post = await wpRequest('POST', '/posts', {
    title,
    content,
    status,
    categories: await resolveCategoryIds(categories),
    tags:       await resolveTagIds(tags),
    meta
  });
  log(`✅ WP post published: "${title}" → ${post.link}`);
  return post;
}

// ─── Create draft post ─────────────────────────────────────────────────────

async function createDraft({ title, content, categories = [] }) {
  return publishPost({ title, content, status: 'draft', categories });
}

// ─── Update existing post ──────────────────────────────────────────────────

async function updatePost(id, { title, content, status }) {
  return wpRequest('POST', `/posts/${id}`, { title, content, status });
}

// ─── Get recent posts ──────────────────────────────────────────────────────

async function getRecentPosts(count = 5) {
  return wpRequest('GET', `/posts?per_page=${count}&_embed`);
}

// ─── Create / get category IDs ────────────────────────────────────────────

async function resolveCategoryIds(names) {
  if (!names.length) return [];
  const ids = [];
  for (const name of names) {
    try {
      const existing = await wpRequest('GET', `/categories?search=${encodeURIComponent(name)}`);
      if (existing.length) {
        ids.push(existing[0].id);
      } else {
        const created = await wpRequest('POST', '/categories', { name });
        ids.push(created.id);
      }
    } catch (e) { /* skip */ }
  }
  return ids;
}

// ─── Create / get tag IDs ─────────────────────────────────────────────────

async function resolveTagIds(names) {
  if (!names.length) return [];
  const ids = [];
  for (const name of names) {
    try {
      const existing = await wpRequest('GET', `/tags?search=${encodeURIComponent(name)}`);
      if (existing.length) {
        ids.push(existing[0].id);
      } else {
        const created = await wpRequest('POST', '/tags', { name });
        ids.push(created.id);
      }
    } catch (e) { /* skip */ }
  }
  return ids;
}

// ─── Upload image to media library ────────────────────────────────────────

async function uploadImage(buffer, filename, mimeType = 'image/jpeg') {
  const token = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
  const url   = new URL(`${WP_URL}/wp-json/wp/v2/media`);
  const isHttps = url.protocol === 'https:';
  const lib   = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Authorization':        `Basic ${token}`,
        'Content-Type':         mimeType,
        'Content-Disposition':  `attachment; filename="${filename}"`,
        'Content-Length':       buffer.length
      }
    };
    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

module.exports = { publishPost, createDraft, updatePost, getRecentPosts, uploadImage };
