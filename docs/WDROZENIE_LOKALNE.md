# Wdrożenie lokalne na Windows Server — instrukcja krok po kroku

Cały system (aplikacja + baza danych + pliki + logowanie) stawiamy na jednym Windows Server. **Nic nie wychodzi poza serwer.** Internet potrzebny tylko do pierwszej instalacji i do pobierania aktualizacji kodu (można też przez pendrive).

---

## 0. Co stawiamy

| Warstwa | Technologia | Gdzie |
|---|---|---|
| Baza danych | PostgreSQL (Supabase self-hosted) | Docker, port 5432 |
| Logowanie / sesje | GoTrue (Supabase) | Docker, port 9999 |
| API + Storage (pliki) | PostgREST + Storage API | Docker, port 8000 |
| Studio (panel bazy) | Supabase Studio | Docker, port 3000 |
| Aplikacja (UI) | TanStack Start (Node.js) | PM2, port 3001 |
| Reverse proxy + HTTPS | IIS lub Caddy | port 80/443 |

---

## 1. Wymagania sprzętowe

- Windows Server 2019 / 2022
- **8 GB RAM** minimum (rekomendowane 16 GB)
- 100 GB wolnego miejsca na dysku (baza + załączniki + backupy)
- Konto z uprawnieniami administratora
- (Opcjonalnie) WSL2 włączone — Docker Desktop go używa

---

## 2. Instalacja narzędzi bazowych

PowerShell **jako Administrator**:

```powershell
# 1. Chocolatey (menedżer pakietów do Windows)
Set-ExecutionPolicy Bypass -Scope Process -Force
iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

# 2. Git, Node.js LTS
choco install -y git nodejs-lts

# 3. Bun (szybszy npm)
powershell -c "irm bun.sh/install.ps1 | iex"

# 4. Docker Desktop
choco install -y docker-desktop
# Po instalacji: restart serwera. Po restarcie uruchom Docker Desktop ręcznie raz,
# zaakceptuj licencję, włącz "Start on login".

# 5. PM2 (do uruchamiania aplikacji jako usługa Windows)
npm install -g pm2 pm2-windows-startup
pm2-startup install
```

Sprawdzenie:
```powershell
git --version
node --version
bun --version
docker --version
```

---

## 3. Postaw lokalną bazę (Supabase self-hosted)

```powershell
# Folder na infrastrukturę
mkdir C:\supabase
cd C:\supabase

# Klonujemy oficjalne repo Supabase (tylko folder docker)
git clone --depth 1 https://github.com/supabase/supabase
cd supabase\docker

# Kopiujemy szablon konfiguracji
copy .env.example .env
```

Edytuj `C:\supabase\supabase\docker\.env` (np. Notepad++). **Koniecznie zmień:**

```
POSTGRES_PASSWORD=<wymyśl mocne hasło>
JWT_SECRET=<wygeneruj 40+ losowych znaków>
ANON_KEY=<wygeneruj na https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys>
SERVICE_ROLE_KEY=<jak wyżej>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<hasło do panelu Studio>
SITE_URL=http://<ip-serwera>
API_EXTERNAL_URL=http://<ip-serwera>:8000
```

Wygenerowanie kluczy JWT (ANON_KEY i SERVICE_ROLE_KEY) — najprościej na stronie z linku w komentarzu w `.env`. Każdy klucz musi być podpisany tym samym `JWT_SECRET`.

**WAŻNE (Windows): zmień bind mount bazy na named volume.** Postgres 15+ wymaga uprawnień katalogu danych `0700/0750`, a NTFS przez bind mount mapuje się jako `0777` — kontener `db` nie wystartuje (`data directory has invalid permissions`).

W `docker-compose.yml` znajdź serwis `db:` → sekcja `volumes:` → linia:
```yaml
- ./volumes/db/data:/var/lib/postgresql/data:Z
```
Zamień na:
```yaml
- db-data:/var/lib/postgresql/data
```
Na samym dole pliku (poziom główny, obok `services:`) dodaj:
```yaml
volumes:
  db-data:
```

Uruchom stack:
```powershell
docker compose up -d
```

Pierwsze uruchomienie pobiera ~3 GB obrazów (10–15 min). Sprawdź:
```powershell
docker compose ps
docker compose logs db --tail 30
```
Wszystkie kontenery powinny mieć status `running` / `healthy`.

> Jeśli kontener `db` był już raz uruchomiony ze starym bind mountem i pokazuje `invalid permissions`, wykonaj reset:
> ```powershell
> docker compose down -v
> Remove-Item -Recurse -Force .\volumes\db\data -ErrorAction SilentlyContinue
> docker compose up -d
> ```
> Backup robimy przez `pg_dump` (skrypt `backup-local.bat`), więc trzymanie danych w named volume nie utrudnia kopii zapasowych.

Otwórz w przeglądarce `http://localhost:3000` — powinno wyskoczyć logowanie do Studio.

---

## 4. Pobierz aplikację

```powershell
mkdir C:\apps
cd C:\apps
git clone https://github.com/<twoj-user>/<twoje-repo>.git oczyszczalnia
cd oczyszczalnia
bun install
```

---

## 5. Skonfiguruj `.env` aplikacji

Skopiuj wzór z repo:
```powershell
copy .env.local.example .env
```

Edytuj `C:\apps\oczyszczalnia\.env` i wklej wartości z **kroku 3** (te same `ANON_KEY` i `SERVICE_ROLE_KEY` co w Supabase):

```
VITE_SUPABASE_URL=http://<ip-serwera>:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
SUPABASE_URL=http://<ip-serwera>:8000
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

> `<ip-serwera>` to lokalny IP serwera (np. `192.168.1.50`) albo nazwa hosta w sieci wewnętrznej. Klienci (przeglądarki operatorów) muszą móc się pod ten adres dostać.

---

## 6. Wgraj schemat bazy (tabele, RLS, triggery)

> **UWAGA:** `supabase db push` ma znany bug — **ignoruje `?sslmode=disable`** i zawsze wymusza TLS. Lokalny Postgres w Dockerze nie ma certyfikatu, więc dostaniesz `tls error (server refused TLS connection)`. Dlatego migracje wgrywamy **bezpośrednio przez `psql`** — wybierz jedną z dwóch opcji poniżej.

### Opcja A — przez lokalnie zainstalowany `psql` (PostgreSQL 17)

Wcześniej zainstalowałeś `choco install postgresql17`, więc `psql.exe` masz w `C:\Program Files\PostgreSQL\17\bin\`.

```powershell
cd C:\apps\oczyszczalnia
$env:PGPASSWORD="<haslo-z-kroku-3>"
Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "== $($_.Name) =="
  & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Migracja $($_.Name) nie powiodla sie" }
}
```

### Opcja B — przez kontener bazy (bez lokalnego `psql`)

```powershell
cd C:\apps\oczyszczalnia
docker cp supabase\migrations supabase-db:/tmp/migrations
docker exec supabase-db sh -c 'for f in /tmp/migrations/*.sql; do echo "== $f =="; psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f" || exit 1; done'
```

> **WAŻNE:** użyj **pojedynczych cudzysłowów** wokół `sh -c '...'`. PowerShell interpretuje `$f` wewnątrz podwójnych cudzysłowów jako swoją zmienną (pustą) i polecenie się sypie z `Unterminated quoted string`.
>
> Wariant bez pętli (jeszcze prostszy, wszystko jednym strumieniem):
> ```powershell
> docker exec supabase-db bash -c 'cat /tmp/migrations/*.sql | psql -U postgres -d postgres -v ON_ERROR_STOP=1'
> ```

Obie metody wgrywają **wszystkie migracje z `supabase/migrations/`** — czyli całą strukturę bazy zbudowaną w Lovable.

> Komendy `supabase db push` używaj tylko do baz zdalnych (chmurowych Supabase), nie do lokalnego Dockera.

---

## 7. Stwórz pierwszego użytkownika (admin/kierownik)

W Studio (`http://localhost:3000`) → Authentication → Users → **Add user** → wpisz email w formacie `admin@oczyszczalnia.local` i hasło. Potem w Studio → SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<id-użytkownika-z-tabeli-auth.users>', 'admin');
```

---

## 8. Zbuduj i uruchom aplikację

```powershell
cd C:\apps\oczyszczalnia
bun run build
pm2 start ".output\server\index.mjs" --name oczyszczalnia
pm2 save
```

Aplikacja działa na `http://<ip-serwera>:3001`. Wejdź, zaloguj się kontem z kroku 7.

Sprawdzenie statusu:
```powershell
pm2 status
pm2 logs oczyszczalnia
```

---

## 9. Reverse proxy + HTTPS (port 80/443)

**Opcja A: Caddy (najprostsze, automatyczne HTTPS w sieci wewnętrznej)**

```powershell
choco install -y caddy
```

Plik `C:\caddy\Caddyfile`:
```
oczyszczalnia.local {
    tls internal
    reverse_proxy localhost:3001
}
```
Dodaj `oczyszczalnia.local` do DNS sieci wewnętrznej (lub `hosts` na komputerach klientów). Uruchom:
```powershell
caddy run --config C:\caddy\Caddyfile
```

**Opcja B: IIS** — zainstaluj IIS + moduł **URL Rewrite** + **Application Request Routing**, stwórz stronę → reverse proxy na `http://localhost:3001`.

---

## 10. Automatyczne backupy

Skrypt `C:\apps\oczyszczalnia\scripts\backup-local.bat` (jest w repo) wykonuje pełny backup bazy + plików storage. Dodaj do **Harmonogramu zadań Windows**:

- Wyzwalacz: codziennie 02:00
- Akcja: `C:\apps\oczyszczalnia\scripts\backup-local.bat`
- Backupy lądują w `D:\backups\YYYY-MM-DD\`

Trzymaj backupy na **innym dysku** niż baza (najlepiej NAS).

---

## 11. Aktualizacje z Lovable

**Wariant 1: ręcznie** (wystarczający dla małych zespołów)

Po zmianach w Lovable uruchom na serwerze:
```powershell
C:\apps\oczyszczalnia\scripts\deploy-local.bat
```
Skrypt robi: `git pull` → `bun install` → `bun run build` → `supabase db push` → `pm2 restart`.

**Wariant 2: w pełni automatycznie** (GitHub Actions self-hosted runner)

1. Połącz projekt Lovable z GitHub (Lovable: `+` → GitHub → Connect).
2. Na serwerze zainstaluj self-hosted runner:
   ```powershell
   mkdir C:\actions-runner; cd C:\actions-runner
   # pobierz runner z: GitHub repo → Settings → Actions → Runners → New self-hosted runner (Windows)
   .\config.cmd --url https://github.com/<user>/<repo> --token <TOKEN>
   .\svc.cmd install
   .\svc.cmd start
   ```
3. W repo dodaj `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy Local
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: self-hosted
       steps:
         - uses: actions/checkout@v4
         - run: bun install
         - run: bun run build
         - run: supabase db push --db-url ${{ secrets.LOCAL_DB_URL }}
         - run: pm2 restart oczyszczalnia
   ```

Od teraz: **zmiana w Lovable → push do GitHub → 1–2 min → działa na serwerze**.

**Wariant 3: offline (bez internetu)** — kopiujesz repo na pendrive, na serwerze odpalasz `deploy-local.bat`.

---

## 12. Co jeśli serwer ma być 100% odcięty od internetu

- Aktualizacje: pendrive + `deploy-local.bat`
- Maile (reset hasła, powiadomienia mailowe): **wyłącz** w Supabase Studio → Auth → Settings, albo skonfiguruj lokalny SMTP relay (Postfix w Docker, hMailServer)
- Certyfikat HTTPS: Caddy `tls internal` (samopodpisany) lub własne CA firmowe
- AI (gdyby było używane): lokalny model przez **Ollama**, klucz `LOVABLE_API_KEY` przestaje działać

---

## 13. Checklista po wdrożeniu

- [ ] `docker compose ps` — wszystko `healthy`
- [ ] `pm2 status` — `oczyszczalnia` `online`
- [ ] Logowanie z komputera klienckiego działa
- [ ] Test: utworzenie raportu zmianowego + sprawdzenie w Studio czy zapisał się w bazie
- [ ] Test: upload zdjęcia urządzenia + sprawdzenie czy plik jest w `C:\supabase\supabase\docker\volumes\storage\`
- [ ] Backup ręcznie raz uruchomiony — sprawdź `D:\backups\`
- [ ] Harmonogram zadań pokazuje "ostatni wynik 0x0"
- [ ] HTTPS działa, certyfikat zaakceptowany przez przeglądarki klientów

---

## 14. Rozwiązywanie problemów

| Objaw | Co sprawdzić |
|---|---|
| Aplikacja nie startuje | `pm2 logs oczyszczalnia` |
| Logowanie nie działa | Czy `JWT_SECRET` w `.env` aplikacji = `JWT_SECRET` w Supabase `.env` |
| 401 / „Invalid API key" | Czy `ANON_KEY` w obu `.env` jest identyczny |
| Storage nie zapisuje plików | Czy folder `volumes/storage` ma uprawnienia zapisu dla Docker |
| Brak połączenia z bazą | `docker compose ps` — czy `db` jest `healthy` |
| Klient nie otwiera strony | Firewall Windows: otworzyć porty 80/443 (lub 3001) |
