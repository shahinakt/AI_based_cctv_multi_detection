# AI-Based CCTV Multi-Detection System

A full-stack AI-powered CCTV system for real-time detection of incidents (abuse, theft, accidents) with blockchain-verified evidence storage.

## Features

- **AI Detection**: YOLOv8 object detection + pose analysis for incident detection
- **FastAPI Backend**: RESTful API for incident management and camera feeds
- **PostgreSQL Database**: Incident logging and user management
- **Blockchain Integration**: Tamper-proof evidence storage on Polygon
- **Web Dashboard**: React-based monitoring interface
- **Mobile App**: Cross-platform mobile app built with Expo
- **Real-time Alerts**: Instant notifications for detected incidents

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Cameras   │────▶│  AI Worker   │────▶│   Backend   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                     │
                           │                     ▼
                           │              ┌─────────────┐
                           │              │  PostgreSQL │
                           │              └─────────────┘
                           ▼
                    ┌──────────────┐           │
                    │  Blockchain  │◀──────────┘
                    └──────────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
         ┌─────────────┐      ┌─────────────┐
         │  Web Client │      │Mobile Client│
         └─────────────┘      └─────────────┘
```

## Prerequisites

- **Python 3.9+**
- **Node.js 18+** & npm
- **PostgreSQL** (or Docker)
- **Git**

## Quick Setup

### 1. Clone Third-party Dependencies

```bash
# Clone temporal-shift-module for advanced video analysis
git clone https://github.com/mit-han-lab/temporal-shift-module.git
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload --port 8000
```

### 3. AI Worker Setup

```bash
cd ai_worker

# Install dependencies
pip install -r requirements.txt

# Download YOLOv8 model (if not included)
# The model will be automatically downloaded on first run

# Start AI worker
python -m ai_worker
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 5. Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo
npm start
```

### 6. Blockchain Setup

```bash
cd blockchain

# Install dependencies
npm install

# Start local blockchain (for testing)
npm run blockchain

# Deploy contracts
npm run deploy
```

## Running the Full System

Use the provided batch script to start all modules:

```bash
./start_all_modules.bat
```

Or start each component individually in separate terminals as shown above.

## Project Structure

```
├── ai_worker/           # AI inference engine
│   ├── inference/       # Detection workers
│   ├── models/          # AI model definitions
│   └── utils/           # Helper utilities
├── backend/             # FastAPI backend
│   ├── app/             # Application code
│   ├── alembic/         # Database migrations
│   └── data/            # Application data
├── blockchain/          # Smart contracts
│   ├── contracts/       # Solidity contracts
│   └── scripts/         # Deployment scripts
├── frontend/            # React web dashboard
│   └── src/             # Source code
├── mobile/              # Expo mobile app
│   ├── screens/         # App screens
│   └── components/      # Reusable components
└── temporal-shift-module/ # Third-party video analysis (not tracked)
```

## Environment Variables

Create `.env` files in `backend/` and `ai_worker/` directories:

**backend/.env:**
```env
DATABASE_URL=postgresql://user:password@localhost/cctv_db
BLOCKCHAIN_PROVIDER_URL=http://localhost:8545
SECRET_KEY=your-secret-key
```

**ai_worker/.env:**
```env
BACKEND_URL=http://localhost:8000
CAMERA_SOURCES={"cam1": "rtsp://..."}
```

## Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Built with ❤️ for safer communities**
