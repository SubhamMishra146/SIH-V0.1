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

# Install Python dependencies (cached layer — only re-runs if requirements change)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── PRE-BAKE EasyOCR model weights at BUILD time ────────────────────────────
# Prevents the container from downloading 100MB of models during live demo
# or Render cold-start (which has a 60s timeout limit)
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1
RUN python -c "\
import easyocr; \
print('[BUILD] Pre-downloading EasyOCR models into image...'); \
reader = easyocr.Reader(['en'], gpu=False); \
print('[BUILD] EasyOCR models cached.')"

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# Expose port (Render sets $PORT at runtime, defaults to 8000)
EXPOSE 8000

# Production server: gunicorn (not Flask dev server)
# timeout=120 gives EasyOCR time to process high-res images
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8000} --timeout 120 --workers 1 app:app"]
