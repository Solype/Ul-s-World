#!/usr/bin/env bash
# Hook PostToolUse (Write|Edit) : vérifie le code juste après une modification par Claude.
#   backend/**/*.py          -> pytest
#   frontend/src/**/*.ts(x)  -> tsc (vérification des types)
# Sortie 2 : l'erreur est renvoyée à Claude, qui doit corriger avant de continuer.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

case "$f" in
  "$root"/backend/*.py)
    out=$(cd "$root/backend" && .venv/bin/pytest -q -p no:warnings 2>&1) \
      || { echo "pytest échoue après modification de $f :" >&2; echo "$out" | tail -25 >&2; exit 2; } ;;
  "$root"/frontend/src/*.ts | "$root"/frontend/src/*.tsx)
    out=$(cd "$root/frontend" && npx tsc --noEmit -p tsconfig.json 2>&1) \
      || { echo "tsc échoue après modification de $f :" >&2; echo "$out" | tail -25 >&2; exit 2; } ;;
esac
exit 0
