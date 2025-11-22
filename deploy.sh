#!/bin/bash

# ====================================
# TMS v2.0 Deployment Script
# ====================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    print_error ".env.production file not found!"
    print_info "Copy .env.production.example to .env.production and configure it"
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

print_info "Starting TMS v2.0 deployment..."

# Stop existing containers
print_info "Stopping existing containers..."
docker-compose down || true

# Pull latest code (if using git)
if [ -d ".git" ]; then
    print_info "Pulling latest code..."
    git pull origin main
fi

# Install/Update dependencies
print_info "Installing dependencies..."
npm ci --only=production

# Build application
print_info "Building application..."
npm run build

# Build Docker image
print_info "Building Docker image..."
docker-compose build

# Start containers
print_info "Starting containers..."
docker-compose up -d

# Wait for health check
print_info "Waiting for application to be healthy..."
sleep 10

# Check health
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    print_info "✓ Deployment successful!"
    print_info "Application is running at http://localhost:3000"
else
    print_error "✗ Health check failed!"
    print_info "Check logs with: docker-compose logs -f"
    exit 1
fi

# Show running containers
print_info "Running containers:"
docker-compose ps
