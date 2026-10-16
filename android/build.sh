#!/bin/sh
# Compile l'APK signé dans le conteneur et le dépose dans android/dist/ (monté sur /project).
#
# La clé de signature (android/keystore/newmannheim.jks) est créée au premier lancement puis réutilisée :
# un APK signé avec la même clé s'installe par-dessus le précédent. La perdre oblige à désinstaller l'app.
set -eu

KEYSTORE=/project/keystore/newmannheim.jks
PASSWORD="${APK_KEYSTORE_PASSWORD:-newmannheim}"
OWNER=$(stat -c %u:%g /project)

mkdir -p /project/keystore /project/dist
# Ce qui est écrit dans le dossier monté revient à son propriétaire, même si la compilation échoue.
trap 'chown -R "$OWNER" /project/dist /project/keystore' EXIT
if [ ! -f "$KEYSTORE" ]; then
    echo "Nouvelle clé de signature : $KEYSTORE (à garder)"
    keytool -genkeypair -keystore "$KEYSTORE" -storepass "$PASSWORD" -keypass "$PASSWORD" -alias newmannheim \
        -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=NewMannheim" > /dev/null
fi

# Compilation dans une copie : le dossier monté ne reçoit que l'APK (pas de build/ ni de .gradle/ à root).
rm -rf /tmp/build && cp -r /project /tmp/build && rm -rf /tmp/build/dist /tmp/build/keystore
cd /tmp/build
gradle --no-daemon --quiet assembleRelease \
    -PkeystoreFile="$KEYSTORE" -PkeystorePassword="$PASSWORD" \
    -PversionCode="$(( $(date +%s) / 60 ))" -PserverUrl="${APK_SERVER_URL:-}"

cp app/build/outputs/apk/release/app-release.apk /project/dist/newmannheim.apk
echo "APK : android/dist/newmannheim.apk"
