// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EvidenceRegistry {
    struct Evidence {
        bytes32 evidenceHash;
        string metadata;
        address owner;
        uint256 timestamp;
        uint256 blockNumber;
        bytes32 transactionHash;
    }

    mapping(bytes32 => Evidence) public registeredEvidence;
    mapping(bytes32 => bool) public isEvidenceRegistered;

    event EvidenceRegistered(
        bytes32 indexed evidenceHash,
        address indexed owner,
        uint256 timestamp,
        string metadata,
        bytes32 transactionHash
    );

    function registerEvidence(bytes32 _evidenceHash, string memory _metadata) public returns (bool) {
        require(!isEvidenceRegistered[_evidenceHash], "Evidence already registered.");

        bytes32 txHash = blockhash(block.number - 1); // Placeholder for actual transaction hash, which is not directly accessible in Solidity
        // In a real scenario, the transaction hash would be retrieved off-chain or passed as a parameter.
        // For this contract, we'll use a placeholder or rely on the event to provide it off-chain.

        registeredEvidence[_evidenceHash] = Evidence(
            _evidenceHash,
            _metadata,
            msg.sender,
            block.timestamp,
            block.number,
            txHash // This will be a placeholder; actual tx hash needs to be captured off-chain
        );
        isEvidenceRegistered[_evidenceHash] = true;

        emit EvidenceRegistered(_evidenceHash, msg.sender, block.timestamp, _metadata, txHash);
        return true;
    }

    function verifyEvidence(bytes32 _evidenceHash) public view returns (
        bytes32 evidenceHash,
        string memory metadata,
        address owner,
        uint256 timestamp,
        uint256 blockNumber,
        bytes32 transactionHash
    ) {
        require(isEvidenceRegistered[_evidenceHash], "Evidence not found.");
        Evidence storage ev = registeredEvidence[_evidenceHash];
        return (ev.evidenceHash, ev.metadata, ev.owner, ev.timestamp, ev.blockNumber, ev.transactionHash);
    }
}
