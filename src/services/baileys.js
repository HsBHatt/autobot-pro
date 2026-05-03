'use strict';

const path  = require('path');
const fs    = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino   = require('pino');

const AUTH_DIR = '/tmp/wa_auth';

let _io, _socket, _session = null;
const msgLog = [];

function setIo(io) { _io = io; }

function emit(event, data) {
  if (_io) _io.emit(event, data);
}

async function startSession() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  _socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
  });

  _session = _socket;

  _socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      emit('qr', dataUrl);
      emit('status', { status: 'qr_ready' });
      console.log('[WA] QR code generated');
    }

    if (connection === 'open') {
      const number = _socket.user?.id?.split(':')[0] || '';
      emit('status', { status: 'connected', number });
      emit('message_history', msgLog);
      console.log('[WA] Connected:', number);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      emit('status', { status: loggedOut ? 'auth_failed' : 'disconnected' });
      console.log('[WA] Disconnected, code:', code);
      if (!loggedOut) {
        setTimeout(startSession, 5000);
      } else {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
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

function isConnected() {
  return _session?.user != null;
}

module.exports = { setIo, startSession, sendMessage, disconnect, isConnected, msgLog };
