# ─────────────────────────────────────────────────────────────────────────────
# SIH Legal Metrology Compliance Checker — Production Dockerfile
# Base: python:3.10-slim (stable for EasyOCR + OpenCV on Linux)
# NOTE: EasyOCR models are downloaded on first scan request (lazy init)
#       to keep startup RAM usage low for Render free tier (512MB limit)
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.10-slim

# System packages required by OpenCV and EasyOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (cached layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 8000

# Production server: gunicorn with 1 worker (RAM constrained on free tier)
# timeout=300 allows EasyOCR to load on first request without timing out
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8000} --timeout 300 --workers 1 app:app"]
