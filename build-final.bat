@echo off
echo 🚀 Construction de CodeSync avec electron-packager...
echo.
echo 🔧 Nettoyage des anciens builds...
if exist "dist\CodeSync-win32-x64" rmdir /s /q "dist\CodeSync-win32-x64"
echo.
echo 📦 Packaging de l'application...
npx electron-packager . CodeSync --platform=win32 --arch=x64 --out=dist --overwrite --app-version=1.0.0 --build-version=1.0.0
echo.
if exist "dist\CodeSync-win32-x64\CodeSync.exe" (
    echo ✅ Build réussi!
    echo 📁 L'exécutable se trouve dans: dist\CodeSync-win32-x64\
    echo 🎯 Vous pouvez maintenant lancer CodeSync.exe
    echo.
    echo 💡 Pour distribuer l'application:
    echo    - Copiez tout le dossier dist\CodeSync-win32-x64\
    echo    - L'utilisateur final lance CodeSync.exe
) else (
    echo ❌ Erreur lors du build
    echo Vérifiez les messages d'erreur ci-dessus
)
echo.
pause 