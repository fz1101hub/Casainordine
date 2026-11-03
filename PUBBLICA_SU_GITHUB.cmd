@echo off
cd /d "%~dp0"
echo Repository PUBBLICO di destinazione: https://github.com/fz1101hub/Casainordine
set /p CONFIRM=Confermi il caricamento PUBBLICO del codice? (scrivi PUBBLICO): 
if not "%CONFIRM%"=="PUBBLICO" (
  echo Operazione annullata.
  pause
  exit /b 1
)
where git >nul 2>&1
if errorlevel 1 (
  echo Git non installato. Usa GitHub Desktop.
  pause
  exit /b 1
)
git push -u origin main
if errorlevel 1 (echo Errore nel caricamento. & pause & exit /b 1)
echo Verifica su https://github.com/fz1101hub/Casainordine
pause
