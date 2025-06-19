@echo off
echo =========================================
echo   CREATION DU SETUP.EXE CODESYNC  
echo =========================================
echo.

echo [1/4] Nettoyage des anciens builds...
if exist dist\*.exe del /Q dist\*.exe
if exist dist\win-unpacked rmdir /S /Q dist\win-unpacked > nul 2>&1

echo [2/4] Installation des dependances si necessaire...
call npm install

echo [3/4] Compilation de l'installateur NSIS...
echo Ceci peut prendre quelques minutes...
call npm run build-installer

echo [4/4] Verification du resultat...
echo.

if exist "dist\CodeSync Setup *.exe" (
    echo ========================================
    echo      ✅ SETUP.EXE CREE AVEC SUCCES !
    echo ========================================
    echo.
    echo 📦 Fichier cree :
    for %%f in ("dist\CodeSync Setup *.exe") do echo    %%~nxf
    echo.
    echo 📂 Emplacement : dist\
    echo 💾 Taille :
    for %%f in ("dist\CodeSync Setup *.exe") do echo    %%~zf bytes
    echo.
    echo 🚀 Tu peux maintenant distribuer ce setup.exe !
    echo    - Double-clic pour installer
    echo    - Cree raccourcis bureau et menu demarrer
    echo    - Desinstallation propre via Panneau de Config
    echo.
) else (
    echo ❌ ECHEC : Setup.exe non trouve !
    echo Verifie les erreurs ci-dessus.
    echo.
)

echo Appuie sur une touche pour continuer...
pause > nul 