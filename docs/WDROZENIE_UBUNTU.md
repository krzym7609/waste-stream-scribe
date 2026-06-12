# Wdrożenie aplikacji na lokalnym serwerze Ubuntu

**Cel:** aplikacja (frontend) + Supabase self-hosted działają na jednym serwerze Ubuntu, startują automatycznie po restarcie, dostępne w sieci lokalnej pod IP serwera. Bez WSL, bez Windows, bez Docker Desktop.

**Założenia:**
- Świeży **Ubuntu Server 26.04 LTS** (instrukcja działa też 1:1 na 24.04 / 22.04), zainstalowany na maszynie fizycznej / VM (Proxmox, Hyper-V, bare metal)
- Serwer ma stały IP `10.0.0.108` (przykład — wstaw swój)
- Konto z `sudo`
- Porty: frontend `3001`, Supabase Kong API `8000`, Studio `3000`, Postgres `5432`
- **Wszystko w Dockerze**, autostart przez `systemd` (natywnie, bez NSSM/WSL)

> ⚠️ Czytaj po kolei. Każdą komendę kopiuj 1:1. Nie pomijaj kroków.

---

## KROK 0 — Instalacja Ubuntu Server (jeśli nie masz)

1. Pobierz Ubuntu Server 26.04 LTS: https://ubuntu.com/download/server (jeśli 26.04 nie jest jeszcze GA — weź 24.04 LTS, wszystkie komendy są identyczne).
2. Zainstaluj (w VM lub na blachę). W kreatorze:
   - **OpenSSH server**: zaznacz (będzie potrzebny do zdalnej pracy)
   - **Statyczny IP**: ustaw `10.0.0.108/24`, gateway `10.0.0.1`, DNS `1.1.1.1, 8.8.8.8`
   - Użytkownik: np. `admin`
3. Po instalacji zaloguj się przez SSH z innego komputera:
   ```bash
   ssh admin@10.0.0.108
   ```

Od tego momentu wszystko robisz w tej sesji SSH.

---

## KROK 1 — Aktualizacja systemu i podstawowe narzędzia

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw nano htop
```

---

## KROK 2 — Firewall (UFW)

Otwórz tylko to, co potrzebne:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3001/tcp comment 'Frontend aplikacji'
sudo ufw allow 8000/tcp comment 'Supabase Kong API'
sudo ufw allow 3000/tcp comment 'Supabase Studio'
# Postgres 5432 - tylko jeśli musi być dostępny z sieci:
# sudo ufw allow from 10.0.0.0/24 to any port 5432
sudo ufw --force enable
sudo ufw status
```

---

## KROK 3 — Instalacja Docker CE + Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

**Wyloguj się i zaloguj ponownie** (`exit`, potem `ssh admin@10.0.0.108`), żeby grupa `docker` zaczęła obowiązywać. Test:

```bash
docker run --rm hello-world
```

Musi wypisać `Hello from Docker!`.

---

## KROK 4 — Supabase self-hosted

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/supabase-project
cp -rf supabase/docker/* ~/supabase-project/
cp supabase/docker/.env.example ~/supabase-project/.env
cd ~/supabase-project
```

### 4a. Generuj sekrety

```bash
export POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
export JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | cut -c1-64)
export DASHBOARD_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)

echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
echo "DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD"
```

Zapisz te trzy wartości (np. w notatniku) — wkleisz je do `.env` w kroku 4c. Zmienne są też dostępne w tej sesji terminala dla kroku 4b.

### 4b. Wygeneruj ANON_KEY i SERVICE_ROLE_KEY lokalnie (bez internetu)

Generujemy JWT z **bardzo długim czasem życia (100 lat)** prosto w Linuksie — żeby klucze nie wygasały i aplikacja działała latami bez ingerencji. Sesje użytkowników (access/refresh tokeny) to zupełnie inna sprawa — nimi steruje Supabase Auth na podstawie ustawień w `.env` (patrz niżej).

> ℹ️ ANON_KEY i SERVICE_ROLE_KEY to JWT podpisane Twoim `JWT_SECRET`. Generujemy je raz, lokalnie, w czystym Pythonie (jest w Ubuntu domyślnie). Brak Pythona? `sudo apt install -y python3`.

```bash
# Używa JWT_SECRET wyeksportowanego w kroku 4a. Jeśli otworzyłeś nowy terminal:
# export JWT_SECRET='<wklej_JWT_SECRET>'

# 100 lat ważności (3 155 760 000 sekund)
export EXP=$(( $(date +%s) + 3155760000 ))
export IAT=$(date +%s)


gen_jwt () {
  local role="$1"
  python3 - <<PY
import base64, hmac, hashlib, json, os
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
header  = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode())
payload = b64(json.dumps({"role":"${role}","iss":"supabase","iat":int(os.environ["IAT"]),"exp":int(os.environ["EXP"])},separators=(',',':')).encode())
sig     = b64(hmac.new(os.environ["JWT_SECRET"].encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
print(f"{header}.{payload}.{sig}")
PY
}

echo "ANON_KEY=$(gen_jwt anon)"
echo "SERVICE_ROLE_KEY=$(gen_jwt service_role)"
```

Skopiuj obie linie — wkleisz je do `.env` w kroku 4c.

**Weryfikacja** (powinno wypisać `role`, `exp` daleko w przyszłości):

```bash
echo "<ANON_KEY>" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

### 4c. Edycja `.env`

```bash
nano .env
```

Ustaw / zmień:

```
POSTGRES_PASSWORD=<wklej>
JWT_SECRET=<wklej>
ANON_KEY=<wklej>
SERVICE_ROLE_KEY=<wklej>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<wklej>

SITE_URL=http://10.0.0.108:3001
API_EXTERNAL_URL=http://10.0.0.108:8000
SUPABASE_PUBLIC_URL=http://10.0.0.108:8000

# Wyłącz publiczną rejestrację jeśli aplikacja ma zamknięte konta
DISABLE_SIGNUP=true
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true

# === Długie sesje użytkowników (logowanie trzyma się "wiecznie") ===
# Access token (JWT z sesji) — 1 tydzień (max wspierany)
JWT_EXPIRY=604800
# Refresh token rotuje, ale jeśli aplikacja się odzywa to sesja trwa bez końca.
# Wyłączenie reuse-detection = brak wymuszonego wylogowania przy drobnych problemach sieciowych:
SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10
```

`Ctrl+O`, Enter, `Ctrl+X` żeby zapisać.

### 4d. Start Supabase

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Wszystkie kontenery muszą być `running` / `healthy` (pierwszy start ~5 min). Test:

```bash
curl http://localhost:8000/rest/v1/ -H "apikey: <ANON_KEY>"
```

Studio dostępne pod `http://10.0.0.108:3000` (login: `admin` / hasło z `DASHBOARD_PASSWORD`).

---

## KROK 5 — Migracje bazy danych aplikacji

Aplikacja ma migracje w `supabase/migrations/`. Wgraj je do lokalnej bazy.

### 5a. Zainstaluj Supabase CLI

```bash
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | sudo tar -xz -C /usr/local/bin supabase
supabase --version
```

### 5b. Klonuj repo aplikacji i wgraj migracje

```bash
cd ~
git clone <URL_TWOJEGO_REPO> app
cd app

# Hasło z POSTGRES_PASSWORD z supabase/.env
supabase db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"
```

---

## KROK 6 — Frontend aplikacji w Dockerze

W folderze `~/app`:

### 6a. `.env.production`

```bash
nano .env.production
```

```
VITE_SUPABASE_URL=http://10.0.0.108:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
VITE_SUPABASE_PROJECT_ID=local
```

### 6b. `Dockerfile` (jeśli go nie ma w repo)

```bash
nano Dockerfile
```

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
```

### 6c. `docker-compose.yml`

```bash
nano docker-compose.yml
```

```yaml
services:
  app:
    build: .
    container_name: app-frontend
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - .env.production
```

### 6d. Build + start

```bash
docker compose up -d --build
docker compose logs -f app
```

`Ctrl+C` żeby wyjść z logów. Test:

```bash
curl http://localhost:3001
```

Z innego komputera w sieci: `http://10.0.0.108:3001` w przeglądarce.

---

## KROK 7 — Autostart po restarcie

Docker startuje przez `systemd` (włączone w KROK 3: `systemctl enable docker`). Wszystkie kontenery mają `restart: unless-stopped` — więc wstają same. Nic więcej nie trzeba.

### Weryfikacja restart policy:

```bash
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -aq)
```

Każdy musi mieć `unless-stopped` lub `always`. Jeśli któryś ma `no` — popraw odpowiedni `docker-compose.yml` i `docker compose up -d`.

### Test:

```bash
sudo reboot
```

Poczekaj 1-2 minuty, zaloguj się ponownie przez SSH:

```bash
docker ps
```

Wszystkie kontenery muszą być `Up`. Wejdź z przeglądarki: `http://10.0.0.108:3001`.

---

## KROK 8 — Skrypt aktualizacji aplikacji

Po każdej zmianie w repo (push z Lovable / GitHub) wystarczy odpalić skrypt.

```bash
nano ~/deploy.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

cd ~/app

echo "[1/3] git pull"
git pull --ff-only

echo "[2/3] migracje bazy"
supabase db push --db-url "postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres?sslmode=disable"

echo "[3/3] build + restart kontenera"
docker compose up -d --build

echo "=== Deploy OK: $(date) ==="
```

```bash
chmod +x ~/deploy.sh
```

Ustaw hasło Postgres w env (żeby skrypt go widział):

```bash
echo 'export POSTGRES_PASSWORD="<wklej_POSTGRES_PASSWORD>"' >> ~/.bashrc
source ~/.bashrc
```

Użycie:

```bash
~/deploy.sh
```

### Opcjonalnie — auto-pull co 5 minut z GitHub (cron)

```bash
crontab -e
```

Dopisz:

```
*/5 * * * * /home/admin/deploy.sh >> /home/admin/deploy.log 2>&1
```

---

## KROK 9 — Backup bazy danych

```bash
mkdir -p ~/backups
nano ~/backup.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
docker exec supabase-db pg_dump -U postgres postgres | gzip > ~/backups/db_${TS}.sql.gz
# trzymaj 14 dni
find ~/backups -name 'db_*.sql.gz' -mtime +14 -delete
echo "Backup OK: ~/backups/db_${TS}.sql.gz"
```

```bash
chmod +x ~/backup.sh
crontab -e
```

Dopisz (codziennie o 2:00):

```
0 2 * * * /home/admin/backup.sh >> /home/admin/backup.log 2>&1
```

---

## Diagnostyka

```bash
# Status wszystkich kontenerów
docker ps -a

# Logi konkretnego kontenera
docker logs -f app-frontend
docker logs -f supabase-kong
docker logs -f supabase-db

# Restart pojedynczego serwisu
cd ~/supabase-project && docker compose restart kong
cd ~/app && docker compose restart app

# Pełny restart Supabase
cd ~/supabase-project && docker compose down && docker compose up -d

# Sprawdź czy Docker wstaje sam
systemctl status docker
systemctl is-enabled docker   # musi być 'enabled'

# Sieć / port
sudo ss -tlnp | grep -E '3001|8000|3000|5432'
```

### Typowe problemy

- **Aplikacja nie łączy się z Supabase**: sprawdź `VITE_SUPABASE_URL` w `.env.production` — musi być publiczne IP `10.0.0.108`, nie `localhost` (bo to URL używany w przeglądarce klienta).
- **CORS error**: w `supabase-project/.env` ustaw `SITE_URL` i `ADDITIONAL_REDIRECT_URLS` na adres frontendu.
- **`docker compose pull` 401**: niektóre obrazy Supabase wymagają zalogowania — `docker login`.
- **Po reboocie kontener nie wstaje**: `docker inspect` → sprawdź restart policy i `docker logs <nazwa>`.

---

## Podsumowanie architektury

```
┌─────────────────────────────────────────────────┐
│  Ubuntu Server 26.04  (10.0.0.108)              │
│                                                  │
│  systemd ──► dockerd (enabled, autostart)        │
│              │                                    │
│              ├── app-frontend         :3001      │
│              │                                    │
│              └── supabase-project/                │
│                  ├── kong (API gateway) :8000    │
│                  ├── studio             :3000    │
│                  ├── auth, rest, realtime...     │
│                  └── db (postgres)      :5432    │
│                                                  │
│  cron ──► ~/deploy.sh (co 5 min, opcjonalnie)    │
│  cron ──► ~/backup.sh (codziennie 2:00)          │
└─────────────────────────────────────────────────┘
```

Wszystko natywnie w Linuksie. Bez WSL, bez nested virtualization, bez NSSM, bez autologonu. Reboot serwera = aplikacja wstaje sama w <2 minuty.
