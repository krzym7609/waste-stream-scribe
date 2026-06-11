# Instrukcja wdrożenia aplikacji od zera — Windows Server + WSL2 + Docker CE

Cel: aplikacja (frontend + Supabase self-hosted) startuje **automatycznie po restarcie serwera, bez logowania użytkownika**. Wszystko żyje w WSL2, zarządzane przez `systemd`, a Windows tylko podnosi WSL jako usługę systemową przez NSSM.
Założenia:

- Serwer Windows, IP `10.0.0.108`
- Aplikacja frontend na porcie `3001`
- Supabase self-hosted (Kong `8000`, Studio `3000`, DB `5432`)
- Brak Docker Desktop. Brak autologonu. Brak PM2 w sesji usera.

---

## KROK 1 — Instalacja WSL2 + Ubuntu

PowerShell jako Administrator:

```powershell
wsl --install -d Ubuntu-22.04
wsl --set-default-version 2
wsl --update
shutdown /r /t 0
```

## Po restarcie zaloguj się **ostatni raz**, otwórz Ubuntu, ustaw użytkownika (np. `admin`) i hasło.

## KROK 2 — Włącz systemd w WSL

W Ubuntu:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
[network]
generateResolvConf=true
EOF
```

W PowerShell (admin):

```powershell
wsl --shutdown
```

Otwórz Ubuntu ponownie, sprawdź:

```bash
systemctl is-system-running
```

## Powinno być `running` lub `degraded` (OK).

## KROK 3 — Instalacja Docker CE w Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Zamknij i otwórz Ubuntu ponownie. Test:

```bash
docker run --rm hello-world
```

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

Edytuj `.env` — **WSZĘDZIE** zmień `localhost` / `127.0.0.1` na `10.0.0.108`. W szczególności:

```
SITE_URL=http://10.0.0.108:3000
API_EXTERNAL_URL=http://10.0.0.108:8000
SUPABASE_PUBLIC_URL=http://10.0.0.108:8000
```

Wygeneruj nowe sekrety (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`) — generator: https://supabase.com/docs/guides/self-hosting/docker
Start:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

---

## KROK 5 — Frontend aplikacji

```bash
cd ~
git clone <URL_TWOJEGO_REPO> app
cd app
```

W `.env` (lub `.env.production`) ustaw:

```
VITE_SUPABASE_URL=http://10.0.0.108:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY z supabase .env>
```

Dodaj `Dockerfile` (jeśli nie ma):

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

`docker-compose.yml` obok:

```yaml
services:
  app:
    build: .
    container_name: app-frontend
    restart: unless-stopped
    ports:
      - "3001:3001"
```

Start:

```bash
docker compose up -d --build
```

## Test z Ubuntu: `curl http://localhost:3001`

## KROK 6 — Restart policy (kluczowe dla autostartu)

Upewnij się, że **wszystkie** kontenery mają `restart: unless-stopped` lub `always`. Sprawdź:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -aq)
```

## Jeśli któryś ma `no` → popraw w compose i `docker compose up -d`.

## KROK 7 — Port forwarding Windows → WSL

WSL ma własne IP, trzeba przerzucić porty z `10.0.0.108` na WSL. PowerShell jako admin, plik `C:\Scripts\wsl-ports.ps1`:

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

Uruchom raz ręcznie i sprawdź z innego komputera:

```powershell
Test-NetConnection 10.0.0.108 -Port 3001
```

---

## KROK 8 — NSSM: WSL jako usługa Windows (autostart bez logowania)

Pobierz NSSM: https://nssm.cc/download → rozpakuj `nssm.exe` do `C:\Scripts\`.
PowerShell jako admin:

```powershell
# Usługa 1: trzyma WSL podniesiony non-stop
C:\Scripts\nssm.exe install WSL-Keepalive "C:\Windows\System32\wsl.exe" "-d Ubuntu-22.04 -u root -- tail -f /dev/null"
C:\Scripts\nssm.exe set WSL-Keepalive Start SERVICE_AUTO_START
C:\Scripts\nssm.exe set WSL-Keepalive ObjectName LocalSystem
C:\Scripts\nssm.exe set WSL-Keepalive AppExit Default Restart
# Usługa 2: port forwarding po starcie WSL
C:\Scripts\nssm.exe install WSL-PortProxy "powershell.exe" "-ExecutionPolicy Bypass -File C:\Scripts\wsl-ports.ps1"
C:\Scripts\nssm.exe set WSL-PortProxy Start SERVICE_AUTO_START
C:\Scripts\nssm.exe set WSL-PortProxy ObjectName LocalSystem
C:\Scripts\nssm.exe set WSL-PortProxy DependOnService WSL-Keepalive
C:\Scripts\nssm.exe set WSL-PortProxy AppExit Default Exit
Start-Service WSL-Keepalive
Start-Sleep -Seconds 10
Start-Service WSL-PortProxy
```

## `WSL-Keepalive` trzyma dystrybucję uruchomioną cały czas (bez tego WSL gasi się po ~8s bezczynności). Docker w środku startuje przez systemd → kontenery z `restart: unless-stopped` wstają same.

## KROK 9 — Test finalny (moment prawdy)

```powershell
shutdown /r /t 0
```

**NIE LOGUJ SIĘ.** Poczekaj 2-3 minuty. Z innego komputera w sieci:

```powershell
Test-NetConnection 10.0.0.108 -Port 3001
Test-NetConnection 10.0.0.108 -Port 8000
```

## Oba muszą zwrócić `TcpTestSucceeded : True`. Otwórz w przeglądarce: `http://10.0.0.108:3001`.

## Diagnostyka jeśli coś nie wstaje

Zaloguj się i sprawdź po kolei:

```powershell
Get-Service WSL-Keepalive, WSL-PortProxy
wsl -d Ubuntu-22.04 -u root -- systemctl status docker
wsl -d Ubuntu-22.04 -u root -- docker ps
netsh interface portproxy show v4tov4
```

- `docker ps` puste → kontener nie ma restart policy.
- Portproxy puste → uruchom ręcznie `WSL-PortProxy`.
- WSL IP się zmieniło → re-run `wsl-ports.ps1` (dlatego jest osobna usługa).
