const crypto = require('crypto');

function encryptContent(plainText) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const encryptedBuffer = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);

  return {
    encryptedBuffer,
    keyHex: key.toString('hex'),
    ivHex: iv.toString('hex'),
  };
}

function decryptBuffer(encryptedBuffer, keyHex, ivHex) {
  const key = Buffer.from(String(keyHex), 'hex');
  const iv = Buffer.from(String(ivHex), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

module.exports = {
  encryptContent,
  decryptBuffer,
};
