# AI-Powered Hybrid CCTV System

This repository contains the full stack implementation of an AI-Powered Hybrid CCTV System, designed for real-time abuse, theft, and accident detection, with tamper-proof evidence storage on a blockchain.

## Project Overview

Modern CCTV systems often overwhelm human operators, leading to missed events and delayed responses. This project addresses these limitations by integrating AI for real-time threat detection and blockchain for secure, verifiable evidence. The system features:

*   **Real-time AI Detection:** Utilizes YOLOv8, MediaPipe/OpenPose, and PyTorch for object/pose analysis to detect abuse, theft, and accidents.
*   **FastAPI Backend:** Provides low-latency inference and manages system operations.
*   **PostgreSQL Database:** For incident logging and system data.
*   **Blockchain Integration (Polygon):** Critical evidence is hashed and stored for tamper-proof verification.
*   **Alerts & Dashboards:** Firebase for instant alerts, and web/mobile dashboards for monitoring and evidence review.
*   **Hybrid Deployment:** Supports both cloud and local (air-gapped) deployments.

## Local Development Setup (VS Code)

This guide provides step-by-step instructions to set up and run the entire system for local development using VS Code.

### 1. Repository Structure

### 2. Prerequisites

Before you begin, ensure you have the following installed:

*   **Python 3.9+**
*   **Node.js (LTS)** & **npm** (or Yarn)
*   **Docker** (recommended for PostgreSQL)
*   **VS Code** with Python and JavaScript/TypeScript extensions
*   **Expo CLI:** `npm install -g expo-cli`
*   **Hardhat:** `npm install -g hardhat` (or install locally in `blockchain/`)

### 3. Backend Setup

Navigate to the `backend/` directory.

#### 3.1. Create Python Virtual Environment & Install Requirements

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt

Get help: [Post in our discussion board](https://github.com/orgs/skills/discussions/categories/introduction-to-github) &bull; [Review the GitHub status page](https://www.githubstatus.com/)

&copy; 2024 GitHub &bull; [Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) &bull; [MIT License](https://gh.io/mit)
