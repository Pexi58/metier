@echo off
rem Double-clic : refait data\alternance.json puis ouvre la page Alternance dans le navigateur.
cd /d "%~dp0"
node scripts\alternance.mjs
if errorlevel 1 (
  echo.
  echo Au moins un controle a echoue ou une erreur est survenue : lisez les lignes ci-dessus.
  pause
)
start "" "%~dp0alternance.html"
