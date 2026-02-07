"""
Blockchain integration service for evidence verification.
Handles interaction with the EvidenceRegistry smart contract.
"""
import os
import json
import hashlib
from typing import Optional, Dict, Any
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

# Handle different web3.py versions for POA middleware
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    try:
        # For web3.py v6+
        from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware
    except ImportError:
        geth_poa_middleware = None

load_dotenv()

class BlockchainService:
    """Service for interacting with blockchain evidence registry"""
    
    def __init__(self):
        # Configuration from environment
        self.rpc_url = os.getenv("RPC_URL", "http://localhost:8545")
        self.private_key = os.getenv("PRIVATE_KEY")
        self.contract_address = os.getenv("CONTRACT_ADDRESS")
        
        # Path to contract ABI
        self.abi_path = Path(__file__).resolve().parents[2] / "blockchain" / "artifacts" / "contracts" / "EvidenceRegistry.sol" / "EvidenceRegistry.json"
        
        # Initialize Web3
        self.w3 = None
        self.contract = None
        self.contract_abi = None
        
        try:
            self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
            
            if self.w3.is_connected():
                # For PoA networks like Polygon (if middleware is available)
                if geth_poa_middleware:
                    try:
                        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
                    except Exception as e:
                        print(f"Warning: Could not inject POA middleware: {e}")
                
                # Load contract
                try:
                    with open(self.abi_path, 'r') as f:
                        contract_json = json.load(f)
                    self.contract_abi = contract_json['abi']
                    self.contract = self.w3.eth.contract(
                        address=self.contract_address, 
                        abi=self.contract_abi
                    )
                except Exception as e:
                    print(f"Warning: Could not load contract ABI: {e}")
                    self.contract = None
            else:
                print(f"Warning: Could not connect to Web3 provider at {self.rpc_url}")
        except Exception as e:
            print(f"Warning: Blockchain service initialization failed: {e}")
    
    def register_evidence(self, evidence_hash: str, metadata: str) -> Optional[str]:
        """
        Register evidence on blockchain.
        
        Args:
            evidence_hash: SHA-256 hash as hex string
            metadata: JSON metadata string
            
        Returns:
            Transaction hash if successful, None otherwise
        """
        if not self.contract or not self.private_key:
            print("Blockchain service not properly configured")
            return None
        
        try:
            # Convert hex string to bytes32
            evidence_hash_bytes = bytes.fromhex(evidence_hash)
            
            # Get account
            account = self.w3.eth.account.from_key(self.private_key)
            nonce = self.w3.eth.get_transaction_count(account.address)
            
            # Estimate gas
            estimated_gas = self.contract.functions.registerEvidence(
                evidence_hash_bytes, 
                metadata
            ).estimate_gas({'from': account.address})
            
            gas_limit = int(estimated_gas * 1.2)  # 20% buffer
            gas_price = self.w3.eth.gas_price
            
            # Build transaction
            transaction = self.contract.functions.registerEvidence(
                evidence_hash_bytes, 
                metadata
            ).build_transaction({
                'from': account.address,
                'nonce': nonce,
                'gas': gas_limit,
                'gasPrice': gas_price,
                'chainId': self.w3.eth.chain_id
            })
            
            # Sign and send
            signed_txn = self.w3.eth.account.sign_transaction(transaction, private_key=self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            # Wait for receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
            
            if receipt.status == 1:
                return tx_hash.hex()
            else:
                print(f"Transaction failed in block {receipt.blockNumber}")
                return None
                
        except Exception as e:
            print(f"Error registering evidence on blockchain: {e}")
            if "already registered" in str(e):
                print("Evidence already registered")
            return None
    
    def verify_evidence(self, evidence_hash: str) -> Optional[Dict[str, Any]]:
        """
        Verify evidence against blockchain.
        
        Args:
            evidence_hash: SHA-256 hash as hex string
            
        Returns:
            Dictionary with evidence details if found, None otherwise
        """
        if not self.contract:
            print("Blockchain service not properly configured")
            return None
        
        try:
            # Convert hex string to bytes32
            evidence_hash_bytes = bytes.fromhex(evidence_hash)
            
            # Call contract view function
            evidence_details = self.contract.functions.verifyEvidence(evidence_hash_bytes).call()
            
            return {
                "evidenceHash": evidence_details[0].hex(),
                "metadata": evidence_details[1],
                "owner": evidence_details[2],
                "timestamp": evidence_details[3],
                "blockNumber": evidence_details[4],
                "transactionHash": evidence_details[5].hex()
            }
            
        except Exception as e:
            if "Evidence not found" in str(e):
                print(f"Evidence not found on blockchain")
            else:
                print(f"Error verifying evidence: {e}")
            return None
    
    def compute_file_hash(self, file_path: str) -> str:
        """
        Compute SHA-256 hash of a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            Hex string of SHA-256 hash
        """
        sha256 = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        
        return sha256.hexdigest()


# Singleton instance
blockchain_service = BlockchainService()
