FROM python:3.12-slim

WORKDIR /app

# Minimal system deps for httpx, fastembed (ONNX runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model so it's baked into the image.
# This means zero model-download time at runtime — startup is instant.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY . .

EXPOSE 8000

# Use shell form so $PORT env var is expanded (Render sets PORT at runtime).
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
