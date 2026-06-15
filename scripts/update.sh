#!/usr/bin/env bash
# ============================================================
#  Aktualizacja aplikacji BioKrap z gita
#  Uruchamiaj w folderze projektu: bash scripts/update.sh
#  albo: ./scripts/update.sh   (po jednorazowym: chmod +x scripts/update.sh)
# ============================================================
#
# Co robi:
#   1. Zabezpiecza .env i docker-compose.yml przed nadpisaniem (skip-worktree)
#   2. Robi backup bazy do ~/backups/biokrap-YYYYMMDD-HHMM.sql
#   3. git fetch + git pull --ff-only
#   4. Wykonuje wszystkie migracje SQL z supabase/migrations/ (idempotentne)
#   5. Rebuild aplikacji z --no-cache (żeby VITE_* trafiło do /app/dist)
#   6. Weryfikacja: env w kontenerze + grep IP w /app/dist
#
# Wymagania: docker, docker compose, git, dostęp do kontenera supabase-db
# ============================================================

set -euo pipefail

# ---------- KONFIGURACJA ----------
PROJECT_DIR="${PROJECT_DIR:-$HOME/biokrap}"
APP_CONTAINER="${APP_CONTAINER:-biokrap-app}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
EXPECTED_IP="${EXPECTED_IP:-10.0.0.108}"   # zmień jeśli serwer ma inny IP
# ----------------------------------

# Kolorki
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[UWAGA]${NC} $*"; }
err()  { echo -e "${RED}[BŁĄD]${NC} $*" >&2; }

trap 'err "Skrypt przerwany w linii $LINENO. Sprawdź log powyżej."' ERR

# ---------- 0. Sanity check ----------
cd "$PROJECT_DIR" || { err "Nie ma folderu $PROJECT_DIR"; exit 1; }
[ -d .git ]              || { err "$PROJECT_DIR to nie repo gita"; exit 1; }
[ -f docker-compose.yml ] || { err "Brak docker-compose.yml w $PROJECT_DIR"; exit 1; }
[ -f .env ]               || warn "Brak .env w $PROJECT_DIR — buduj się może nie powieść"

log "Folder: $PROJECT_DIR"
log "Kontener aplikacji: $APP_CONTAINER, baza: $DB_CONTAINER"

# ---------- 1. Zamroź pliki konfiguracyjne ----------
log "[1/6] Zabezpieczam .env i docker-compose.yml przed git pull..."
git update-index --skip-worktree .env 2>/dev/null || true
git update-index --skip-worktree docker-compose.yml 2>/dev/null || true
ok "Zamrożone: $(git ls-files -v | grep '^S' | awk '{print $2}' | tr '\n' ' ')"

# ---------- 2. Backup bazy ----------
log "[2/6] Backup bazy..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/biokrap-$(date +%Y%m%d-%H%M).sql"
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
  ok "Backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # czyść backupy starsze niż 30 dni
  find "$BACKUP_DIR" -name 'biokrap-*.sql' -mtime +30 -delete 2>/dev/null || true
else
  warn "Kontener $DB_CONTAINER nie działa — pomijam backup"
fi

# ---------- 3. Git pull ----------
log "[3/6] Pobieram zmiany z gita..."
OLD_HEAD=$(git rev-parse HEAD)
git fetch origin
git pull --ff-only
NEW_HEAD=$(git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  warn "Brak nowych commitów — nic się nie zmieniło w kodzie"
else
  ok "Zmiany: $OLD_HEAD -> $NEW_HEAD"
  echo "Pliki zmienione:"
  git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | sed 's/^/  /'
fi

# ---------- 4. Migracje SQL ----------
log "[4/6] Wykonuję migracje z supabase/migrations/..."
if [ -d supabase/migrations ] && [ -n "$(ls -A supabase/migrations/*.sql 2>/dev/null)" ]; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    err "Kontener $DB_CONTAINER nie działa — uruchom Supabase i powtórz"
    exit 1
  fi

  MIG_OK=0; MIG_FAIL=0
  for f in supabase/migrations/*.sql; do
    name=$(basename "$f")
    echo -n "  -> $name ... "
    if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=0 -q < "$f" >/tmp/mig.log 2>&1; then
      echo -e "${GREEN}OK${NC}"
      MIG_OK=$((MIG_OK+1))
    else
      echo -e "${YELLOW}błąd (prawdopodobnie już zastosowane)${NC}"
      MIG_FAIL=$((MIG_FAIL+1))
    fi
  done
  ok "Migracje: $MIG_OK OK, $MIG_FAIL pominięte/błąd (idempotentne - to normalne)"
else
  warn "Brak plików migracji"
fi

# ---------- 5. Rebuild aplikacji ----------
log "[5/6] Rebuild aplikacji (--no-cache, to potrwa kilka minut)..."
docker compose down
docker compose build --no-cache app
docker compose up -d
ok "Kontenery wstały"

# ---------- 6. Weryfikacja ----------
log "[6/6] Weryfikacja..."
sleep 3

echo ""
echo "=== docker compose ps ==="
docker compose ps

echo ""
echo "=== SUPABASE_URL w kontenerze ==="
ENV_URL=$(docker exec "$APP_CONTAINER" sh -lc 'env | grep -E "^(VITE_)?SUPABASE_URL=" || true')
echo "$ENV_URL"

echo ""
echo "=== IP w zbudowanych plikach JS (/app/dist) ==="
IPS=$(docker exec "$APP_CONTAINER" sh -lc 'grep -roE "10\.0\.0\.[0-9]+" /app/dist 2>/dev/null | sort -u || true')
if [ -z "$IPS" ]; then
  warn "Brak IP w /app/dist — sprawdź czy build się powiódł: docker compose logs app"
else
  echo "$IPS"
  if echo "$IPS" | grep -qv "$EXPECTED_IP"; then
    err "W /app/dist są inne IP niż $EXPECTED_IP — sprawdź .env i docker-compose.yml"
    exit 1
  fi
  ok "Wszystko wskazuje na $EXPECTED_IP"
fi

echo ""
echo "=== Ostatnie 20 linii logów aplikacji ==="
docker compose logs app --tail=20

echo ""
ok "=== AKTUALIZACJA ZAKOŃCZONA: $(date '+%Y-%m-%d %H:%M:%S') ==="
echo ""
echo "Następny krok: otwórz w trybie incognito http://${EXPECTED_IP}:3001"
echo "(W normalnej karcie wyczyść localStorage — Ctrl+Shift+Delete — żeby"
echo " stary token JWT nie powodował 'Invalid token'.)"
