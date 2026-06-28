FROM python:3.12-slim

WORKDIR /app

# System dependencies — base build tools + libs required by OpenCV and torch
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libpq-dev \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (single file — API + ML)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
