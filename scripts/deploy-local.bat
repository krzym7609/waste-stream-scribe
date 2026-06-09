@echo off
REM ============================================================
REM  Aktualizacja aplikacji lokalnej z repozytorium GitHub
REM  Uruchamiaj po zmianach w Lovable albo z Harmonogramu zadan
REM ============================================================
setlocal

cd /d C:\apps\oczyszczalnia
if errorlevel 1 (
  echo [BLAD] Nie znaleziono folderu aplikacji
  exit /b 1
)

echo [1/5] Pobieram nowy kod z GitHub...
git pull --ff-only
if errorlevel 1 goto :fail

echo [2/5] Instaluje zaleznosci...
call bun install
if errorlevel 1 goto :fail

echo [3/5] Wgrywam migracje bazy...
REM Ustaw zmienna LOCAL_DB_URL np. w zmiennych systemowych Windows
REM postgresql://postgres:HASLO@localhost:5432/postgres?sslmode=disable
call supabase db push --db-url "%LOCAL_DB_URL%"
if errorlevel 1 goto :fail

echo [4/5] Buduje aplikacje...
call bun run build
if errorlevel 1 goto :fail

echo [5/5] Restartuje usluge PM2...
call pm2 restart oczyszczalnia
if errorlevel 1 goto :fail

echo.
echo === Aktualizacja zakonczona pomyslnie: %DATE% %TIME% ===
exit /b 0

:fail
echo.
echo === BLAD AKTUALIZACJI: %DATE% %TIME% ===
exit /b 1
