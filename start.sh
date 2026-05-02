#!/bin/bash
# WardrobeAI — start backend + frontend in one command
# Prerequisites: Ollama installed and model pulled
#   ollama pull llama3.1:8b   (or: ollama pull llama3.2 for lighter model)
# Usage: ./start.sh
#        OLLAMA_MODEL=llama3.2 ./start.sh   (to use the 3B model)

set -e

echo "🧥 WardrobeAI — starting up..."
echo "   Model: ${OLLAMA_MODEL:-llama3.1:8b}"

# Check Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠  Ollama not detected. Starting ollama serve in background..."
    ollama serve &
    sleep 3
fi

# Backend
echo "→ Installing Python dependencies..."
cd backend
pip install -r requirements.txt -q
echo "→ Starting Flask backend on :5000..."
python app.py &
BACKEND_PID=$!
cd ..

sleep 2

# Frontend
echo "→ Installing Node dependencies..."
cd frontend
npm install --silent
echo "→ Starting React frontend on :3000..."
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ WardrobeAI running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo "   Model:    ${OLLAMA_MODEL:-llama3.1:8b} via Ollama (no API key needed)"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
