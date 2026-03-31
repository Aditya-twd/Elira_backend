const { ethers } = require('ethers');

const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';

const CONTRACT_ABI = [
  'function storeEvidence(string fileHash, string arweaveTxId) external',
];

function getContract() {
  const { PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;

  if (!PRIVATE_KEY) {
    throw new Error('Missing PRIVATE_KEY in environment variables');
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error('Missing CONTRACT_ADDRESS in environment variables');
  }

  const provider = new ethers.JsonRpcProvider(POLYGON_AMOY_RPC_URL);
  const normalizedPrivateKey = PRIVATE_KEY.startsWith('0x')
    ? PRIVATE_KEY
    : `0x${PRIVATE_KEY}`;
  const wallet = new ethers.Wallet(normalizedPrivateKey, provider);

  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
}

async function storeEvidenceOnChain(fileHash, arweaveTxId) {
  const contract = getContract();

  const tx = await contract.storeEvidence(fileHash, arweaveTxId);
  console.log('Blockchain tx sent:', tx.hash);

  const receipt = await tx.wait();
  console.log('Blockchain tx confirmed:', receipt.hash);

  return receipt.hash;
}

module.exports = {
  storeEvidenceOnChain,
};
