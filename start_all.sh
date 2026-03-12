#!/bin/bash
# start_all.sh — Start backend, frontend, and AI worker in one command.
# Run from the project root: bash start_all.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/services"
mkdir -p "$LOG_DIR"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Backend ────────────────────────────────────────────────────────────────
echo -e "${CYAN}[BACKEND]   Starting FastAPI on :8000...${NC}"
(
  cd "$PROJECT_ROOT/backend"
  PYTHONUTF8=1 "$PROJECT_ROOT/backend/venv/Scripts/python.exe" -m uvicorn app.main:app \
    --reload --host 0.0.0.0 --port 8000
) > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# ─── Frontend ────────────────────────────────────────────────────────────────
echo -e "${GREEN}[FRONTEND]  Starting Vite dev server...${NC}"
(
  cd "$PROJECT_ROOT/frontend"
  npm run dev
) > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# ─── AI Worker ───────────────────────────────────────────────────────────────
# Uses the dedicated 'ai_worker' conda environment Python binary directly,
# which avoids needing to activate conda in the script.
echo -e "${MAGENTA}[AI WORKER] Starting AI worker (ai_worker env)...${NC}"
"C:/Users/dell/miniconda3/envs/ai_worker/python.exe" -m ai_worker \
  > "$LOG_DIR/ai_worker.log" 2>&1 &
AI_PID=$!

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}All services started.${NC}"
echo "  Backend   PID $BACKEND_PID  → logs/services/backend.log"
echo "  Frontend  PID $FRONTEND_PID → logs/services/frontend.log"
echo "  AI Worker PID $AI_PID       → logs/services/ai_worker.log"
echo ""
echo "Press Ctrl+C to stop all services."

# Kill all child processes cleanly on Ctrl+C
trap "
  echo ''
  echo 'Stopping all services...'
  kill $BACKEND_PID $FRONTEND_PID $AI_PID 2>/dev/null
  exit 0
" INT TERM

wait
