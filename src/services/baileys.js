'use strict';

const path  = require('path');
const fs    = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino   = require('pino');

const AUTH_DIR = '/tmp/wa_auth';
let _io, _socket, _session = null;
const msgLog = [];
let retryCount = 0;

function setIo(io) { _io = io; }
function emit(event, data) { if (_io) _io.emit(event, data); }

async function startSession() {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log('[WA] Starting with version:', version);

    _socket = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      browser: ['AutoBot Pro', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
      maxMsgRetryCount: 3,
      qrTimeout: 60000,
    });

    _session = _socket;

    _socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        retryCount = 0;
        console.log('[WA] QR code generated — sending to dashboard');
        const dataUrl = await QRCode.toDataURL(qr);
        emit('qr', dataUrl);
        emit('status', { status: 'qr_ready' });
      }

      if (connection === 'open') {
        retryCount = 0;
        const number = _socket.user?.id?.split(':')[0] || '';
        console.log('[WA] Connected:', number);
        emit('status', { status: 'connected', number });
        emit('message_history', msgLog);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log('[WA] Disconnected, code:', code, 'retry:', retryCount);
        emit('status', { status: loggedOut ? 'auth_failed' : 'disconnected' });

        if (loggedOut) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          retryCount = 0;
        } else {
          retryCount++;
          const delay = Math.min(retryCount * 3000, 30000);
          console.log('[WA] Reconnecting in', delay, 'ms');
          setTimeout(startSession, delay);
        }
      }
    });

    _socket.ev.on('creds.update', saveCreds);

    _socket.ev.on('messages.upsert', ({ messages }) => {
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
    console.error('[WA] startSession error:', err.message);
    setTimeout(startSession, 10000);
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
