# Instrukcja wdrożenia aplikacji od zera — Windows Server + WSL2 + Docker CE

**Cel:** aplikacja (frontend + Supabase self-hosted) startuje **automatycznie po restarcie serwera, BEZ logowania użytkownika**. Wszystko żyje w WSL2 (Ubuntu), Docker startuje przez `systemd` w WSL, a Windows trzyma WSL podniesiony jako usługę systemową przez NSSM.

**Założenia:**
- Serwer Windows (Server 2019/2022 lub Win10/11 Pro), IP `10.0.0.108`
- Aplikacja frontend na porcie `3001`
- Supabase self-hosted (Kong API `8000`, Studio `3000`, Postgres `5432`)
- **Brak Docker Desktop. Brak autologonu. Brak PM2.**
- Konto na którym pracujesz musi mieć uprawnienia **Administratora**.

> ⚠️ Czytaj instrukcję po kolei. Nie przeskakuj kroków. Każdą komendę kopiuj 1:1.

---

## KROK 0 — Co przygotować zanim zaczniesz

1. Zaloguj się na serwer Windows jako Administrator (fizycznie lub przez RDP).
2. Sprawdź wersję Windows: `Win + R` → wpisz `winver` → Enter. Musi być **Windows Server 2019 build 18362+** lub nowszy, albo Windows 10/11.
3. Sprawdź, że masz włączoną wirtualizację w BIOS (Intel VT-x / AMD-V). Bez tego WSL2 nie ruszy. Sprawdź w `Task Manager` (`Ctrl+Shift+Esc`) → zakładka **Performance** → **CPU** → po prawej musi być `Virtualization: Enabled`.
4. Sprawdź IP serwera: `Win + R` → `cmd` → Enter → `ipconfig`. Potwierdź, że `10.0.0.108` to faktyczny IP serwera. Jeśli inny — używaj swojego IP w całej instrukcji.
5. Otwórz **PowerShell jako Administrator**:
   - Kliknij Start → wpisz `powershell`
   - Prawy klik na **Windows PowerShell** → **Run as administrator**
   - Pojawi się okno UAC → **Yes**

---

## KROK 1 — Instalacja WSL2 + Ubuntu

W otwartym **PowerShell jako Administrator** wykonaj po kolei (każda komenda osobno, czekaj na zakończenie):

```powershell
wsl --install -d Ubuntu-22.04
```

Po komendzie pobierze się WSL + Ubuntu 22.04. Może trwać 5-15 minut.

```powershell
wsl --set-default-version 2
wsl --update
```

Następnie zrestartuj serwer:

```powershell
shutdown /r /t 0
```

### 1a. Po restarcie — JEDYNY raz w tej instrukcji się logujesz

1. Zaloguj się na serwer jako Administrator (RDP lub konsola).
2. Po zalogowaniu **automatycznie otworzy się okno terminala Ubuntu** (czarne tło, biały tekst, napis "Installing, this may take a few minutes...").
3. Jeśli się NIE otworzyło: Start → wpisz `Ubuntu` → kliknij **Ubuntu 22.04 LTS**.
4. Poczekaj aż pokaże się komunikat:
   ```
   Enter new UNIX username:
   ```
5. Wpisz nazwę użytkownika (np. `admin`) i Enter. To musi być małymi literami, bez spacji.
6. Pojawi się:
   ```
   New password:
   ```
   Wpisz hasło (przy wpisywaniu nic się nie wyświetla — to normalne). Enter.
7. `Retype new password:` — wpisz to samo hasło. Enter.
8. Pojawi się znak zachęty typu `admin@SERVER:~$`. To znaczy, że jesteś w Ubuntu.

**Od tego momentu już nigdy nie musisz się logować do Windows** — wszystko zrobimy tak, żeby działało po restarcie bez logowania.

---

## KROK 2 — Włącz systemd w WSL

W otwartym oknie Ubuntu (`admin@SERVER:~$`) wklej **jedną komendę** (cały blok od `sudo tee` do `EOF`):

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true

[network]
generateResolvConf=true
EOF
```

Wpisze hasło (to samo co w kroku 1a punkt 6). Enter.

Teraz wróć do okna **PowerShell (Administrator)** i wpisz:

```powershell
wsl --shutdown
```

Poczekaj 10 sekund. Otwórz Ubuntu ponownie (Start → Ubuntu 22.04 LTS). Sprawdź czy systemd działa:

```bash
systemctl is-system-running
```

Musi wypisać `running` albo `degraded`. **Jeśli wypisuje `offline` albo błąd — systemd nie wstał, wróć do początku kroku 2.**

---

## KROK 3 — Instalacja Docker CE w Ubuntu

W oknie Ubuntu wklej **każdy blok osobno** (czekaj aż się zakończy).

Blok 1 — aktualizacja systemu:

```bash
sudo apt update && sudo apt upgrade -y
```

Blok 2 — narzędzia pomocnicze:

```bash
sudo apt install -y ca-certificates curl gnupg lsb-release
```

Blok 3 — klucz GPG Dockera:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Blok 4 — dodanie repo Dockera:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list
```

Blok 5 — instalacja Dockera:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Blok 6 — włącz Docker do autostartu i dodaj się do grupy:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Teraz **zamknij okno Ubuntu** (kliknij X) i w **PowerShell (Administrator)**:

```powershell
wsl --shutdown
```

Otwórz Ubuntu ponownie. Test:

```bash
docker run --rm hello-world
```

Musi wypisać `Hello from Docker!`. **Jeśli error "permission denied" — restart WSL nie zadziałał, zamknij wszystkie okna i powtórz `wsl --shutdown`.**

---

## KROK 4 — Supabase self-hosted

W Ubuntu:

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/supabase-project
cp -rf supabase/docker/* ~/supabase-project/
cp supabase/docker/.env.example ~/supabase-project/.env
cd ~/supabase-project
```

### 4a. Edycja `.env`

Otwórz plik:

```bash
nano .env
```

Nawigacja w nano: strzałki = poruszanie, `Ctrl+W` = wyszukaj, `Ctrl+O` + Enter = zapisz, `Ctrl+X` = wyjdź.

**Zmień każde wystąpienie `localhost` i `127.0.0.1` na `10.0.0.108`.** W szczególności znajdź i ustaw (użyj `Ctrl+W`):

```
SITE_URL=http://10.0.0.108:3000
API_EXTERNAL_URL=http://10.0.0.108:8000
SUPABASE_PUBLIC_URL=http://10.0.0.108:8000
```

### 4b. Wygeneruj nowe sekrety

W nowej karcie Ubuntu (lub po `Ctrl+X`):

```bash
openssl rand -base64 32
```

Skopiuj wynik i wklej w `.env` jako `POSTGRES_PASSWORD`. Powtórz dla `JWT_SECRET` (musi być min. 32 znaki) i `DASHBOARD_PASSWORD`.

Dla `ANON_KEY` i `SERVICE_ROLE_KEY` wejdź na https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys, wklej tam swój `JWT_SECRET` i skopiuj wygenerowane klucze do `.env`.

Zapisz plik (`Ctrl+O`, Enter, `Ctrl+X`).

### 4c. Start Supabase

```bash
cd ~/supabase-project
docker compose pull
docker compose up -d
docker compose ps
```

Wszystkie kontenery muszą mieć status `running` lub `healthy`. Pobieranie obrazów trwa 5-10 minut przy pierwszym uruchomieniu.

---

## KROK 5 — Frontend aplikacji

W Ubuntu:

```bash
cd ~
git clone <URL_TWOJEGO_REPO> app
cd app
```

(Zamień `<URL_TWOJEGO_REPO>` na faktyczny URL z GitHub/GitLab.)

### 5a. Konfiguracja `.env`

```bash
nano .env
```

Wpisz (jeśli pliku nie ma — utworzy się nowy):

```
VITE_SUPABASE_URL=http://10.0.0.108:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<wklej_tu_ANON_KEY_z_supabase>
```

Zapisz (`Ctrl+O`, Enter, `Ctrl+X`).

### 5b. Dockerfile (jeśli go nie ma w repo)

```bash
nano Dockerfile
```

Wklej:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
```

Zapisz i wyjdź.

### 5c. docker-compose.yml

```bash
nano docker-compose.yml
```

Wklej:

```yaml
services:
  app:
    build: .
    container_name: app-frontend
    restart: unless-stopped
    ports:
      - "3001:3001"
```

Zapisz i wyjdź.

### 5d. Build + start

```bash
docker compose up -d --build
```

Build trwa 3-7 minut. Test:

```bash
curl http://localhost:3001
```

Musi zwrócić HTML strony. Jeśli `connection refused` — sprawdź `docker compose logs app`.

---

## KROK 6 — Sprawdź restart policy wszystkich kontenerów

Bez tego po restarcie kontenery nie wstaną same.

```bash
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -aq)
```

Każda linia musi się kończyć na `unless-stopped` lub `always`. **Jeśli któryś ma `no`** — edytuj odpowiedni `docker-compose.yml`, dodaj `restart: unless-stopped` do tej usługi i:

```bash
docker compose up -d
```

---

## KROK 7 — Port forwarding Windows → WSL

WSL ma własny wewnętrzny IP. Trzeba przerzucić porty z `10.0.0.108` (Windows) na ten IP.

### 7a. Utwórz folder na skrypty

W **PowerShell (Administrator)**:

```powershell
New-Item -ItemType Directory -Force -Path C:\Scripts
```

### 7b. Utwórz skrypt port-forwardingu

```powershell
notepad C:\Scripts\wsl-ports.ps1
```

Notepad otworzy okienko **"Czy chcesz utworzyć nowy plik?"** → **Tak**.

Wklej do notatnika:

```powershell
$ports = @(3001, 8000, 3000, 5432)
$wslIp = (wsl -d Ubuntu-22.04 hostname -I).Trim().Split(' ')[0]

foreach ($p in $ports) {
  netsh interface portproxy delete v4tov4 listenport=$p listenaddress=0.0.0.0 | Out-Null
  netsh interface portproxy add v4tov4 listenport=$p listenaddress=0.0.0.0 connectport=$p connectaddress=$wslIp
  New-NetFirewallRule -DisplayName "WSL Port $p" -Direction Inbound -LocalPort $p -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
}
netsh interface portproxy show v4tov4
```

Zapisz (`Ctrl+S`) i zamknij notatnik.

### 7c. Uruchom skrypt raz ręcznie

W PowerShell (Administrator):

```powershell
powershell -ExecutionPolicy Bypass -File C:\Scripts\wsl-ports.ps1
```

Powinieneś zobaczyć tabelę z portami `3001, 8000, 3000, 5432` mapowanymi na IP WSL (np. `172.x.x.x`).

### 7d. Test z innego komputera w sieci

Na innym komputerze, PowerShell:

```powershell
Test-NetConnection 10.0.0.108 -Port 3001
```

`TcpTestSucceeded : True` = działa. W przeglądarce: `http://10.0.0.108:3001` → musi pokazać aplikację.

---

## KROK 8 — NSSM: WSL jako usługa Windows (autostart bez logowania)

To jest **najważniejszy krok** — bez tego po restarcie WSL nie wstaje, dopóki ktoś się nie zaloguje.

### 8a. Pobierz NSSM

1. W przeglądarce na serwerze otwórz https://nssm.cc/download
2. Pobierz **nssm 2.24** (link "nssm 2.24.zip").
3. Rozpakuj ZIP. W środku jest folder `nssm-2.24\win64\` z plikiem `nssm.exe`.
4. Skopiuj `nssm.exe` do `C:\Scripts\` (folder utworzony w 7a).

### 8b. Utwórz usługę WSL-Keepalive

W **PowerShell (Administrator)** wykonaj po kolei:

```powershell
C:\Scripts\nssm.exe install WSL-Keepalive "C:\Windows\System32\wsl.exe" "-d Ubuntu-22.04 -u root -- tail -f /dev/null"
C:\Scripts\nssm.exe set WSL-Keepalive Start SERVICE_AUTO_START
C:\Scripts\nssm.exe set WSL-Keepalive ObjectName LocalSystem
C:\Scripts\nssm.exe set WSL-Keepalive AppExit Default Restart
```

### 8c. Utwórz usługę WSL-PortProxy

```powershell
C:\Scripts\nssm.exe install WSL-PortProxy "powershell.exe" "-ExecutionPolicy Bypass -File C:\Scripts\wsl-ports.ps1"
C:\Scripts\nssm.exe set WSL-PortProxy Start SERVICE_AUTO_START
C:\Scripts\nssm.exe set WSL-PortProxy ObjectName LocalSystem
C:\Scripts\nssm.exe set WSL-PortProxy DependOnService WSL-Keepalive
C:\Scripts\nssm.exe set WSL-PortProxy AppExit Default Exit
```

### 8d. Start obu usług

```powershell
Start-Service WSL-Keepalive
Start-Sleep -Seconds 10
Start-Service WSL-PortProxy
```

### 8e. Sprawdź status

```powershell
Get-Service WSL-Keepalive, WSL-PortProxy
```

Obie muszą mieć `Status: Running`.

**Co robi `WSL-Keepalive`:** uruchamia `tail -f /dev/null` w Ubuntu, co trzyma dystrybucję włączoną non-stop (inaczej WSL gasi się po ~8s bezczynności). Skoro WSL działa, systemd uruchamia Dockera, a Docker uruchamia kontenery z `restart: unless-stopped`.

**Co robi `WSL-PortProxy`:** po starcie WSL (zależność `DependOnService`) odpala skrypt forwardingu portów, bo IP WSL zmienia się przy każdym starcie.

---

## KROK 9 — Test finalny (moment prawdy)

### 9a. Restart serwera

W PowerShell (Administrator):

```powershell
shutdown /r /t 0
```

### 9b. NIE LOGUJ SIĘ

Po restarcie zobaczysz ekran logowania Windows. **Nie wpisuj hasła. Nie loguj się. Poczekaj 2-3 minuty.**

### 9c. Test z innego komputera w sieci

```powershell
Test-NetConnection 10.0.0.108 -Port 3001
Test-NetConnection 10.0.0.108 -Port 8000
```

Oba muszą zwrócić `TcpTestSucceeded : True`.

W przeglądarce: `http://10.0.0.108:3001` → aplikacja działa.

**Jeśli oba TRUE — gotowe. Serwer można teraz restartować, ktoś może wyciągnąć kabel zasilania, awaria sieci — wszystko wstanie samo bez logowania.**

---

## Diagnostyka — co sprawdzić jeśli coś nie wstaje

Zaloguj się i w PowerShell (Administrator):

```powershell
Get-Service WSL-Keepalive, WSL-PortProxy
```

- Obie `Running` → idź dalej.
- Któraś `Stopped` → `Start-Service <nazwa>`. Jeśli nie startuje: `C:\Scripts\nssm.exe edit <nazwa>` i sprawdź ścieżki.

```powershell
wsl -d Ubuntu-22.04 -u root -- systemctl status docker
```

- `active (running)` → OK.
- `inactive` → `wsl -d Ubuntu-22.04 -u root -- systemctl start docker`.

```powershell
wsl -d Ubuntu-22.04 -u root -- docker ps
```

- Lista kontenerów → OK.
- Pusto → któryś kontener nie ma restart policy. Wróć do kroku 6.

```powershell
netsh interface portproxy show v4tov4
```

- Pusto → uruchom ręcznie `Restart-Service WSL-PortProxy`.
- IP WSL inny niż w portproxy → restart WSL-PortProxy aktualizuje mapowanie.

---

## KROK 10 — Aktualizacja aplikacji z gita (po zmianach w Lovable)

Procedura odświeżania aplikacji bez psucia lokalnej konfiguracji (`.env`, `docker-compose.yml`).

### 10a. Jednorazowo: zabezpiecz pliki konfiguracyjne przed `git pull`

W Ubuntu, w folderze projektu (np. `~/biokrap`):

```bash
cd ~/biokrap

# .env trzymamy lokalnie — git nie ma prawa go nadpisać
git update-index --skip-worktree .env 2>/dev/null || true

# To samo dla docker-compose.yml jeśli był modyfikowany lokalnie (np. zmiana IP)
git update-index --skip-worktree docker-compose.yml 2>/dev/null || true

# Weryfikacja — "zamrożone" pliki mają literę S
git ls-files -v | grep '^S'
```

Od tej pory `git pull` nigdy nie ruszy tych plików. Żeby cofnąć: `git update-index --no-skip-worktree <plik>`.

### 10b. Backup bazy przed aktualizacją (zalecane przy migracjach)

```bash
cd ~/supabase-project
docker exec supabase-db pg_dump -U postgres postgres > ~/backup-$(date +%Y%m%d-%H%M).sql
ls -lh ~/backup-*.sql
```

### 10c. Pobranie zmian z gita

```bash
cd ~/biokrap
git fetch origin
git pull --ff-only
```

Jeśli `git pull` zgłasza konflikt na `.env` lub `docker-compose.yml` — krok 10a nie został wykonany. Wróć i go zrób.

### 10d. Migracje bazy (jeśli w `supabase/migrations/` przybyły nowe pliki SQL)

Sprawdź czy są nowe migracje:

```bash
git log --name-only --since="ostatnia aktualizacja" -- supabase/migrations/
```

Jeśli są nowe pliki — wykonaj je po kolei na lokalnej bazie:

```bash
for f in supabase/migrations/*.sql; do
  echo "=== $f ==="
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done
```

Migracje są idempotentne (`IF NOT EXISTS`, `CREATE OR REPLACE`) — bezpiecznie można puścić wszystkie ponownie. Jeśli któraś rzuci błąd o duplikacie — można pominąć.

### 10e. Rebuild aplikacji

```bash
cd ~/biokrap
docker compose down
docker compose build --no-cache
docker compose up -d
```

`--no-cache` jest ważne, bo `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY` są wbijane do plików JS w `/app/dist` w trakcie buildu. Bez `--no-cache` Docker może użyć starej warstwy z poprzednimi wartościami.

### 10f. Weryfikacja

```bash
docker compose ps
docker compose logs app --tail=50
docker exec biokrap-app sh -lc 'env | grep -E "SUPABASE_URL"'
docker exec biokrap-app sh -lc 'grep -roE "10\.0\.0\.[0-9]+" /app/dist | sort -u'
```

Wszystko musi pokazać `10.0.0.108` (lub aktualny IP serwera) — nigdy starego.

### 10g. Test w przeglądarce

Otwórz **tryb incognito** (Ctrl+Shift+N w Chrome / Ctrl+Shift+P w Firefox) → `http://10.0.0.108:3001`.

Tryb incognito jest kluczowy — w normalnej przeglądarce zalega stary token JWT w `localStorage`. Po podmianie kluczy Supabase stary token rzuca "Invalid token" przy każdej akcji. W incognito storage jest pusty, login generuje świeży token podpisany aktualnym `JWT_SECRET`.

Jeśli wszystko działa w incognito — w normalnej przeglądarce wystarczy:
- F12 → Application → Local Storage → prawym → Clear
- albo Ctrl+Shift+Delete → wyczyść dane strony

### 10h. Co zrobić, gdy coś się posypie

| Objaw | Przyczyna | Rozwiązanie |
|-------|-----------|-------------|
| `git pull` nadpisał `.env` | nie wykonano kroku 10a | przywróć z backupu (`~/backup-*.sql` nie pomoże — `.env` trzeba odtworzyć ręcznie z kroku 5a) |
| "Invalid token" po loginie | stary JWT w cache przeglądarki | tryb incognito albo wyczyść localStorage |
| `/app/dist` ma stary IP po rebuild | Docker użył cache | `docker compose build --no-cache` jeszcze raz, ewentualnie `docker builder prune -af` |
| Migracja rzuca błąd | konflikt z istniejącym schematem | zrób backup (10b), sprawdź `psql` ręcznie co przeszkadza, ewentualnie pomiń konkretny plik SQL |
| Apka nie wstaje po `up -d` | błąd kompilacji TS lub brak zależności | `docker compose logs app` — pokaże dokładny błąd |

### 10i. Skrót: gotowy skrypt `scripts/update.sh`

W repo jest gotowy skrypt, który robi wszystko z kroków 10a–10g automatycznie (zamrożenie configów, backup bazy do `~/backups/`, `git pull`, migracje SQL, rebuild `--no-cache`, weryfikacja IP w `/app/dist`).

```bash
cd ~/biokrap
chmod +x scripts/update.sh   # jednorazowo
./scripts/update.sh
```

Jeśli serwer ma inny IP niż `10.0.0.108`, uruchom tak:

```bash
EXPECTED_IP=10.0.0.142 ./scripts/update.sh
```

Po zakończeniu otwórz aplikację w **trybie incognito** żeby pominąć stary token JWT w cache.

