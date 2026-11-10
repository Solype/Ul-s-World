#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL du stack docker compose (service `db`), avec rotation des anciennes sauvegardes.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage : scripts/backup-db.sh [--dir DIR] [--keep N]

Sauvegarde la base newmannheim (pg_dump, format custom) du service `db` de docker compose dans
DIR/newmannheim-AAAAmmjj-HHMMSS.dump, puis ne garde que les N sauvegardes les plus récentes de DIR.
Le stack doit tourner (`docker compose up -d`).

Options :
  --dir DIR    dossier des sauvegardes (défaut : backups/ à la racine du dépôt) ; relatif au dossier courant
  --keep N     nombre de sauvegardes gardées, N >= 1 (défaut : 14)
  -h, --help   affiche cette aide

Variables d'environnement :
  COMPOSE_PROJECT_NAME  projet docker compose. Son nom vient du dossier du dépôt : le mettre à `newmannheim`
                        quand le script ne tourne pas depuis le checkout principal (ex. un worktree).
  POSTGRES_PASSWORD     lu par docker-compose.yml (obligatoire) : vient normalement du .env à la racine.

Exemple :
  scripts/backup-db.sh --keep 30
  crontab : 0 3 * * * cd /chemin/du/depot && scripts/backup-db.sh

Restauration (remplace le contenu actuel de la base) :
  docker compose exec -T db pg_restore -U newmannheim -d newmannheim --clean --if-exists < backups/newmannheim-AAAAmmjj-HHMMSS.dump
EOF
}

dir=""
keep=14
while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --dir) dir="${2:?--dir attend un dossier}"; shift 2 ;;
        --keep) keep="${2:?--keep attend un nombre}"; shift 2 ;;
        *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
    esac
done
if ! [[ "$keep" =~ ^[1-9][0-9]*$ ]]; then
    echo "--keep attend un entier >= 1 : $keep" >&2
    exit 2
fi

# --dir est relatif au dossier courant : on le résout avant de passer à la racine du dépôt.
[ -n "$dir" ] && dir=$(mkdir -p "$dir" && cd "$dir" && pwd)
cd "$(dirname "$0")/.."
dir="${dir:-$PWD/backups}"
mkdir -p "$dir"

file="$dir/newmannheim-$(date +%Y%m%d-%H%M%S).dump"
tmp="$file.tmp"
# Écrit dans un fichier temporaire puis renommé : jamais de sauvegarde à moitié écrite sous le nom final.
trap 'rm -f "$tmp"' EXIT
docker compose exec -T db pg_dump -U newmannheim -Fc newmannheim > "$tmp"
mv "$tmp" "$file"
echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"

# Rotation : le nom horodaté trie les sauvegardes de la plus ancienne à la plus récente.
shopt -s nullglob
dumps=("$dir"/newmannheim-*.dump)
if [ ${#dumps[@]} -gt "$keep" ]; then
    rm -f -- "${dumps[@]:0:${#dumps[@]}-keep}"
fi
