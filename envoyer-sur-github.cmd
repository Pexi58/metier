@echo off
rem Double-clic : envoie sur GitHub (github.com/Pexi58/metier) les modifications faites dans ce dossier.
rem 1) enregistre les modifications (commit) ; 2) récupère ce que les robots du matin ont enregistré sur GitHub ;
rem 3) envoie. Rien n'est effacé : chaque envoi s'ajoute à l'historique du dépôt.
rem En cas de conflit (un même fichier de données refait ici et par le robot), c'est la version de ce PC qui est gardée ;
rem celle du robot reste dans l'historique.
rem La première fois, une fenêtre GitHub demande de se connecter : « Sign in with your browser » puis « Authorize ».
cd /d "%~dp0"
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% add -A
%GIT% diff --cached --quiet
if errorlevel 1 %GIT% commit -m "Modifications du %date%"
%GIT% pull --rebase -X theirs origin main
if errorlevel 1 (echo. & echo La recuperation a echoue : lisez le message ci-dessus. & pause & exit /b 1)
%GIT% push origin main
echo.
if errorlevel 1 (echo L'envoi a echoue : lisez le message ci-dessus.) else (echo Envoi termine. Vous pouvez fermer cette fenetre.)
pause
