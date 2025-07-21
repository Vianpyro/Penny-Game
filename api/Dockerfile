FROM python:3.12.11-alpine3.22

# Install build dependencies
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN adduser --disabled-password --gecos "" apiuser

# Set working directory
WORKDIR /penny-game

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Use non-root user
USER apiuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/ || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
