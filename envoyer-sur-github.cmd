@echo off
rem Double-clic : envoie sur GitHub (github.com/Pexi58/metier) les modifications enregistrées dans ce dossier.
rem Il récupère d'abord ce que les robots du matin ont enregistré sur GitHub, puis envoie.
rem La première fois, une fenêtre GitHub demande de se connecter : « Sign in with your browser » puis « Authorize ».
cd /d "%~dp0"
"C:\Program Files\Git\cmd\git.exe" pull --rebase origin main
if errorlevel 1 (echo. & echo La recuperation a echoue : lisez le message ci-dessus. & pause & exit /b 1)
"C:\Program Files\Git\cmd\git.exe" push origin main
echo.
if errorlevel 1 (echo L'envoi a echoue : lisez le message ci-dessus.) else (echo Envoi termine. Vous pouvez fermer cette fenetre.)
pause
