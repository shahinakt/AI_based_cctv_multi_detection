# AI-Based CCTV Multi-Detection System

A full-stack AI-powered CCTV surveillance system for real-time detection of incidents (falls, theft, abuse, health emergencies) with blockchain-verified evidence storage, live streaming, push notifications, and a cross-platform mobile app.

## Features

- **AI Detection**: YOLOv8 object detection + MediaPipe pose estimation for fall, theft, and abuse detection
- **Multi-Camera Support**: Dynamic camera manager running parallel per-camera inference workers
- **FastAPI Backend**: RESTful + WebSocket API for incidents, cameras, users, and evidence
- **PostgreSQL Database**: Full incident/camera/user/evidence storage with Alembic migrations
- **Async & Sync DB**: Both sync (`psycopg2`) and async (`asyncpg`) database layers
- **Blockchain Evidence**: Tamper-proof SHA-256 evidence hashing registered on-chain via Hardhat/Solidity
- **Celery + Redis Task Queue**: Background tasks for blockchain registration and push notifications
- **FCM Push Notifications**: Firebase Cloud Messaging for real-time mobile alerts
- **Web Dashboard**: React + Vite + TailwindCSS monitoring interface
- **Mobile App**: Cross-platform React Native (Expo) app with live camera feeds and SOS
- **WebSocket Streaming**: Live MJPEG/Base64 frame streaming to clients
- **JWT Auth**: Role-based access control (admin / operator / viewer)

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CCTV Cameras                         │
│              (RTSP / USB / WebSocket streams)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Worker                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ YOLOv8       │  │ MediaPipe    │  │  ByteTracker     │  │
│  │ Detector     │  │ Pose Est.    │  │  (Kalman+IoU)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Fall         │  │ Theft        │  │ Behavior         │  │
│  │ Detector     │  │ Detector     │  │ Classifier       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│              FastAPI API Server (port 8100)                 │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (port 8000)               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ REST API    │  │ WebSocket    │  │ Celery Workers   │   │
│  │ (incidents, │  │ (live feed   │  │ (blockchain +    │   │
│  │  cameras,   │  │  + alerts)   │  │  notifications)  │   │
│  │  users)     │  └──────────────┘  └──────────────────┘   │
│  └─────────────┘                                            │
└───────┬─────────────────────────┬───────────────────────────┘
        │                         │
        ▼                         ▼
┌──────────────┐          ┌──────────────────┐
│  PostgreSQL  │          │  Blockchain       │
│  Database    │          │  (Hardhat/Polygon)│
└──────────────┘          └──────────────────┘
        │                         │
        ▼                         ▼
┌───────────────────────────────────────────┐
│           Clients                         │
│  ┌─────────────┐       ┌───────────────┐  │
│  │ React Web   │       │ Expo Mobile   │  │
│  │ Dashboard   │       │ App           │  │
│  └─────────────┘       └───────────────┘  │
└───────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| AI / ML | PyTorch, YOLOv8 (Ultralytics), MediaPipe, OpenCV, filterpy, albumentations |
| Backend | FastAPI, Uvicorn, SQLAlchemy, Alembic, Celery, Redis |
| Database | PostgreSQL (psycopg2 sync + asyncpg async) |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Blockchain | Hardhat, Solidity, Web3.py, Polygon |
| Notifications | Firebase Admin SDK (FCM) |
| Web Frontend | React, Vite, TailwindCSS, Axios |
| Mobile | React Native (Expo), TailwindCSS |
| Streaming | WebSockets, MJPEG |

## Prerequisites

- **Python 3.9+**
- **Node.js 18+** & npm
- **PostgreSQL 13+**
- **Redis** (for Celery task queue)
- **Git**

## Quick Setup

### 1. Create Shared Virtual Environment

```bash
# From project root
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (Linux/macOS)
source .venv/bin/activate
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env file (see Environment Variables section)
cp .env.example .env   # or create manually

# Run database migrations
python -m alembic upgrade head

# Start backend server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. AI Worker Setup

```bash
cd ai_worker

# Install dependencies (if not using shared venv)
pip install -r requirements.txt

# Start AI worker (connects to backend automatically)
python -m ai_worker
```

### 4. Celery Worker (Background Tasks)

```bash
cd backend

# Requires Redis running locally
celery -A app.tasks.celery_app worker --loglevel=info
```

### 5. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 6. Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo (scan QR code with Expo Go)
npm start
```

### 7. Blockchain Setup

```bash
cd blockchain

# Install Hardhat dependencies
npm install

# Start local blockchain node
npm run blockchain

# Deploy EvidenceRegistry contract
npm run deploy

# Install Python blockchain client deps
pip install -r requirements.txt
```

## Running the Full System

```bash
# Start everything via shell script (Linux/macOS)
./start_all.sh
```

Or start each service in separate terminals as shown above.

## Project Structure

```
├── ai_worker/               # AI inference engine
│   ├── inference/           # Per-camera workers, detectors, stream server
│   │   ├── single_camera_worker.py
│   │   ├── multi_camera_worker.py
│   │   ├── dynamic_camera_manager.py
│   │   ├── fall_detector.py
│   │   ├── theft_detector.py
│   │   ├── incident_detector.py
│   │   └── stream_worker.py
│   ├── models/              # AI model wrappers
│   │   ├── yolo_detector.py
│   │   ├── pose_estimator.py
│   │   ├── behavior_classifier.py
│   │   └── tracker.py
│   ├── data/                # Dataset loaders & augmentation
│   ├── training/            # Model training scripts
│   ├── utils/               # Evidence saver, stream reader, frame validator
│   ├── api_server.py        # FastAPI server for camera management
│   └── config.py            # Worker configuration
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/          # REST & WebSocket endpoints
│   │   ├── core/            # Config, DB engines, security
│   │   ├── services/        # Blockchain, evidence integrity, SOS
│   │   ├── tasks/           # Celery tasks (blockchain, notifications, SOS)
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   └── crud.py          # Database CRUD operations
│   └── alembic/             # Database migrations
├── blockchain/              # Smart contracts
│   ├── contracts/           # Solidity (EvidenceRegistry.sol)
│   └── scripts/             # Hardhat deployment scripts
├── frontend/                # React web dashboard
│   └── src/
├── mobile/                  # Expo React Native mobile app
│   ├── screens/
│   ├── components/
│   └── services/
└── models/                  # Shared model files (yolov8n.pt, etc.)
```

## Environment Variables

Create `.env` files in the respective module directories:

**`backend/.env`**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/cctv_db
SECRET_KEY=your-super-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0

BLOCKCHAIN_PROVIDER_URL=http://localhost:8545
BLOCKCHAIN_CONTRACT_ADDRESS=0xYourContractAddress
AI_WORKER_URL=http://localhost:8100

FIREBASE_CREDENTIALS_PATH=path/to/firebase-service-account.json
```

**`ai_worker/.env`**
```env
BACKEND_URL=http://localhost:8000
CAMERA_SOURCES={"cam1": "rtsp://192.168.1.100:554/stream", "cam2": "0"}
MODEL_PATH=yolov8n.pt
EVIDENCE_DIR=ai_worker/data/captures
```

**`blockchain/.env`**
```env
PROVIDER_URL=http://localhost:8545
CONTRACT_ADDRESS=0xYourDeployedContractAddress
PRIVATE_KEY=0xYourWalletPrivateKey
```

## Testing

```bash
# Backend unit tests
cd backend
pytest

# Frontend unit tests
cd frontend
npm test
```

## Dependencies Summary

| Module | Key Python Packages |
|---|---|
| `ai_worker` | torch, torchvision, ultralytics, opencv-python, mediapipe, numpy, scipy, filterpy, albumentations, fastapi, uvicorn, requests, psutil, websockets, web3, onnx, aiofiles, pynvml |
| `backend` | fastapi, uvicorn, sqlalchemy, psycopg2-binary, asyncpg, alembic, pydantic, passlib, python-jose, celery, redis, firebase-admin, web3, opencv-python, python-dotenv, httpx |
| `blockchain` | web3, python-dotenv |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

