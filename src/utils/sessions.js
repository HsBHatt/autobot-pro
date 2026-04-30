/**
 * Session manager — tracks per-user bot conversation state
 * In-memory store. Swap with Redis for multi-instance deploys.
 */

const sessions = new Map();
const SESSION_TTL = 15 * 60 * 1000; // 15 minutes

function get(phone) {
  const s = sessions.get(phone);
  if (!s || Date.now() - s.updatedAt > SESSION_TTL) {
    return { state: 'IDLE', data: {} };
  }
  return s;
}

function setState(phone, state, data = {}) {
  sessions.set(phone, { state, data, updatedAt: Date.now() });
}

function clear(phone) {
  sessions.delete(phone);
}

// Clean up stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of sessions.entries()) {
    if (now - val.updatedAt > SESSION_TTL) sessions.delete(key);
  }
}, 30 * 60 * 1000);

module.exports = { get, setState, clear };
