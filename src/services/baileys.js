'use strict';

const path = require('path');
const fs   = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, PHONENUMBER_MCC } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino   = require('pino');

const AUTH_DIR = '/tmp/wa_auth';
let _io, _session = null;
const msgLog = [];
let retryCount = 0;
let isStarting = false;

function setIo(io) { _io = io; }
function emit(event, data) { if (_io) _io.emit(event, data); }

async function startSession() {
  if (isStarting) return;
  isStarting = true;

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log('[WA] Using version:', version);

    _session = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 10000,
    });

    _session.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log('[WA] QR ready — sending to dashboard');
        const dataUrl = await QRCode.toDataURL(qr, { width: 300 });
        emit('qr', dataUrl);
        emit('status', { status: 'qr_ready' });
      }

      if (connection === 'open') {
        retryCount = 0;
        isStarting = false;
        const number = _session.user?.id?.split(':')[0] || '';
        console.log('[WA] ✅ Connected:', number);
        emit('status', { status: 'connected', number });
        emit('message_history', msgLog);
      }

      if (connection === 'close') {
        isStarting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log('[WA] Closed, code:', code);

        if (loggedOut) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          emit('status', { status: 'auth_failed' });
        } else {
          emit('status', { status: 'disconnected' });
          retryCount++;
          const delay = Math.min(retryCount * 5000, 60000);
          console.log('[WA] Retry in', delay/1000, 's');
          setTimeout(startSession, delay);
        }
      }
    });

    _session.ev.on('creds.update', saveCreds);

    _session.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const from = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || 'Unknown';
        const body = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || '[media]';
        const time = new Date(msg.messageTimestamp * 1000).toLocaleTimeString();
        const entry = { from, body, time };
        msgLog.unshift(entry);
        if (msgLog.length > 50) msgLog.pop();
        emit('new_message', entry);
      }
    });

  } catch (err) {
    isStarting = false;
    console.error('[WA] Error:', err.message);
    setTimeout(startSession, 15000);
  }
}

async function sendMessage(to, text) {
  if (!_session) throw new Error('WhatsApp not connected');
  const jid = to.replace(/\D/g, '') + '@s.whatsapp.net';
  await _session.sendMessage(jid, { text });
}

async function disconnect() {
  if (_session) {
    await _session.logout().catch(() => {});
    _session = null;
  }
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  emit('status', { status: 'disconnected' });
}

function isConnected() { return _session?.user != null; }

module.exports = { setIo, startSession, sendMessage, disconnect, isConnected, msgLog };
