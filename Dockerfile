# ─────────────────────────────────────────────────────────────────────────────
# SIH Legal Metrology Compliance Checker — Production Dockerfile
# Base: python:3.10-slim (stable for EasyOCR + OpenCV on Linux)
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

# Pre-download model weights at BUILD time so first scan has ZERO download delay
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1
RUN python -c "import easyocr; print('[BUILD] Caching OCR models...'); easyocr.Reader(['en'], gpu=False); print('[BUILD] Done.')"

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 8000

# Gunicorn with 1 worker and 120s timeout
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8000} --timeout 120 --workers 1 app:app"]
