@echo off
rem Double-clic : récupère sur ce PC les données que les robots GitHub ont collectées ce matin
rem (veille France Travail + veille alternance et stages), puis ouvre la page de présentation.
cd /d "%~dp0"
"C:\Program Files\Git\cmd\git.exe" pull --rebase origin main
echo.
if errorlevel 1 (echo La recuperation a echoue : lisez le message ci-dessus. & pause & exit /b 1)
echo Donnees a jour.
start "" "%~dp0presentation.html"
timeout /t 3 >nul
