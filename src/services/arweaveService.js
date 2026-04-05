const Irys = require('@irys/sdk');

const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';

function isInsufficientBalanceError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    code === '402' ||
    message.includes('not enough balance') ||
    message.includes('insufficient balance') ||
    message.includes('not enough funds')
  );
}

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

async function uploadToArweave(fileContent, maxRetries = 2) {
  const irys = getIrysClient();
  const payload = Buffer.isBuffer(fileContent)
    ? fileContent
    : Buffer.from(String(fileContent), 'utf8');
  
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Arweave] Attempt ${attempt + 1}/${maxRetries + 1}`);
      const receipt = await irys.upload(payload);
      console.log(`[Arweave] Upload successful on attempt ${attempt + 1}`);
      return receipt.id;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      if (isInsufficientBalanceError(error)) {
        const balanceError = new Error('Irys wallet is underfunded; using local fallback');
        balanceError.code = 'IRYS_INSUFFICIENT_BALANCE';
        throw balanceError;
      }

      console.warn(`[Arweave] Upload attempt ${attempt + 1} failed:`, error.message);
      
      if (!isLastAttempt) {
        // Exponential backoff: 1s, 2s, 4s...
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`[Arweave] Retrying after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError || new Error('Arweave upload failed after retries');
}

module.exports = {
  uploadToArweave,
};
