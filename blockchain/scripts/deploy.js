const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const EvidenceRegistry = await ethers.getContractFactory("EvidenceRegistry");
  const evidenceRegistry = await EvidenceRegistry.deploy();

  await evidenceRegistry.deployed();

  console.log("EvidenceRegistry deployed to:", evidenceRegistry.address);

  // Optionally, verify the contract on Etherscan
  if (process.env.ETHERSCAN_API_KEY && process.env.NETWORK !== "hardhat") {
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: evidenceRegistry.address,
        constructorArguments: [],
      });
      console.log("Contract verified successfully.");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
