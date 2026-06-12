# Wdrożenie aplikacji BiokrApp na Ubuntu Server — instrukcja od zera

Aplikacja (frontend) + Supabase self-hosted, wszystko w Dockerze, na jednym serwerze Ubuntu. Autostart po restarcie. Dostęp w sieci lokalnej pod IP serwera.

## Co dostaniesz na końcu

- Frontend pod `http://<IP_SERWERA>:3001`
- Supabase Studio (panel bazy) pod `http://<IP_SERWERA>:3000`
- Supabase API (Kong) pod `http://<IP_SERWERA>:8000`
- Backup bazy codziennie o 2:00
- Wszystko wstaje samo po restarcie serwera

## Założenia (sprawdź zanim zaczniesz)

- **System:** Ubuntu Server 22.04 / 24.04 LTS (świeża instalacja)
- **Dysk:** minimum **40 GB** wolnego miejsca (Supabase + obrazy + build to ~15 GB, reszta to zapas). `df -h /` musi pokazać min. 30 GB w kolumnie `Avail`.
- **RAM:** min. 4 GB (zalecane 8 GB)
- **IP:** stały adres w sieci lokalnej — w tej instrukcji używam `10.0.0.140`. **Wszędzie podstaw swój IP.**
- **Konto:** użytkownik z prawami `sudo` (np. `s4tech`). Logujesz się przez SSH lub konsolę.
- **Repo aplikacji:** masz URL gita (HTTPS lub SSH) do BiokrApp.

**Konwencje w tej instrukcji:**
- `<IP>` = IP Twojego serwera (np. `10.0.0.140`)
- `<USER>` = nazwa Twojego użytkownika w Ubuntu (np. `s4tech`)
- `~` = katalog domowy użytkownika (np. `/home/s4tech`)
- Folder aplikacji u Ciebie: `~/biokrap` (w przykładach poniżej zostawiam `~/biokrap`)
- Folder Supabase: `~/supabase-project`
- Kopiuj komendy **1:1**. Każdy blok wklejasz w terminalu i naciskasz Enter.

---

# KROK 1 — Przygotowanie systemu

Zaloguj się przez SSH:

```bash
ssh <USER>@<IP>
```

Aktualizacja systemu i narzędzia, których będziemy używać:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw nano jq openssl
```

Sprawdź wolne miejsce — musi być min. **30 GB** w `Avail`:

```bash
df -h /
```

Jeśli mniej — **zwiększ dysk VM przed dalszą instalacją**, inaczej build się wywali.

---

# KROK 2 — Firewall (UFW)

Otwieramy tylko porty, których potrzebujemy:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3001/tcp comment 'Frontend BiokrApp'
sudo ufw allow 8000/tcp comment 'Supabase API'
sudo ufw allow 3000/tcp comment 'Supabase Studio'
sudo ufw --force enable
sudo ufw status
```

`status` powinien pokazać 4 reguły `ALLOW`.

> Port `5432` (Postgres) celowo **nie jest** otwierany na świat. Aplikacja łączy się z bazą przez Supabase API (port 8000). Postgres dostępny jest tylko z lokalnego hosta.

---

# KROK 3 — Instalacja Dockera

Oficjalne repo Dockera (nie używamy paczki z apta — jest stara):

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

**Wyloguj się i zaloguj ponownie** żeby przejął uprawnienia grupy `docker`:

```bash
exit
```

Potem znowu `ssh <USER>@<IP>`. Test:

```bash
docker run --rm hello-world
```

Musisz zobaczyć "Hello from Docker!". Jeśli błąd `permission denied` — nie wylogowałeś się prawidłowo, powtórz.

---

# KROK 4 — Supabase self-hosted

## 4a. Pobranie plików

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/supabase-project
cp -rf supabase/docker/* ~/supabase-project/
cp supabase/docker/.env.example ~/supabase-project/.env
cd ~/supabase-project
```

## 4b. Wygenerowanie haseł

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
DASHBOARD_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
echo "=========================================="
echo "POSTGRES_PASSWORD = $POSTGRES_PASSWORD"
echo "DASHBOARD_PASSWORD = $DASHBOARD_PASSWORD"
echo "=========================================="
```

**Skopiuj oba hasła w bezpieczne miejsce** (menedżer haseł). Będą Ci potrzebne kilka razy.

## 4c. Wygenerowanie kluczy API (publishable + secret + JWT)

Supabase ma do tego gotowy skrypt:

```bash
cd ~/supabase-project
bash utils/add-new-auth-keys.sh
```

Skrypt wypisze 4 linie zaczynające się od:
```
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
JWT_KEYS=[...]
JWT_JWKS={"keys":[...]}
```

**Skopiuj całość** (zaznacz myszką w terminalu, prawym klikiem). Też zapisz w bezpiecznym miejscu — te klucze nie wygasają.

## 4d. Edycja pliku `.env` Supabase

```bash
nano ~/supabase-project/.env
```

**Skróty nano:** `Ctrl+W` = szukaj, strzałki = ruch, `Ctrl+O` Enter = zapisz, `Ctrl+X` = wyjdź.

Znajdź i ustaw każdą z tych linii (`Ctrl+W` → wpisz nazwę → Enter). Jeśli linia istnieje — zmień wartość. Jeśli nie ma — dopisz na końcu pliku:

```
POSTGRES_PASSWORD=<wklej_POSTGRES_PASSWORD_z_4b>

DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<wklej_DASHBOARD_PASSWORD_z_4b>

SUPABASE_PUBLISHABLE_KEY=<wklej_z_4c>
SUPABASE_SECRET_KEY=<wklej_z_4c>
JWT_KEYS=<wklej_z_4c>
JWT_JWKS=<wklej_z_4c>

SITE_URL=http://<IP>:3001
API_EXTERNAL_URL=http://<IP>:8000
SUPABASE_PUBLIC_URL=http://<IP>:8000

DISABLE_SIGNUP=true
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true

JWT_EXPIRY=604800
```

Zapisz: `Ctrl+O`, Enter, `Ctrl+X`.

## 4e. Pierwszy start Supabase

```bash
cd ~/supabase-project
docker compose pull
docker compose up -d
```

Pobieranie ~5 minut przy pierwszym razie. Sprawdź status:

```bash
docker compose ps
```

Wszystkie kontenery muszą być `running` lub `healthy`. Jeśli któryś jest `restarting` lub `unhealthy` — daj 2 minuty, sprawdź jeszcze raz. Jeśli dalej źle:

```bash
docker compose logs <nazwa_kontenera> | tail -50
```

## 4f. Test

- **Studio (panel bazy) w przeglądarce:** `http://<IP>:3000` — login `admin`, hasło `DASHBOARD_PASSWORD`. Musisz zobaczyć interfejs Supabase Studio.
- **API z terminala:**
  ```bash
  curl http://localhost:8000/rest/v1/ -H "apikey: <wklej_SUPABASE_PUBLISHABLE_KEY>"
  ```
  Zwróci JSON (pusty albo z listą tabel). Jeśli `connection refused` — Supabase nie wstał.

---

# KROK 5 — Migracje bazy aplikacji

Aplikacja ma swoje tabele w katalogu `supabase/migrations/`. Trzeba je załadować do bazy.

## 5a. Pobranie repo aplikacji

```bash
cd ~
git clone <URL_TWOJEGO_REPO> biokrap
cd biokrap
```

Jeśli repo jest prywatne i pyta o login — użyj **Personal Access Token** zamiast hasła (GitHub → Settings → Developer settings → Tokens).

## 5b. Wgranie migracji do bazy

**Nie używamy `supabase db push`** — wymusza TLS, którego self-hosted nie ma na porcie 5432. Wgrywamy bezpośrednio przez kontener bazy (najprościej, nic nie instalujemy na hoście):

```bash
cd ~/biokrap
for f in supabase/migrations/*.sql; do
  echo ">>> $f"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
```

Każda migracja musi zakończyć się bez błędu. Jeśli któraś się wywali — przeczytaj komunikat, popraw i uruchom **tylko ten jeden plik** ponownie:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<nazwa_pliku>.sql
```

## 5c. Weryfikacja

W Supabase Studio (`http://<IP>:3000`) → zakładka **Table Editor** → po lewej powinieneś zobaczyć tabele aplikacji (np. `employees`, `shifts`, `equipment` itp.).

---

# KROK 6 — Frontend (build w Dockerze)

## 6a. Plik `.env.production` dla frontendu

```bash
cd ~/biokrap
nano .env.production
```

Wklej (podstaw swoje wartości):

```
VITE_SUPABASE_URL=http://<IP>:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<wklej_SUPABASE_PUBLISHABLE_KEY_z_4c>
VITE_SUPABASE_PROJECT_ID=local
```

Zapisz (`Ctrl+O`, Enter, `Ctrl+X`).

## 6b. `Dockerfile`

Jeśli plik nie istnieje w repo:

```bash
nano ~/biokrap/Dockerfile
```

Wklej **dokładnie** (uwaga: `WORKDIR /app` to ścieżka **wewnątrz kontenera** — zawsze `/app`, nie nazwa Twojego folderu na hoście):

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

Zapisz, wyjdź.

## 6c. `docker-compose.yml`

```bash
nano ~/biokrap/docker-compose.yml
```

```yaml
services:
  app:
    build: .
    container_name: biokrap-app
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - .env.production
```

Zapisz, wyjdź.

## 6d. `.dockerignore` (przyspiesza build)

```bash
nano ~/biokrap/.dockerignore
```

```
node_modules
dist
.git
.env
.env.local
*.log
```

Zapisz, wyjdź.

## 6e. Build i start

```bash
cd ~/biokrap
docker compose up -d --build
```

Pierwszy build trwa 3-7 minut.

**Jeśli "no space left on device"** — masz pełny dysk. Sprzątanie:

```bash
docker system prune -af --volumes
docker builder prune -af
sudo journalctl --vacuum-time=3d
sudo apt clean
df -h /
```

Jeśli nadal mało — zwiększ dysk VM i spróbuj ponownie. **Pamiętaj o min. 30 GB wolnego.**

## 6f. Test

```bash
curl -I http://localhost:3001
```

Powinno zwrócić `HTTP/1.1 200 OK`. W przeglądarce z innego komputera w sieci: `http://<IP>:3001` — aplikacja musi się załadować.

---

# KROK 7 — Autostart (test restartu)

Docker startuje przez `systemd` (włączone w kroku 3), wszystkie kontenery mają `restart: unless-stopped` — wstaną same po reboocie.

Test:

```bash
sudo reboot
```

Czekaj 1-2 minuty, zaloguj się znowu przez SSH:

```bash
ssh <USER>@<IP>
docker ps
```

Powinieneś zobaczyć **wszystkie** kontenery z `STATUS: Up ...`. Otwórz `http://<IP>:3001` w przeglądarce — działa.

---

# KROK 8 — Skrypt deploy (aktualizacja aplikacji)

Wygodny skrypt do aktualizacji po `git push` z developmentu:

```bash
nano ~/deploy.sh
```

Wklej (podstaw swoje hasło Postgresa):

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/biokrap"
cd "$APP_DIR"

echo "=== git pull ==="
git pull --ff-only

echo "=== migracje ==="
for f in supabase/migrations/*.sql; do
  echo ">>> $f"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" || true
done

echo "=== rebuild frontend ==="
docker compose up -d --build

echo "=== Deploy OK: $(date) ==="
```

> `|| true` przy migracjach pozwala pominąć już wykonane (np. `CREATE TABLE` rzuca błąd, jeśli tabela istnieje). Jeśli używasz `CREATE TABLE IF NOT EXISTS` w migracjach — usuń to `|| true`.

```bash
chmod +x ~/deploy.sh
~/deploy.sh
```

---

# KROK 9 — Backup bazy (codziennie o 2:00)

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
echo "backup OK: $TS"
```

```bash
chmod +x ~/backup.sh
crontab -e
```

Dopisz **jedną linię** na końcu (podstaw swojego użytkownika):

```
0 2 * * * /home/<USER>/backup.sh >> /home/<USER>/backup.log 2>&1
```

Zapisz, wyjdź. Test ręczny:

```bash
~/backup.sh
ls -lh ~/backups/
```

**Przywracanie z backupu** (gdyby coś padło):

```bash
gunzip -c ~/backups/db_<TIMESTAMP>.sql.gz | docker exec -i supabase-db psql -U postgres -d postgres
```

---

# Diagnostyka — co sprawdzić, gdy coś nie działa

**Sprawdź czy kontenery żyją:**
```bash
docker ps -a
```
Każdy musi mieć `Up`. Jeśli `Exited` lub `Restarting` — patrz logi.

**Logi:**
```bash
docker logs -f biokrap-app          # frontend
docker logs -f supabase-kong        # API gateway
docker logs -f supabase-db          # baza
docker logs -f supabase-auth        # logowanie
```
`Ctrl+C` wychodzi z trybu śledzenia.

**Restart pojedynczego serwisu Supabase:**
```bash
cd ~/supabase-project && docker compose restart kong
```

**Pełny restart Supabase:**
```bash
cd ~/supabase-project && docker compose down && docker compose up -d
```

**Co słucha na portach:**
```bash
sudo ss -tlnp | grep -E '3001|8000|3000|5432'
```

**Wolne miejsce:**
```bash
df -h /
docker system df
```

**Frontend nie ładuje się z innego komputera, choć `curl localhost:3001` na serwerze działa:**
- sprawdź firewall: `sudo ufw status`
- sprawdź czy IP serwera to faktycznie to, na które wchodzisz: `ip a`

**Logowanie do aplikacji nie działa / błąd CORS:**
- w `~/supabase-project/.env` sprawdź czy `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` mają **prawidłowy IP** (nie `localhost`)
- po zmianie: `cd ~/supabase-project && docker compose down && docker compose up -d`

---

# Ściąga — gdzie co leży

| Co | Gdzie |
|---|---|
| Pliki Supabase (compose, .env) | `~/supabase-project/` |
| Aplikacja (kod + Dockerfile) | `~/biokrap/` |
| Backupy bazy | `~/backups/` |
| Skrypt deploy | `~/deploy.sh` |
| Skrypt backup | `~/backup.sh` |
| Logi backupu | `~/backup.log` |
| Hasła (Postgres, Dashboard, klucze API) | **menedżer haseł** — nie na serwerze |
