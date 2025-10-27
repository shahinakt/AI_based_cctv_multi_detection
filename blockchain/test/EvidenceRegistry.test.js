const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EvidenceRegistry", function () {
  let EvidenceRegistry;
  let evidenceRegistry;
  let owner;
  let addr1;
  let addr2;
  let evidenceHash1 = ethers.utils.formatBytes32String("hash1");
  let evidenceHash2 = ethers.utils.formatBytes32String("hash2");
  let metadata1 = "metadata for hash1";
  let metadata2 = "metadata for hash2";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    EvidenceRegistry = await ethers.getContractFactory("EvidenceRegistry");
    evidenceRegistry = await EvidenceRegistry.deploy();
    await evidenceRegistry.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      // The contract doesn't explicitly store an owner, but msg.sender is used for registration.
      // This test ensures the contract deploys correctly.
      expect(evidenceRegistry.address).to.not.be.null;
    });
  });

  describe("Registering Evidence", function () {
    it("Should allow an address to register evidence", async function () {
      await expect(evidenceRegistry.connect(addr1).registerEvidence(evidenceHash1, metadata1))
        .to.emit(evidenceRegistry, "EvidenceRegistered")
        .withArgs(evidenceHash1, addr1.address, await ethers.provider.getBlock("latest").then(block => block.timestamp), metadata1, ethers.utils.hexZeroPad("0x0", 32)); // Placeholder txHash

      const [hash, meta, ownerAddr, timestamp, blockNum, txHash] = await evidenceRegistry.verifyEvidence(evidenceHash1);
      expect(hash).to.equal(evidenceHash1);
      expect(meta).to.equal(metadata1);
      expect(ownerAddr).to.equal(addr1.address);
      expect(await evidenceRegistry.isEvidenceRegistered(evidenceHash1)).to.be.true;
    });

    it("Should not allow registering the same evidence hash twice", async function () {
      await evidenceRegistry.connect(addr1).registerEvidence(evidenceHash1, metadata1);
      await expect(evidenceRegistry.connect(addr1).registerEvidence(evidenceHash1, metadata2))
        .to.be.revertedWith("Evidence already registered.");
    });
  });

  describe("Verifying Evidence", function () {
    it("Should return correct evidence details for a registered hash", async function () {
      await evidenceRegistry.connect(addr1).registerEvidence(evidenceHash1, metadata1);
      const block = await ethers.provider.getBlock("latest");

      const [hash, meta, ownerAddr, timestamp, blockNum, txHash] = await evidenceRegistry.verifyEvidence(evidenceHash1);

      expect(hash).to.equal(evidenceHash1);
      expect(meta).to.equal(metadata1);
      expect(ownerAddr).to.equal(addr1.address);
      expect(timestamp).to.equal(block.timestamp);
      expect(blockNum).to.equal(block.number);
      // The txHash in the contract is a placeholder, so we expect a zeroed bytes32
      expect(txHash).to.equal(ethers.utils.hexZeroPad("0x0", 32));
    });

    it("Should revert if evidence hash is not registered", async function () {
      await expect(evidenceRegistry.verifyEvidence(evidenceHash2))
        .to.be.revertedWith("Evidence not found.");
    });
  });
});
