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

# AI-based CCTV Multi-Detection

An end-to-end, full-stack repository for an AI-powered hybrid CCTV system capable of real-time detection (abuse, theft, accidents), evidence capture, and tamper-proof evidence registration using blockchain.

## Key Features

- Real-time detection using object detection (YOLO) and pose analysis (MediaPipe/OpenPose) with PyTorch models.
- FastAPI backend for low-latency inference, incident logging, and API services.
- PostgreSQL for structured incident and metadata storage.
- Blockchain evidence anchoring (smart contract + hashing) for verifiable, tamper-proof records.
- Web and mobile frontends for monitoring, alerts, and evidence review.
- Modular layout to support cloud and air-gapped local deployments.

## Quick Start (Local Development)

This section gets the repo running locally for development. Commands assume you're using the workspace root: `c:\Users\dell\Desktop\Projects\AI_based_cctv_multi_detection`.

Prerequisites

- Python 3.9+ (recommended)
- Node.js (LTS) and npm
- Docker (recommended for running PostgreSQL locally)
- Git

Backend (FastAPI)

1. Open a terminal and navigate to the backend folder:

	cd backend

2. Create and activate a virtual environment:

	# On Linux/macOS or Git Bash
	python -m venv venv
	source venv/bin/activate

	# On Windows CMD/PowerShell
	python -m venv venv
	.\venv\Scripts\activate

3. Install Python dependencies:

	pip install -r requirements.txt

4. Configure environment variables (create a `.env` or use your OS env) for database URL, blockchain provider, Firebase keys, etc. See `backend/core/config.py` for expected keys.

5. Run database migrations (alembic is configured under `backend/alembic`):

	alembic upgrade head

6. Start the backend API server (development):

	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

AI Worker (Inference & Evidence Capture)

1. Open a new terminal and activate the same Python virtualenv or create one inside `ai_worker/`.
2. Install ai-worker requirements:

	cd ai_worker
	pip install -r requirements.txt

3. Start the inference/worker process (example entrypoint):

	python -m ai_worker.inference.worker

Frontend (Web)

1. Install and run the frontend (Vite/React) dev server:

	cd frontend
	npm install
	npm run dev

2. Open the dev URL shown by Vite (usually http://localhost:5173).

Mobile (Expo)

1. From the `mobile/` folder:

	cd mobile
	npm install
	expo start

Blockchain (Smart Contracts)

1. The `blockchain/` folder contains smart contract source and scripts.

	cd blockchain
	npm install
	# run tests
	npx hardhat test
	# deploy to a local network / testnet using your configured scripts

Testing

- Run Python tests (backend/ai_worker):

  pytest -q

- Frontend tests (if present):

  cd frontend
  npm test

Project Layout (high level)

- `backend/` — FastAPI app, DB models, alembic migrations, CRUD and API logic.
- `ai_worker/` — AI models, inference pipeline, evidence capture, and exporters.
- `frontend/` — Web dashboard built with Vite + React.
- `mobile/` — Mobile client (Expo).
- `blockchain/` — Smart contract, tests, and deployment scripts.
- `data/` — Example captures and local artifacts.

Contributing

Contributions are welcome. Please open issues for bugs or feature requests and submit pull requests for changes. When opening PRs:

1. Create a feature branch from `main`.
2. Run relevant tests and linters.
3. Keep changes small and focused. Add documentation where relevant.

License

This project is licensed under the MIT License — see the `LICENSE` file for details.

Contact

For questions or help, create an issue or reach out via the repository's discussion board.

