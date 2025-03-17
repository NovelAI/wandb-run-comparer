#!/bin/bash

# This script starts both the backend and frontend services

echo "Starting Wandb Run Comparer..."

# Start the backend in a new terminal window
echo "Starting the backend..."
cd "$(dirname "$0")/backend"
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
python main.py &
BACKEND_PID=$!

# Give the backend a moment to start
sleep 2

# Start the frontend in a new terminal window
echo "Starting the frontend..."
cd "$(dirname "$0")/frontend"
npm install
npm run dev &
FRONTEND_PID=$!

echo "Services started!"
echo "Backend running at http://localhost:7100"
echo "Frontend running at http://localhost:5173"
echo "Press Ctrl+C to stop both services"

# Wait for Ctrl+C and then cleanup
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait