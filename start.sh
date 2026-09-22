#!/usr/bin/env bash
# SIH Legal Metrology Compliance Checker — Mac / Linux Launcher

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "========================================================================"
echo "  SIH Legal Metrology Compliance Checker (macOS / Linux Launcher)"
echo "  High-Speed On-Device AI Engine + Multimodal Vision Support"
echo "========================================================================"
echo ""

# 1. Select Python interpreter
if [ -f "/opt/anaconda3/bin/python3" ]; then
    PYTHON_CMD="/opt/anaconda3/bin/python3"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="$(command -v python3)"
else
    PYTHON_CMD="python"
fi

echo "Using Python: $($PYTHON_CMD --version) at $PYTHON_CMD"

# 2. Port selection (macOS AirPlay often holds port 5000, fallback to 5001)
PORT=5000
if lsof -i :5000 &>/dev/null; then
    echo "Notice: Port 5000 is in use (e.g., macOS AirPlay Receiver). Using Port 5001 instead."
    PORT=5001
fi
export PORT

echo "Starting server on http://localhost:$PORT ..."
echo ""

# 3. Open browser once server starts
(
    sleep 3
    if command -v open &>/dev/null; then
        open "http://localhost:$PORT"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:$PORT"
    fi
) &

# 4. Run Flask backend
cd "$BACKEND_DIR"
exec $PYTHON_CMD app.py
