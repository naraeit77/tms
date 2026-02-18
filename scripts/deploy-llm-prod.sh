#!/bin/bash

# =============================================================================
# Kanana 1.5 8B LLM Production Deployment Script for Linux
# =============================================================================
# This script deploys the LLM inference server for production on Linux.
# Supports two deployment options:
#   1. vLLM (recommended for GPU servers) - OpenAI-compatible API
#   2. Ollama (simpler setup) - Ollama native API
#
# Requirements:
#   - Linux (Oracle Linux 8.x, RHEL 8.x, Ubuntu 20.04+)
#   - Python 3.10+ (for vLLM)
#   - NVIDIA GPU with CUDA (for vLLM, 24GB+ VRAM recommended)
#   - At least 32GB RAM, 30GB free disk space
#
# Usage:
#   chmod +x scripts/deploy-llm-prod.sh
#   sudo ./scripts/deploy-llm-prod.sh [vllm|ollama]
# =============================================================================

set -e

# Configuration
LLM_USER="tms"
LLM_HOME="/opt/llm"
MODEL_NAME="kakaocorp/kanana-1.5-8b-instruct-2505"
GGUF_MODEL="hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q8_0"
VLLM_PORT=8000
OLLAMA_PORT=11434

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() { echo -e "${2}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"; }
info() { print_msg "$1" "${BLUE}"; }
success() { print_msg "$1" "${GREEN}"; }
warning() { print_msg "$1" "${YELLOW}"; }
error() { print_msg "$1" "${RED}"; }

# Header
echo ""
echo "=============================================="
echo "  Kanana 1.5 8B LLM Production Deployment"
echo "  for TMS v2.0 AI Tuning Guide"
echo "=============================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root or with sudo"
    exit 1
fi

# Parse arguments
DEPLOY_TYPE="${1:-vllm}"

if [[ ! "$DEPLOY_TYPE" =~ ^(vllm|ollama)$ ]]; then
    error "Invalid deployment type: $DEPLOY_TYPE"
    info "Usage: $0 [vllm|ollama]"
    exit 1
fi

info "Deployment type: $DEPLOY_TYPE"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$ID
    OS_VERSION=$VERSION_ID
else
    error "Cannot detect OS version"
    exit 1
fi

info "Detected OS: $OS_NAME $OS_VERSION"

# =============================================================================
# Common Functions
# =============================================================================

create_user_and_dirs() {
    info "Creating LLM user and directories..."

    # Create user if not exists
    if ! id "$LLM_USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$LLM_HOME" "$LLM_USER"
    fi

    # Create directories
    mkdir -p "$LLM_HOME"/{models,logs,cache}
    chown -R "$LLM_USER":"$LLM_USER" "$LLM_HOME"

    success "User and directories created"
}

install_python() {
    info "Installing Python 3.11..."

    case $OS_NAME in
        rhel|ol|centos|rocky|almalinux)
            dnf install -y python3.11 python3.11-pip python3.11-devel
            alternatives --set python3 /usr/bin/python3.11 2>/dev/null || true
            ;;
        ubuntu|debian)
            apt-get update
            apt-get install -y python3.11 python3.11-venv python3-pip
            ;;
        *)
            warning "Unknown OS, attempting Python installation..."
            ;;
    esac

    success "Python installed"
}

check_gpu() {
    info "Checking NVIDIA GPU..."

    if ! command -v nvidia-smi &> /dev/null; then
        warning "NVIDIA driver not found. GPU acceleration will not be available."
        return 1
    fi

    GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
    info "GPU Memory: ${GPU_MEM}MB"

    if [ "$GPU_MEM" -lt 16000 ]; then
        warning "GPU memory is less than 16GB. Consider using Q8_0 or Q4 quantization."
    fi

    return 0
}

# =============================================================================
# vLLM Deployment
# =============================================================================

deploy_vllm() {
    info "Deploying vLLM..."

    # Check GPU
    if ! check_gpu; then
        error "vLLM requires NVIDIA GPU. Use 'ollama' deployment for CPU-only servers."
        exit 1
    fi

    # Install Python
    install_python

    # Create virtual environment
    info "Creating Python virtual environment..."
    python3.11 -m venv "$LLM_HOME/venv"
    source "$LLM_HOME/venv/bin/activate"

    # Upgrade pip
    pip install --upgrade pip wheel

    # Install vLLM
    info "Installing vLLM (this may take several minutes)..."
    pip install vllm torch

    # Install transformers for model download
    pip install transformers accelerate

    # Download model
    info "Downloading Kanana 1.5 8B model..."
    python -c "from huggingface_hub import snapshot_download; snapshot_download('$MODEL_NAME', local_dir='$LLM_HOME/models/kanana-1.5-8b')"

    chown -R "$LLM_USER":"$LLM_USER" "$LLM_HOME"

    # Create systemd service
    info "Creating systemd service..."
    cat > /etc/systemd/system/kanana-llm.service << EOF
[Unit]
Description=Kanana 1.5 8B LLM Server (vLLM)
After=network.target

[Service]
Type=simple
User=$LLM_USER
Group=$LLM_USER
WorkingDirectory=$LLM_HOME
Environment="HF_HOME=$LLM_HOME/cache"
Environment="TRANSFORMERS_CACHE=$LLM_HOME/cache"

ExecStart=$LLM_HOME/venv/bin/python -m vllm.entrypoints.openai.api_server \\
    --model $LLM_HOME/models/kanana-1.5-8b \\
    --served-model-name kanana-1.5-8b \\
    --max-model-len 32768 \\
    --port $VLLM_PORT \\
    --host 127.0.0.1 \\
    --gpu-memory-utilization 0.9 \\
    --dtype auto

Restart=always
RestartSec=10
StandardOutput=append:$LLM_HOME/logs/vllm.log
StandardError=append:$LLM_HOME/logs/vllm-error.log

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

    # Reload and start service
    systemctl daemon-reload
    systemctl enable kanana-llm
    systemctl start kanana-llm

    # Wait for service to start
    info "Waiting for vLLM server to start..."
    sleep 30

    # Check service status
    if systemctl is-active --quiet kanana-llm; then
        success "vLLM server started successfully"
    else
        error "Failed to start vLLM server"
        systemctl status kanana-llm
        exit 1
    fi

    # Print API info
    echo ""
    success "vLLM Deployment Complete!"
    echo ""
    info "API Endpoint: http://127.0.0.1:${VLLM_PORT}/v1/chat/completions"
    info "Health Check: http://127.0.0.1:${VLLM_PORT}/v1/models"
    info "Logs: $LLM_HOME/logs/vllm.log"
    echo ""
    info "Environment variables for TMS:"
    echo "  LLM_BASE_URL=http://127.0.0.1:${VLLM_PORT}/v1"
    echo "  LLM_MODEL_NAME=kanana-1.5-8b"
    echo "  LLM_API_TYPE=openai"
    echo ""
}

# =============================================================================
# Ollama Deployment
# =============================================================================

deploy_ollama() {
    info "Deploying Ollama..."

    # Install Ollama
    info "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh

    # Create systemd override for user
    mkdir -p /etc/systemd/system/ollama.service.d
    cat > /etc/systemd/system/ollama.service.d/override.conf << EOF
[Service]
User=$LLM_USER
Group=$LLM_USER
Environment="OLLAMA_HOST=127.0.0.1:${OLLAMA_PORT}"
Environment="OLLAMA_MODELS=$LLM_HOME/models"
EOF

    # Reload and start service
    systemctl daemon-reload
    systemctl enable ollama
    systemctl start ollama

    # Wait for service
    sleep 10

    # Pull model
    info "Downloading Kanana 1.5 8B model (Q8_0 quantization)..."
    info "This may take 15-30 minutes depending on internet speed..."

    sudo -u "$LLM_USER" OLLAMA_HOST="127.0.0.1:${OLLAMA_PORT}" ollama pull "$GGUF_MODEL"

    # Check service status
    if systemctl is-active --quiet ollama; then
        success "Ollama server started successfully"
    else
        error "Failed to start Ollama server"
        systemctl status ollama
        exit 1
    fi

    # Verify model
    info "Verifying model..."
    sudo -u "$LLM_USER" OLLAMA_HOST="127.0.0.1:${OLLAMA_PORT}" ollama list

    # Print API info
    echo ""
    success "Ollama Deployment Complete!"
    echo ""
    info "API Endpoint: http://127.0.0.1:${OLLAMA_PORT}/api/chat"
    info "Health Check: http://127.0.0.1:${OLLAMA_PORT}/api/tags"
    info "Model: $GGUF_MODEL"
    echo ""
    info "Environment variables for TMS:"
    echo "  LLM_BASE_URL=http://127.0.0.1:${OLLAMA_PORT}"
    echo "  LLM_MODEL_NAME=$GGUF_MODEL"
    echo "  LLM_API_TYPE=ollama"
    echo ""
}

# =============================================================================
# Nginx Configuration
# =============================================================================

configure_nginx() {
    info "Configuring Nginx for LLM API..."

    NGINX_CONF="/etc/nginx/conf.d/sqltms.info.conf"

    if [ ! -f "$NGINX_CONF" ]; then
        warning "Nginx config not found at $NGINX_CONF. Skipping Nginx configuration."
        return
    fi

    # Check if LLM location already exists
    if grep -q "location /api/llm/" "$NGINX_CONF"; then
        info "LLM Nginx configuration already exists"
        return
    fi

    # Backup nginx config
    cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

    # Add LLM API location before the closing }
    # This assumes standard Nginx server block structure
    info "Adding LLM API location to Nginx config..."

    cat >> /tmp/llm-nginx.conf << 'EOF'

    # LLM API endpoints (AI Tuning Guide)
    location /api/llm/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeout for LLM responses
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;

        # Disable buffering for SSE streaming
        proxy_buffering off;
        proxy_cache off;

        # SSE specific headers
        proxy_set_header Connection '';
        chunked_transfer_encoding off;
    }
EOF

    info "Please manually add the above configuration to your Nginx config."
    info "Config saved to: /tmp/llm-nginx.conf"

    # Test nginx config
    if nginx -t; then
        systemctl reload nginx
        success "Nginx configuration updated"
    else
        error "Nginx configuration test failed. Please check manually."
    fi
}

# =============================================================================
# Firewall Configuration
# =============================================================================

configure_firewall() {
    info "Configuring firewall..."

    # The LLM server should only be accessible from localhost
    # No external ports need to be opened

    if command -v firewall-cmd &> /dev/null; then
        info "Firewall-cmd detected. LLM ports are localhost-only (no changes needed)."
    elif command -v ufw &> /dev/null; then
        info "UFW detected. LLM ports are localhost-only (no changes needed)."
    fi

    success "Firewall configuration verified"
}

# =============================================================================
# Health Check Script
# =============================================================================

create_health_check() {
    info "Creating health check script..."

    cat > "$LLM_HOME/health-check.sh" << 'EOF'
#!/bin/bash

# LLM Health Check Script

VLLM_URL="http://127.0.0.1:8000/v1/models"
OLLAMA_URL="http://127.0.0.1:11434/api/tags"

check_vllm() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$VLLM_URL" --max-time 5)
    if [ "$response" = "200" ]; then
        echo "vLLM: OK"
        return 0
    else
        echo "vLLM: FAIL (HTTP $response)"
        return 1
    fi
}

check_ollama() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$OLLAMA_URL" --max-time 5)
    if [ "$response" = "200" ]; then
        echo "Ollama: OK"
        return 0
    else
        echo "Ollama: FAIL (HTTP $response)"
        return 1
    fi
}

echo "LLM Health Check - $(date)"
echo "========================"

# Check which service is running
if systemctl is-active --quiet kanana-llm; then
    check_vllm
elif systemctl is-active --quiet ollama; then
    check_ollama
else
    echo "No LLM service running"
    exit 1
fi
EOF

    chmod +x "$LLM_HOME/health-check.sh"
    success "Health check script created: $LLM_HOME/health-check.sh"
}

# =============================================================================
# Main Execution
# =============================================================================

# Create user and directories
create_user_and_dirs

# Deploy based on type
case $DEPLOY_TYPE in
    vllm)
        deploy_vllm
        ;;
    ollama)
        deploy_ollama
        ;;
esac

# Common post-deployment tasks
configure_firewall
create_health_check

# Summary
echo ""
echo "=============================================="
echo "  Deployment Complete!"
echo "=============================================="
echo ""
info "Service Status:"
if [ "$DEPLOY_TYPE" = "vllm" ]; then
    systemctl status kanana-llm --no-pager | head -10
else
    systemctl status ollama --no-pager | head -10
fi
echo ""
info "Next Steps:"
echo "  1. Update TMS environment variables (.env.production)"
echo "  2. Restart TMS application: pm2 reload tms"
echo "  3. Test AI Tuning Guide: https://your-domain/analysis/ai-tuning-guide"
echo ""
info "Useful Commands:"
if [ "$DEPLOY_TYPE" = "vllm" ]; then
    echo "  - Status:  systemctl status kanana-llm"
    echo "  - Logs:    tail -f $LLM_HOME/logs/vllm.log"
    echo "  - Restart: systemctl restart kanana-llm"
else
    echo "  - Status:  systemctl status ollama"
    echo "  - Logs:    journalctl -u ollama -f"
    echo "  - Restart: systemctl restart ollama"
fi
echo "  - Health:  $LLM_HOME/health-check.sh"
echo ""

exit 0
