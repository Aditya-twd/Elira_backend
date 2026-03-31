const Irys = require('@irys/sdk');

const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';

function getIrysClient() {
  const { PRIVATE_KEY } = process.env;

  if (!PRIVATE_KEY) {
    throw new Error('Missing PRIVATE_KEY in environment variables');
  }

  const normalizedPrivateKey = PRIVATE_KEY.startsWith('0x')
    ? PRIVATE_KEY
    : `0x${PRIVATE_KEY}`;

  return new Irys({
    network: process.env.IRYS_NETWORK || 'devnet',
    token: process.env.IRYS_TOKEN || 'matic',
    key: normalizedPrivateKey,
    config: {
      providerUrl: process.env.IRYS_PROVIDER_URL || POLYGON_AMOY_RPC_URL,
    },
  });
}

async function uploadToArweave(fileContent) {
  const irys = getIrysClient();
  const payload = Buffer.isBuffer(fileContent)
    ? fileContent
    : Buffer.from(String(fileContent), 'utf8');
  const receipt = await irys.upload(payload);
  return receipt.id;
}

module.exports = {
  uploadToArweave,
};
