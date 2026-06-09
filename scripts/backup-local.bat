@echo off
REM ============================================================
REM  Backup lokalnej bazy + plikow storage
REM  Uruchamiac codziennie z Harmonogramu zadan Windows (np. 02:00)
REM  Backupy lapuj na innym dysku (D:) lub NAS
REM ============================================================
setlocal

set BACKUP_ROOT=D:\backups
set STAMP=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%
set DEST=%BACKUP_ROOT%\%STAMP%

if not exist "%DEST%" mkdir "%DEST%"

echo [1/3] Backup bazy danych (pg_dump)...
docker exec supabase-db pg_dump -U postgres -F c -d postgres > "%DEST%\db.dump"
if errorlevel 1 goto :fail

echo [2/3] Backup plikow storage (zalaczniki urzadzen, PDFy)...
xcopy /E /I /Y /Q "C:\supabase\supabase\docker\volumes\storage" "%DEST%\storage"
if errorlevel 1 goto :fail

echo [3/3] Usuwam backupy starsze niz 30 dni...
forfiles /p "%BACKUP_ROOT%" /d -30 /c "cmd /c if @isdir==TRUE rd /s /q @path" 2>nul

echo.
echo === Backup OK: %DEST% ===
exit /b 0

:fail
echo.
echo === BLAD BACKUPU: %DATE% %TIME% ===
exit /b 1
