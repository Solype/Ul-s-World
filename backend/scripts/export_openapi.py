"""Écrit le schéma OpenAPI dans un fichier, pour générer le client TypeScript du frontend.

Usage : python scripts/export_openapi.py ../frontend/openapi.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

Path(sys.argv[1]).write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n")
