#!/bin/bash
# PostgreSQL 비정상 종료 시 남는 stale postmaster.pid를 정리하고 서버 기동을 보장하는 재발 방지 스크립트
set -uo pipefail

SERVICE="postgresql@17"
DATADIR="/opt/homebrew/var/postgresql@17"
PIDFILE="$DATADIR/postmaster.pid"
PGBIN="/opt/homebrew/opt/postgresql@17/bin/postgres"
LOG="/opt/homebrew/var/log/pg-ensure.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [pg-ensure] $*" | tee -a "$LOG"; }

# 1) stale pid 파일 정리: pid 파일이 있지만 그 PID가 실제 postgres 프로세스가 아니면 stale로 간주하고 삭제
if [ -f "$PIDFILE" ]; then
  PID="$(head -1 "$PIDFILE" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$PID" ] && ps -p "$PID" -o command= 2>/dev/null | grep -q "postgres"; then
    log "정상: postmaster.pid의 PID $PID 가 살아있는 postgres 프로세스임. 조치 없음."
  else
    RUNNING_CMD="$(ps -p "${PID:-0}" -o command= 2>/dev/null || true)"
    log "stale postmaster.pid 감지 (PID=$PID, 실제 프로세스='${RUNNING_CMD:-없음}'). 삭제함."
    rm -f "$PIDFILE"
  fi
fi

# 2) 접속 가능 여부 확인, 안 되면 서비스 기동
if /opt/homebrew/opt/postgresql@17/bin/pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  log "정상: PostgreSQL 접속 가능."
  exit 0
fi

log "PostgreSQL 응답 없음. 서비스 기동 시도."
brew services start "$SERVICE" >>"$LOG" 2>&1

# 기동 대기 (최대 15초)
for i in $(seq 1 15); do
  if /opt/homebrew/opt/postgresql@17/bin/pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    log "복구 완료: PostgreSQL 접속 가능."
    exit 0
  fi
  sleep 1
done

log "경고: 기동 시도 후에도 접속 불가. 수동 확인 필요 (brew services list, $LOG)."
exit 1
