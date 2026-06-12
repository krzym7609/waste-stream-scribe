# Wdrożenie aplikacji na lokalnym serwerze Ubuntu

Aplikacja (frontend) + Supabase self-hosted na jednym serwerze Ubuntu. Autostart po restarcie. Dostęp w sieci lokalnej pod IP serwera.

**Założenia:** Ubuntu Server 24.04/26.04 LTS, stały IP `10.0.0.108` (wstaw swój), konto z `sudo`, porty: frontend `3001`, Supabase API `8000`, Studio `3000`, Postgres `5432`.

Czytaj po kolei. Kopiuj 1:1.

---

## KROK 1 — System + narzędzia

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw nano jq
```

---

## KROK 2 — Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3001/tcp comment 'Frontend'
sudo ufw allow 8000/tcp comment 'Supabase API'
sudo ufw allow 3000/tcp comment 'Supabase Studio'
sudo ufw --force enable
```

---

## KROK 3 — Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

**Wyloguj się i zaloguj ponownie** (`exit` + `ssh ...`). Test:

```bash
docker run --rm hello-world
```

---

## KROK 4 — Supabase self-hosted

### 4a. Pobierz repo

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/supabase-project
cp -rf supabase/docker/* ~/supabase-project/
cp supabase/docker/.env.example ~/supabase-project/.env
cd ~/supabase-project
```

### 4b. Wygeneruj hasła

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
DASHBOARD_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD"
```

Zapisz oba na boku.

### 4c. Wygeneruj klucze auth (oficjalny skrypt)

```bash
bash utils/add-new-auth-keys.sh
```

Skrypt wypisze 4 linie — zapisz całość:

```
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
JWT_KEYS=[...]
JWT_JWKS={"keys":[...]}
```

Te klucze nie wygasają — aplikacja działa latami bez rotacji.

### 4d. Wypełnij `.env`

```bash
nano .env
```

Ustaw / zmień:

```
POSTGRES_PASSWORD=<wklej>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<wklej>

SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
JWT_KEYS=[...]
JWT_JWKS={"keys":[...]}

SITE_URL=http://10.0.0.108:3001
API_EXTERNAL_URL=http://10.0.0.108:8000
SUPABASE_PUBLIC_URL=http://10.0.0.108:8000

DISABLE_SIGNUP=true
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true

JWT_EXPIRY=604800
SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10
```

`Ctrl+O`, Enter, `Ctrl+X`.

### 4e. Start

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Wszystkie kontenery `running`/`healthy` (pierwszy start ~5 min).

Test API:

```bash
curl http://localhost:8000/rest/v1/ -H "apikey: <SUPABASE_PUBLISHABLE_KEY>"
```

Studio: `http://10.0.0.108:3000` (login: `admin` / `DASHBOARD_PASSWORD`).

---

## KROK 5 — Migracje bazy aplikacji

### 5a. Supabase CLI

CLI ma dwa pliki (`supabase` + `supabase-go`) — muszą leżeć w tym samym katalogu w PATH.

```bash
SUPABASE_VERSION=2.106.0
sudo mkdir -p /opt/supabase-cli
curl -sL https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_${SUPABASE_VERSION}_linux_amd64.tar.gz \
  | sudo tar -xzf - -C /opt/supabase-cli
sudo ln -sf /opt/supabase-cli/supabase /usr/local/bin/supabase
sudo ln -sf /opt/supabase-cli/supabase-go /usr/local/bin/supabase-go 2>/dev/null || true
supabase --version
```

Jeśli `supabase --version` zwraca błąd o `supabase-go`, ustaw zmienną:

```bash
echo 'export SUPABASE_GO_BINARY=/opt/supabase-cli/supabase-go' | sudo tee /etc/profile.d/supabase.sh
source /etc/profile.d/supabase.sh
```

### 5b. Repo + migracje

`supabase db push` wymusza TLS, którego self-hosted Postgres na porcie 5432 nie obsługuje. Migracje wgrywamy bezpośrednio przez `psql` z kontenera bazy:

```bash
sudo apt install -y postgresql-client
cd ~
git clone <URL_TWOJEGO_REPO> app
cd app

export PGPASSWORD='<POSTGRES_PASSWORD>'
for f in supabase/migrations/*.sql; do
  echo ">>> $f"
  psql -h 10.0.0.108 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"
done
unset PGPASSWORD
```

Jeśli wolisz przez kontener (bez instalacji `psql` na hoście):

```bash
for f in supabase/migrations/*.sql; do
  echo ">>> $f"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
```

---

## KROK 6 — Frontend w Dockerze

> Folder aplikacji na hoście może mieć dowolną nazwę (np. `~/biokrap`). W całej instrukcji `~/app` to tylko przykład — wszędzie podstaw swoją ścieżkę. `WORKDIR /app` w Dockerfile to ścieżka WEWNĄTRZ kontenera i ZAWSZE zostaje `/app` — nie zmieniaj jej na nazwę folderu hosta.

### 6a. `.env.production`

```bash
cd ~/biokrap   # lub Twój folder aplikacji
nano .env.production
```

```
VITE_SUPABASE_URL=http://10.0.0.108:8000
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_ID=local
```

### 6b. `Dockerfile` (w folderze aplikacji, jeśli brak w repo)


```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install
RUN bun run build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
```


### 6c. `docker-compose.yml`

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
```

Test: `http://10.0.0.108:3001` w przeglądarce.

**Jeśli build wywali `no space left on device`** — masz pełny dysk. Sprzątanie:

```bash
df -h /                         # sprawdź ile zostało
docker system prune -af --volumes   # usuwa nieużywane obrazy/kontenery/cache (UWAGA: kasuje też nieużywane wolumeny)
docker builder prune -af        # czyści cache buildera
sudo journalctl --vacuum-time=3d
sudo apt clean
df -h /
```

Jeśli dalej brakuje miejsca — zwiększ dysk VM/serwera. Build frontu + obrazy Supabase potrzebują min. **20 GB wolnego**.


---

## KROK 7 — Autostart

Docker startuje przez systemd, kontenery mają `restart: unless-stopped` — wstają same. Test:

```bash
sudo reboot
# po 1-2 min:
ssh admin@10.0.0.108
docker ps
```

Wszystko musi być `Up`.

---

## KROK 8 — Skrypt deploy

```bash
nano ~/deploy.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/app
git pull --ff-only
for f in supabase/migrations/*.sql; do
  PGPASSWORD="${POSTGRES_PASSWORD}" psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"
done
docker compose up -d --build
echo "=== Deploy OK: $(date) ==="
```

```bash
chmod +x ~/deploy.sh
echo 'export POSTGRES_PASSWORD="<wklej>"' >> ~/.bashrc
source ~/.bashrc
~/deploy.sh
```

---

## KROK 9 — Backup bazy (codziennie 2:00)

```bash
mkdir -p ~/backups
nano ~/backup.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
docker exec supabase-db pg_dump -U postgres postgres | gzip > ~/backups/db_${TS}.sql.gz
find ~/backups -name 'db_*.sql.gz' -mtime +14 -delete
```

```bash
chmod +x ~/backup.sh
crontab -e
```

Dopisz:

```
0 2 * * * /home/admin/backup.sh >> /home/admin/backup.log 2>&1
```

---

## Diagnostyka

```bash
docker ps -a
docker logs -f app-frontend
docker logs -f supabase-kong
docker logs -f supabase-db

# restart pojedynczego serwisu
cd ~/supabase-project && docker compose restart kong

# pełny restart Supabase
cd ~/supabase-project && docker compose down && docker compose up -d

# porty
sudo ss -tlnp | grep -E '3001|8000|3000|5432'
```
