# Faire évoluer les règles

Comment ajouter, renommer ou supprimer une compétence, un groupe de compétences ou un attribut.

Les règles vivent dans le backend (`backend/app/rules/`) ; le frontend les lit via `GET /api/rules`
et construit ses formulaires à partir de cette réponse. On modifie donc surtout le backend.

Les données de la fiche (attributs, compétences…) sont stockées en JSON : **ajouter** un élément ne
demande pas de migration. **Supprimer ou renommer** en demande une, pour les personnages déjà enregistrés.

## Compétences

### Ajouter une compétence

1. Dans `backend/app/rules/data.py`, ajouter `"cle": "Libellé"` dans le bon groupe de `SKILL_GROUPS`.
   La clé est en minuscules, sans accent ni espace (`arme_hast`, `petit_projectile`).
2. Appliquer (voir [Après chaque modification](#après-chaque-modification)).

L'éditeur l'affiche tout seul : il n'y a rien à changer dans le frontend.

### Supprimer ou renommer une compétence

1. La retirer (ou la renommer) dans `SKILL_GROUPS`.
2. Chercher sa clé partout : `grep -rn '"cle"' backend/app`. Elle peut être utilisée par :
   - les rôles (`rules/roles_catalog.py` : `sk(...)`, `one_of(...)`) ;
   - les animaux totems (`rules/catalogs.py` : `_sk(...)`) ;
   - les traits (`rules/traits.py`).

   Si un rôle cite une compétence qui n'existe plus, **le backend refuse de démarrer** : c'est voulu,
   l'erreur indique la compétence en cause.
3. Les personnages enregistrés qui ont des points dans cette compétence afficheront « Compétence
   inconnue ». Pour un **renommage**, écrire une migration qui renomme la clé dans la colonne `skills`
   (voir [Migration de données](#migration-de-données)).

### Ajouter un groupe de compétences

1. Ajouter une entrée dans `SKILL_GROUPS` (`data.py`) : `"cle": {"label": "Libellé", "skills": {...}}`.
2. Si c'est un groupe de **combat**, l'ajouter aussi à `COMBAT_GROUPS` dans `rules/traits.py`, pour
   qu'*Incompétent !* en combat le couvre.
3. Un groupe qui alimente une réserve (comme Mana ou Connaissances) se déclare dans `SKILL_POOLS`.

Supprimer un groupe : comme pour une compétence, chercher sa clé (rôles `spread(...)` / `pick(...)`,
traits), puis migrer les colonnes `skill_groups` et `skills`.

## Attributs

### Ajouter un attribut

1. `backend/app/rules/data.py` :
   - ajouter l'attribut dans l'énumération `Attribute` ;
   - ajouter son triplet `(minimum, maximum, limite surhumaine)` pour **chaque espèce** dans
     `SPECIES_LIMITS`, à la même position que dans `Attribute`. S'il en manque un, le backend ne démarre pas ;
   - vérifier les points d'attributs de `PRIORITY_TABLE`.
2. `backend/app/rules/traits.py` : `HYBRID_MAX_TOTAL` vaut le total des maximums de chaque espèce (53) ;
   le mettre à jour si ce total change.
3. `frontend/src/lib/labels.ts` : ajouter son libellé dans `ATTRIBUTE_LABELS`. La vérification des
   types (`npx tsc --noEmit`) échoue tant qu'il manque.

### Supprimer ou renommer un attribut

Une **migration est obligatoire** : les attributs enregistrés sont contrôlés par l'API, un personnage
qui garde un attribut disparu ne pourrait plus être lu.

Penser aussi aux traits qui citent des attributs précis : *Estropié* (Force, Agilité) et *Asocial*
(Social), dans `rules/traits.py`.

## Textes des règles (pages à lire)

Les pages de règles (bouton « Règles », Ctrl+K, `#/regles`) viennent de deux sources.

### Ajouter du texte

Le texte retranscrit est en Markdown dans `backend/app/rules/texts/`, un fichier par page.

- **Compléter une page** : modifier le fichier (par exemple `creation.md`). Chaque titre `## …` devient
  une section, qu'on retrouve dans le sommaire et dans la recherche.
- **Ajouter une page** : créer `backend/app/rules/texts/<id>.md`, dont la première ligne est le titre
  (`# Combat`), puis ajouter `<id>` dans `TEXT_ORDER` (`backend/app/api/rules.py`), à la position voulue.
- **Insérer un tableau tiré des données** : une ligne `<!-- data:especes -->` ou `<!-- data:priorites -->`.
  Pour un nouveau tableau, ajouter une fonction dans `DATA_BLOCKS` (`frontend/src/rules/pages.tsx`).
- Mise en forme disponible : titres, **gras**, listes, tableaux, et les encadrés `> **NB** — …`.

### Ajouter un élément de catalogue

Rôles, traits, langues et animaux totems s'affichent tout seuls dans les pages et la recherche : il
suffit de les ajouter à leur catalogue.

| Élément | Fichier |
|---|---|
| Rôle, tronc commun | `backend/app/rules/roles_catalog.py` |
| Trait | `backend/app/rules/traits.py` (`TRAITS`) |
| Langue, animal totem | `backend/app/rules/catalogs.py` |
| Compétence, groupe | `backend/app/rules/data.py` (voir plus haut) |

Si la règle doit aussi être **vérifiée** par l'éditeur (une limite, un coût…), il faut en plus
l'ajouter à `backend/app/rules/validation.py` (ou au calcul des effets des traits), avec un test.

## Migration de données

Pour renommer ou supprimer une clé dans les personnages enregistrés :

```bash
cd backend
.venv/bin/alembic revision -m "renommer la compétence x en y"
```

Puis, dans le fichier créé sous `migrations/versions/`, modifier le JSON de chaque personnage
(exemple : renommer la compétence `ancienne` en `nouvelle`) :

```python
import json

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, skills FROM characters")).fetchall()
    for id_, skills in rows:
        skills = json.loads(skills) if isinstance(skills, str) else (skills or {})
        if "ancienne" in skills:
            skills["nouvelle"] = skills.pop("ancienne")
            conn.execute(sa.text("UPDATE characters SET skills = :s WHERE id = :id"),
                         {"s": json.dumps(skills), "id": id_})
```

La migration s'applique toute seule au démarrage du conteneur backend (`alembic upgrade head`).

## Après chaque modification

```bash
# 1. Tests du backend
cd backend && .venv/bin/pytest -q

# 2. Types du frontend, régénérés depuis l'API
cd .. && backend/.venv/bin/python backend/scripts/export_openapi.py frontend/openapi.json
cd frontend && npm run gen:api && npx tsc --noEmit

# 3. Application
cd .. && docker compose up -d --build
```

Si un chiffre ou un intitulé vient d'un PDF de `refdoc/`, noter l'interprétation dans
`refdoc/infos.md` et les erreurs du document dans `refdoc/fix.md`.
