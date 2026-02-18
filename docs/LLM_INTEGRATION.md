# Kanana 1.5 8B LLM Integration Guide

TMS v2.0의 AI 튜닝 가이드 기능에 Kanana 1.5 8B 모델을 통합하는 가이드입니다.

## 개요

Kanana 1.5 8B는 Kakao에서 개발한 한영 이중언어 대규모 언어 모델입니다. TMS v2.0의 AI 튜닝 가이드 기능은 이 모델을 사용하여 Oracle SQL 튜닝 분석, 실행계획 해석, 인덱스 권장, SQL 재작성 등의 기능을 제공합니다.

### 모델 사양

| 항목 | 사양 |
|------|------|
| **모델명** | kakaocorp/kanana-1.5-8b-instruct-2505 |
| **파라미터** | 8B |
| **컨텍스트 길이** | 32K (native), 128K (YaRN) |
| **라이선스** | Apache 2.0 |
| **지원 언어** | 한국어, 영어 |

### 주요 기능

- **SQL 성능 튜닝**: SQL 성능 분석 및 최적화 권장사항 제공
- **실행계획 설명**: 실행계획을 이해하기 쉽게 설명
- **인덱스 권장**: 인덱스 설계 및 CREATE INDEX DDL 생성
- **SQL 재작성**: 더 효율적인 SQL로 재작성 제안

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      TMS v2.0                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Dashboard   │  │ SQL 분석    │  │ AI 튜닝 가이드      │  │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
│                                               │             │
└───────────────────────────────────────────────┼─────────────┘
                                                │ REST API
                                                │ (SSE Streaming)
                                                ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLM 추론 서버                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Ollama (개발) / vLLM (운영)                         │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │         Kanana 1.5 8B Instruct              │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 컴포넌트

1. **TMS Next.js App**: AI 튜닝 가이드 페이지 및 API 라우트
2. **LLM Client Library**: `src/lib/llm/` - Ollama/vLLM 통합 클라이언트
3. **LLM Inference Server**: Ollama(개발) 또는 vLLM(운영)
4. **Kanana 1.5 8B Model**: 한영 이중언어 LLM

---

## 하드웨어 요구사항

### 개발 환경 (macOS)

| 항목 | 요구사항 |
|------|---------|
| **OS** | macOS (Apple Silicon 권장) |
| **RAM** | 16GB 이상 |
| **GPU/Neural Engine** | Apple M1/M2/M3 (8GB 통합 메모리) |
| **Storage** | 10GB 이상 여유 공간 |
| **모델** | Q4_K_M 양자화 (~5GB) |

### 운영 환경 (Linux)

| 항목 | vLLM (권장) | Ollama |
|------|-------------|--------|
| **OS** | Oracle Linux 8.x / RHEL 8.x | 동일 |
| **RAM** | 32GB 이상 | 24GB 이상 |
| **GPU** | NVIDIA 24GB+ VRAM | 16GB+ VRAM (선택) |
| **Storage** | 30GB 이상 | 15GB 이상 |
| **모델** | BF16 원본 (~16GB) | Q8_0 양자화 (~8.5GB) |

---

## 설치 가이드

### 개발 환경 (macOS + Ollama)

#### 1. 자동 설치

```bash
# 스크립트 실행 권한 부여
chmod +x scripts/setup-llm-dev.sh

# 설치 실행
./scripts/setup-llm-dev.sh
```

#### 2. 수동 설치

```bash
# Homebrew로 Ollama 설치
brew install ollama

# Ollama 서비스 시작
ollama serve &

# Kanana 모델 다운로드 (Q4_K_M 양자화)
ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M

# 설치 확인
ollama list
```

#### 3. 환경변수 설정

`.env.local` 파일에 추가:

```bash
# LLM Configuration
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=120000
FEATURE_AI_TUNING_GUIDE=true
```

---

### 운영 환경 (Linux + vLLM)

#### 1. 자동 설치

```bash
# root 또는 sudo로 실행
sudo chmod +x scripts/deploy-llm-prod.sh

# vLLM 배포 (GPU 필수)
sudo ./scripts/deploy-llm-prod.sh vllm

# 또는 Ollama 배포 (CPU/GPU)
sudo ./scripts/deploy-llm-prod.sh ollama
```

#### 2. 수동 설치 (vLLM)

```bash
# 사용자 및 디렉토리 생성
sudo useradd -r -s /bin/false -d /opt/llm tms
sudo mkdir -p /opt/llm/{models,logs,cache}

# Python 가상환경 설정
python3.11 -m venv /opt/llm/venv
source /opt/llm/venv/bin/activate

# vLLM 설치
pip install vllm torch transformers accelerate

# 모델 다운로드
python -c "from huggingface_hub import snapshot_download; snapshot_download('kakaocorp/kanana-1.5-8b-instruct-2505', local_dir='/opt/llm/models/kanana-1.5-8b')"

# 소유권 설정
sudo chown -R tms:tms /opt/llm
```

#### 3. systemd 서비스 설정

`/etc/systemd/system/kanana-llm.service` 생성:

```ini
[Unit]
Description=Kanana 1.5 8B LLM Server (vLLM)
After=network.target

[Service]
Type=simple
User=tms
Group=tms
WorkingDirectory=/opt/llm
Environment="HF_HOME=/opt/llm/cache"

ExecStart=/opt/llm/venv/bin/python -m vllm.entrypoints.openai.api_server \
    --model /opt/llm/models/kanana-1.5-8b \
    --served-model-name kanana-1.5-8b \
    --max-model-len 32768 \
    --port 8000 \
    --host 127.0.0.1 \
    --gpu-memory-utilization 0.9

Restart=always
RestartSec=10
StandardOutput=append:/opt/llm/logs/vllm.log
StandardError=append:/opt/llm/logs/vllm-error.log

[Install]
WantedBy=multi-user.target
```

서비스 시작:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kanana-llm
sudo systemctl start kanana-llm
```

#### 4. 환경변수 설정 (운영)

`.env.production` 파일에 추가:

```bash
# LLM Configuration (vLLM)
LLM_BASE_URL=http://127.0.0.1:8000/v1
LLM_MODEL_NAME=kanana-1.5-8b
LLM_API_TYPE=openai
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=120000
FEATURE_AI_TUNING_GUIDE=true
```

---

## Nginx 설정

`/etc/nginx/conf.d/sqltms.info.conf`에 추가:

```nginx
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
```

설정 적용:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## API 사용법

### Health Check

```bash
# 개발 (Ollama)
curl http://localhost:3000/api/llm/health

# 응답 예시
{
  "success": true,
  "data": {
    "healthy": true,
    "model": "kanana-1.5-8b",
    "latency": 45,
    "timestamp": "2025-05-26T10:30:00.000Z"
  }
}
```

### SQL 분석 (Non-streaming)

```bash
curl -X POST http://localhost:3000/api/llm/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sql_text": "SELECT * FROM employees WHERE department_id = 10",
    "context": "tuning",
    "language": "ko"
  }'
```

### SQL 분석 (Streaming)

```bash
curl -X POST http://localhost:3000/api/llm/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "sql_text": "SELECT * FROM employees WHERE department_id = 10",
    "context": "tuning",
    "language": "ko"
  }'
```

### 분석 컨텍스트

| Context | 설명 |
|---------|------|
| `tuning` | SQL 성능 분석 및 최적화 권장 |
| `explain` | SQL 및 실행계획 설명 |
| `index` | 인덱스 설계 및 DDL 생성 |
| `rewrite` | SQL 재작성 제안 |

---

## 트러블슈팅

### LLM 서버 연결 실패

```bash
# Ollama 상태 확인
curl http://localhost:11434/api/tags

# vLLM 상태 확인
curl http://localhost:8000/v1/models

# 서비스 로그 확인
# Ollama
journalctl -u ollama -f

# vLLM
tail -f /opt/llm/logs/vllm.log
```

### 메모리 부족

vLLM에서 OOM 발생 시:

```bash
# GPU 메모리 사용량 확인
nvidia-smi

# gpu-memory-utilization 조정 (0.9 -> 0.8)
# /etc/systemd/system/kanana-llm.service 수정 후
sudo systemctl daemon-reload
sudo systemctl restart kanana-llm
```

Ollama에서 메모리 부족 시:

```bash
# Q4_K_M 대신 IQ4_XS 사용 (더 작은 양자화)
ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:IQ4_XS
```

### 응답 속도가 느린 경우

1. GPU 가속 확인 (vLLM)
2. 모델 양자화 레벨 조정 (Ollama)
3. `max-model-len` 감소 (32768 -> 16384)
4. 동시 요청 제한 설정

---

## 모니터링

### 헬스체크 스크립트

```bash
# 운영 서버
/opt/llm/health-check.sh

# 출력 예시
LLM Health Check - 2025-05-26 10:30:00
========================
vLLM: OK
```

### PM2 모니터링

```bash
# TMS 앱 상태
pm2 status

# LLM API 로그
pm2 logs tms --lines 100 | grep -i llm
```

### 성능 지표

| 지표 | 목표값 |
|------|--------|
| Health Check Latency | < 100ms |
| 첫 토큰 응답 시간 | < 2s |
| 전체 응답 시간 | < 30s (일반) / < 60s (복잡) |
| 요청 성공률 | > 99% |

---

## 보안 고려사항

1. **LLM 서버 접근 제한**: localhost만 접근 가능하도록 설정
2. **API 인증**: NextAuth 세션 인증 적용
3. **입력 검증**: SQL 텍스트 길이 및 형식 검증
4. **로깅**: 요청/응답 로깅 (민감 정보 제외)
5. **Rate Limiting**: API 요청 제한 고려

---

## 참고 자료

- [Kanana GitHub](https://github.com/kakao/kanana)
- [Kanana 1.5 8B on Hugging Face](https://huggingface.co/kakaocorp/kanana-1.5-8b-instruct-2505)
- [Kanana GGUF Models](https://huggingface.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF)
- [Ollama Documentation](https://ollama.com/)
- [vLLM Documentation](https://docs.vllm.ai/)
- [Kanana Technical Report](https://arxiv.org/abs/2502.18934)
