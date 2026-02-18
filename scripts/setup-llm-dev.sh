#!/bin/bash

# =============================================================================
# Kanana 1.5 8B LLM Development Setup Script for macOS
# =============================================================================
# This script sets up the LLM inference server for local development.
# It installs Ollama and downloads the Kanana 1.5 8B model (GGUF format).
#
# Requirements:
#   - macOS (Apple Silicon recommended)
#   - Homebrew installed
#   - At least 16GB RAM, 10GB free disk space
#
# Usage:
#   chmod +x scripts/setup-llm-dev.sh
#   ./scripts/setup-llm-dev.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_msg() {
    echo -e "${2}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

info() { print_msg "$1" "${BLUE}"; }
success() { print_msg "$1" "${GREEN}"; }
warning() { print_msg "$1" "${YELLOW}"; }
error() { print_msg "$1" "${RED}"; }

# Header
echo ""
echo "=============================================="
echo "  Kanana 1.5 8B LLM Development Setup"
echo "  for TMS v2.0 AI Tuning Guide"
echo "=============================================="
echo ""

# Check for macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    error "This script is for macOS only."
    error "For Linux, use scripts/deploy-llm-prod.sh instead."
    exit 1
fi

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    error "Homebrew is required but not installed."
    info "Install Homebrew from https://brew.sh"
    exit 1
fi

# Check available disk space (need at least 10GB)
available_space=$(df -g . | tail -1 | awk '{print $4}')
if [ "$available_space" -lt 10 ]; then
    warning "Low disk space: ${available_space}GB available. Need at least 10GB."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Install Ollama
info "Step 1: Installing Ollama..."

if command -v ollama &> /dev/null; then
    success "Ollama is already installed."
    ollama --version
else
    info "Installing Ollama via Homebrew..."
    brew install ollama
    success "Ollama installed successfully."
fi

# Step 2: Start Ollama service
info "Step 2: Starting Ollama service..."

# Check if Ollama is already running
if pgrep -x "ollama" > /dev/null; then
    success "Ollama service is already running."
else
    info "Starting Ollama service in background..."
    ollama serve &
    sleep 5

    if pgrep -x "ollama" > /dev/null; then
        success "Ollama service started."
    else
        error "Failed to start Ollama service."
        exit 1
    fi
fi

# Step 3: Pull Kanana 1.5 8B model
info "Step 3: Downloading Kanana 1.5 8B model..."
info "This may take 10-30 minutes depending on your internet speed."
info "Model size: ~5GB (Q4_K_M quantization)"
echo ""

# Use Q4_K_M quantization for balanced quality/performance
MODEL_NAME="hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M"

# Check if model already exists
if ollama list 2>/dev/null | grep -q "kanana"; then
    success "Kanana model is already downloaded."
else
    info "Pulling model: ${MODEL_NAME}"
    ollama pull "${MODEL_NAME}"
    success "Model downloaded successfully."
fi

# Step 4: Verify installation
info "Step 4: Verifying installation..."

echo ""
info "Available models:"
ollama list

# Step 5: Test the model
info "Step 5: Testing model..."

TEST_RESPONSE=$(ollama run "${MODEL_NAME}" "Say 'Hello, TMS!' in Korean" 2>/dev/null | head -1)
if [ -n "$TEST_RESPONSE" ]; then
    success "Model test passed!"
    echo "Response: ${TEST_RESPONSE}"
else
    warning "Model test returned empty response. This may be normal."
fi

# Step 6: Create environment file
info "Step 6: Setting up environment variables..."

ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
    # Backup existing file
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    info "Backed up existing ${ENV_FILE}"
fi

# Add LLM configuration if not exists
if ! grep -q "LLM_BASE_URL" "$ENV_FILE" 2>/dev/null; then
    cat >> "$ENV_FILE" << 'EOF'

# -------------------------------------
# LLM Configuration (Kanana 1.5 8B)
# -------------------------------------
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=120000
FEATURE_AI_TUNING_GUIDE=true
EOF
    success "LLM environment variables added to ${ENV_FILE}"
else
    info "LLM environment variables already exist in ${ENV_FILE}"
fi

# Summary
echo ""
echo "=============================================="
echo "  Setup Complete!"
echo "=============================================="
echo ""
success "Ollama is running at: http://localhost:11434"
success "Model: Kanana 1.5 8B Instruct (Q4_K_M)"
echo ""
info "Quick Commands:"
echo "  - Start Ollama:  ollama serve"
echo "  - Stop Ollama:   pkill ollama"
echo "  - Test chat:     ollama run '${MODEL_NAME}' 'Hello'"
echo "  - List models:   ollama list"
echo ""
info "API Endpoints:"
echo "  - Health:    GET  http://localhost:11434/api/tags"
echo "  - Chat:      POST http://localhost:11434/api/chat"
echo "  - Generate:  POST http://localhost:11434/api/generate"
echo ""
info "Next Steps:"
echo "  1. Start the TMS development server: npm run dev"
echo "  2. Visit: http://localhost:3000/analysis/ai-tuning-guide"
echo ""

# Optional: Create Modelfile for custom configuration
info "Creating custom Modelfile for Oracle SQL tuning..."

cat > Modelfile.kanana << 'EOF'
FROM hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M

# System prompt for Oracle SQL tuning expert
SYSTEM """당신은 Oracle 데이터베이스 SQL 튜닝 전문가입니다. 20년 이상의 경험을 가진 시니어 DBA로서 분석합니다.

전문 분야:
- Oracle 실행계획 분석 및 최적화
- 인덱스 설계 및 권장
- SQL 쿼리 재작성 및 최적화
- 성능 병목 현상 진단 및 해결

응답 원칙:
- 한국어로 응답하되 SQL 키워드는 영문 유지
- Oracle 12c 이상 문법 사용
- 바인드 변수 사용 권장
- 실행계획 힌트는 최후의 수단으로 제안
"""

# Performance parameters
PARAMETER temperature 0.3
PARAMETER num_predict 4096
PARAMETER top_p 0.9
PARAMETER top_k 40
EOF

info "Custom Modelfile created: Modelfile.kanana"
info "To use custom model: ollama create kanana-sql-tuner -f Modelfile.kanana"
echo ""

exit 0
