# Blockchain Setup and Deployment Guide

## Overview
This blockchain module provides evidence registry functionality using Ethereum smart contracts deployed via Hardhat.

## Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Python 3.8+ (for Python integration scripts)

## Project Structure
```
blockchain/
├── contracts/              # Solidity smart contracts
│   └── EvidenceRegistry.sol
├── scripts/               # Deployment and utility scripts
│   └── deploy.js
├── test/                  # Contract tests
├── artifacts/             # Compiled contracts (auto-generated)
├── hardhat.config.js      # Hardhat configuration
├── package.json           # Node.js dependencies
├── .env                   # Environment variables
├── register_evidence.py   # Python integration for blockchain
└── mock_register.py       # Mock blockchain for testing

```

## Setup Instructions

### 1. Install Dependencies
```bash
cd blockchain
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and update with your values:
```bash
cp .env.example .env
```

For **local development**, leave the values empty or use defaults.
For **testnet deployment**, provide:
- `ALCHEMY_API_KEY`: Your Alchemy API key
- `PRIVATE_KEY`: Your wallet's private key
- `ETHERSCAN_API_KEY`: (Optional) For contract verification

### 3. Compile Contracts
```bash
npm run compile
```

### 4. Start Local Blockchain (Optional)
For local development and testing:
```bash
npm run node
```
This starts a local Hardhat network on http://127.0.0.1:8545

### 5. Deploy Contract

#### Deploy to Local Network
In a new terminal (keep the node running):
```bash
npm run deploy:localhost
```

#### Deploy to Polygon Mumbai Testnet
```bash
npm run deploy:mumbai
```

After deployment, the contract address will be automatically saved to your `.env` file.

## Testing

Run contract tests:
```bash
npm test
```

## Python Integration

### Install Python Dependencies
```bash
pip install -r requirements.txt
```

### Register Evidence
```python
from register_evidence import register_evidence
import hashlib

# Create evidence hash
evidence_data = b"video_frame_data_or_metadata"
evidence_hash = hashlib.sha256(evidence_data).digest()

# Register on blockchain
tx_hash = register_evidence(
    evidence_hash_bytes32=evidence_hash,
    metadata='{"camera_id": "cam_01", "timestamp": "2024-01-01T12:00:00"}'
)

if tx_hash:
    print(f"Evidence registered! Transaction: {tx_hash}")
```

### Mock Testing
For development without blockchain:
```python
from mock_register import mock_register_evidence

tx_hash = mock_register_evidence(
    evidence_hash_bytes32=evidence_hash,
    metadata='{"camera_id": "cam_01"}'
)
```

## Available NPM Scripts

- `npm run compile` - Compile smart contracts
- `npm run deploy` - Deploy to default network
- `npm run deploy:localhost` - Deploy to local Hardhat network
- `npm run deploy:mumbai` - Deploy to Polygon Mumbai testnet
- `npm test` - Run contract tests
- `npm run node` - Start local Hardhat node
- `npm run clean` - Clean artifacts and cache

## Network Configuration

### Localhost (Development)
- RPC URL: http://127.0.0.1:8545
- No API keys needed
- Hardhat provides 20 test accounts

### Polygon Mumbai (Testnet)
- RPC URL: Via Alchemy
- Requires test MATIC (get from faucet)
- Faucet: https://faucet.polygon.technology/

## Smart Contract Details

### EvidenceRegistry.sol
- **registerEvidence**: Register new evidence with hash and metadata
- **verifyEvidence**: Retrieve evidence details by hash
- **Events**: EvidenceRegistered event for monitoring

## Security Notes

⚠️ **NEVER** commit your `.env` file or expose private keys!
- `.env` is gitignored
- Use `.env.example` as a template
- For production, use secure key management

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### "Network connection failed"
- Check RPC URL in `.env`
- Ensure local node is running (if using localhost)
- Verify API keys are correct

### Python integration issues
```bash
pip install --upgrade web3 python-dotenv
```

## Next Steps

1. Test locally with `npm run node` and `npm run deploy:localhost`
2. Integrate with backend API
3. Deploy to testnet for staging
4. Monitor transactions and events
5. Plan mainnet deployment

## Support

For issues or questions, refer to:
- Hardhat documentation: https://hardhat.org/docs
- Web3.py documentation: https://web3py.readthedocs.io/
