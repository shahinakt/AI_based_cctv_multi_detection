import os
import json
import time
from datetime import datetime
from hashlib import sha256
from web3 import Web3
from web3.middleware import geth_poa_middleware
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- Mock Configuration ---
# This mock simulates the blockchain interaction without actually sending transactions.
# It's useful for local development and testing backend integration without a live network.

# Mock storage for registered evidence
MOCK_EVIDENCE_STORE = {}

def mock_register_evidence(evidence_hash_bytes32: bytes, metadata: str, retries: int = 1, delay: int = 0) -> str | None:
    """
    Mocks the registration of evidence on a blockchain.

    Args:
        evidence_hash_bytes32: The SHA-256 hash of the evidence as bytes32.
        metadata: A string containing additional metadata about the evidence.
        retries: Number of times to "retry" (for API compatibility, not actual retries).
        delay: Delay in seconds between "retries" (for API compatibility).

    Returns:
        A simulated transaction hash (hex string) if successful, None otherwise.
    """
    print(f"[MOCK] Attempting to register evidence with hash: {evidence_hash_bytes32.hex()} and metadata: '{metadata}'")

    if evidence_hash_bytes32.hex() in MOCK_EVIDENCE_STORE:
        print(f"[MOCK] Evidence with hash {evidence_hash_bytes32.hex()} is already registered in mock store.")
        return None

    try:
        # Simulate a transaction hash
        simulated_tx_hash = sha256(f"{evidence_hash_bytes32.hex()}{metadata}{time.time()}".encode()).hexdigest()
        simulated_block_number = 12345678 # Mock block number
        simulated_timestamp = int(datetime.now().timestamp()) # Mock timestamp
        simulated_owner = "0xMockSenderAddress" # Mock sender address

        MOCK_EVIDENCE_STORE[evidence_hash_bytes32.hex()] = {
            "evidenceHash": evidence_hash_bytes32.hex(),
            "metadata": metadata,
            "owner": simulated_owner,
            "timestamp": simulated_timestamp,
            "blockNumber": simulated_block_number,
            "transactionHash": f"0x{simulated_tx_hash}"
        }
        print(f"[MOCK] Evidence registration successful! Simulated Transaction Hash: 0x{simulated_tx_hash}")
        return f"0x{simulated_tx_hash}"
    except Exception as e:
        print(f"[MOCK] Simulated registration failed: {e}")
        return None

def mock_verify_evidence(evidence_hash_bytes32: bytes) -> dict | None:
    """
    Mocks the verification of evidence on a blockchain.

    Args:
        evidence_hash_bytes32: The SHA-256 hash of the evidence as bytes32.

    Returns:
        A dictionary containing evidence details if found in mock store, None otherwise.
    """
    print(f"[MOCK] Attempting to verify evidence with hash: {evidence_hash_bytes32.hex()}")
    evidence_data = MOCK_EVIDENCE_STORE.get(evidence_hash_bytes32.hex())
    if evidence_data:
        print(f"[MOCK] Evidence found in mock store for hash {evidence_hash_bytes32.hex()}.")
        return evidence_data
    else:
        print(f"[MOCK] Evidence with hash {evidence_hash_bytes32.hex()} not found in mock store.")
        return None

if __name__ == "__main__":
    # Example Usage for Mock:
    sample_hash_str = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    sample_metadata = "CCTV footage of incident #123 from camera 5 (MOCK)"

    sample_hash_bytes32 = bytes.fromhex(sample_hash_str)

    # Register evidence using mock
    mock_tx_hash = mock_register_evidence(sample_hash_bytes32, sample_metadata)
    if mock_tx_hash:
        print(f"Mock Evidence registration successful! Simulated Transaction Hash: {mock_tx_hash}")
    else:
        print("Mock Evidence registration failed or already exists.")

    print("\n--- Verifying Evidence (Mock) ---")
    # Verify evidence using mock
    mock_verified_data = mock_verify_evidence(sample_hash_bytes32)
    if mock_verified_data:
        print("Mock Verified Evidence Details:")
        for key, value in mock_verified_data.items():
            print(f"  {key}: {value}")
    else:
        print("Could not verify mock evidence.")

    # Try registering the same hash again (should fail)
    print("\n--- Attempting to register same hash again (Mock) ---")
    mock_register_evidence(sample_hash_bytes32, "Another metadata")
