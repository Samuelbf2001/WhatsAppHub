import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const MEDIA_DIR = process.env.MEDIA_STORAGE_PATH || path.join(os.tmpdir(), 'whatsappmedia');
const MEDIA_BASE_URL = (process.env.WEBHOOK_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/3gpp': '.3gp',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/opus': '.opus',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/zip': '.zip',
};

/**
 * Saves base64 media to disk and returns a public URL.
 * @param {string} base64
 * @param {string} mimetype
 * @param {string} [messageId]
 * @returns {string} Public URL
 */
export function saveMedia(base64, mimetype, messageId) {
  const cleanMime = mimetype?.split(';')[0]?.trim() || 'application/octet-stream';
  const ext = MIME_TO_EXT[cleanMime] || '.bin';
  const id = messageId || crypto.randomBytes(8).toString('hex');
  const filename = `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
  const filePath = path.join(MEDIA_DIR, filename);

  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return `${MEDIA_BASE_URL}/media/${filename}`;
}

export function getMediaDir() {
  return MEDIA_DIR;
}

export function cleanupOldMedia() {
  try {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const file of fs.readdirSync(MEDIA_DIR)) {
      const filePath = path.join(MEDIA_DIR, file);
      try {
        const { birthtimeMs } = fs.statSync(filePath);
        if (birthtimeMs < cutoff) fs.unlinkSync(filePath);
      } catch {}
    }
  } catch (err) {
    console.warn('[MediaStorage] Cleanup error:', err.message);
  }
}
