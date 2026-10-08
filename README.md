# NewMannheim

Application de création de personnages pour le JDR NewMannheim (règles : `refdoc/`).

```
navigateur ──► frontend (nginx :8080) ──/api, /ws, /docs──► backend (FastAPI :8000) ──► PostgreSQL
```

| Partie | Techno | Rôle |
|---|---|---|
| `backend/` | FastAPI, SQLAlchemy 2, Alembic, Pydantic | API REST + websockets, règles de création, persistance |
| `frontend/` | React 19, Vite, TypeScript, Tailwind 4, shadcn/ui (Radix), openapi-fetch | Liste (PJ / PNJ / monstres) et éditeur, validation en direct, thème clair / sombre |
| `db` | PostgreSQL 17 (SQLite en dev local) | Stockage des personnages |

## Lancer

```bash
docker compose up -d --build
```

- Application : http://localhost:8080
- Doc de l'API (générée automatiquement) : http://localhost:8080/docs (Swagger) ou `/redoc`

### Jouer à plusieurs sur le même wifi

Les autres appareils du réseau ouvrent l'app avec l'adresse de la machine qui la fait tourner :

```bash
hostname -I      # ex. 192.168.1.24  →  http://192.168.1.24:8080   (en dev : :5173)
```

- Avec Docker, le port 8080 est publié sur toutes les interfaces. Le pare-feu de Fedora Workstation laisse passer les ports au-dessus de 1024 ; sur une autre configuration : `sudo firewall-cmd --add-port=8080/tcp` (ou `5173/tcp` en dev).
- Le nom mDNS marche aussi s'il est résolu sur le réseau : `http://<nom-de-la-machine>.local:8080`.
- **Le MJ doit lui aussi ouvrir l'app avec cette adresse** (pas `localhost`) avant de copier un lien d'invitation : le lien reprend l'adresse de la barre du navigateur. La carte Invitation le signale.
- L'IP peut changer (DHCP) : une réservation d'adresse dans la box évite de redonner un nouveau lien.
- C'est du HTTP sans chiffrement, fait pour un réseau de confiance. Pour une exposition sur Internet, passer en HTTPS et mettre `COOKIE_SECURE=true`.

### En développement (rechargement à chaud)

```bash
# Backend, sur SQLite (./dev.db)
cd backend
uv sync --extra dev
uv run alembic upgrade head
uv run fastapi dev app/main.py          # http://localhost:8000/docs

# Frontend, dans un autre terminal (proxy /api et /ws vers :8000)
cd frontend
npm install
npm run dev                             # http://localhost:5173
```

Tests backend : `cd backend && uv run pytest`

## Organisation du backend

```
backend/app/
├── main.py              # création de l'app, CORS, branchement des routeurs
├── core/config.py       # variables d'environnement (DATABASE_URL, CORS_ORIGINS, SESSION_DAYS, COOKIE_SECURE)
├── core/security.py     # mots de passe (scrypt) et jetons de session
├── db.py                # moteur SQLAlchemy + session par requête
├── models.py            # tables SQL
├── schemas.py           # schémas Pydantic de l'API (= ce qu'affiche /docs)
├── rules/
│   ├── data.py          # ★ données des règles : espèces, priorités, compétences
│   ├── roles_catalog.py # ★ catalogue des rôles (refdoc/Roles.pdf)
│   ├── catalogs.py      # ★ langues et animaux totems (refdoc/Langues.pdf)
│   ├── traits.py        # ★ traits de personnage et calcul de leurs effets (refdoc/Traits de personnage.pdf)
│   ├── texts/           # ★ textes des règles à lire (Markdown), ex. creation.md
│   └── validation.py    # vérification d'un personnage contre les règles
├── api/
│   ├── deps.py          # current_user, admin_user, can_access (qui a le droit de voir un personnage)
│   ├── auth.py          # /api/auth/register|login|logout|me, GET /api/users (admin)
│   ├── rules.py         # GET /api/rules, POST /api/rules/validate
│   ├── characters.py    # CRUD /api/characters (?kind=pj|pnj|monstre) + GET /{id}/validation, PUT /{id}/owner
│   ├── rooms.py         # /api/rooms : rooms, membres, personnages proposés / acceptés, chat
│   └── ws.py            # websocket /ws/{channel}
└── realtime/manager.py  # diffusion des événements aux clients websocket
```

**Principes**

- **Comptes et propriétaires.** Inscription libre (identifiant + mot de passe) ; le premier compte créé est admin et récupère les personnages qui n'avaient pas de propriétaire. Chaque personnage (PJ, PNJ ou monstre) appartient au compte qui l'a créé (`owner_id`). Seuls le propriétaire et un admin le modifient (`can_edit`) ; un admin voit tout et peut changer le propriétaire. La lecture (`can_view`, dans `api/deps.py`) s'ouvre en plus aux membres des rooms où le personnage est intégré (voir Rooms). Un personnage qu'on ne peut pas voir répond 404, pour ne pas révéler qu'il existe ; un personnage vu mais pas modifiable répond 403 à une modification. `GET /api/characters` ne liste que ses propres personnages.
- **Session par cookie** `nm_session` (HttpOnly, SameSite=Lax) : le navigateur l'envoie tout seul sur `/api` et `/ws`. La base ne garde que l'empreinte SHA-256 du jeton (table `user_sessions`), la déconnexion la supprime. Derrière HTTPS, mettre `COOKIE_SECURE=true`. `GET /api/rules` reste public.
- **Les règles vivent à un seul endroit** : `app/rules/data.py`. Le frontend ne les code pas en dur, il les lit via `GET /api/rules`. Si un chiffre change dans le PDF, on le change là, et c'est tout.
- **Un personnage peut être incomplet.** La sauvegarde n'est jamais bloquée par les règles. La validation renvoie une liste de problèmes, que l'éditeur affiche en direct, et on peut donc créer un personnage étape par étape.
- **PJ, PNJ et monstres sont dans la même table** (`characters`), car ils ont la même fiche :
  - `kind` (`pj` | `pnj` | `monstre`) dit ce que c'est ;
  - `creation_mode` dit comment c'est vérifié : `rules` applique les règles de création, `free` (monstres, PNJ improvisés) ne vérifie que la cohérence avec le catalogue de compétences ;
  - les choix propres à la création selon les règles (priorités, PC restants, sous dépensés) sont dans le bloc `creation`, vide en saisie libre ;
  - l'espèce est un texte libre, mais elle doit être une espèce jouable en mode `rules`.
- **Réserves Mana et Connaissances** (`SKILL_POOLS`, champ `pools`) : des PCP des groupes Compétence magique et Intellect y sont mis. Chaque PCP donne +15 au mana max, ou 2 points de connaissance libres.
- **Les connaissances sont libres** (`knowledges` : intitulé → niveau). Ce sont les joueurs qui les définissent, pas le catalogue de compétences. **Le mana** (`mana` : actuel / max) est commun à la magie et à la religion. Voir `refdoc/infos.md`.
- **Traits** (`traits`) : les bonus coûtent des PC, les malus en rapportent. Leurs effets chiffrés (PC, points et limites d'attributs, compétences inaccessibles, sous, mana) sont calculés par `rules/traits.py` et renvoyés dans le rapport de validation (`trait_effects`) : le frontend s'en sert pour ses limites, sans recoder les règles. Les interprétations du document sont dans `refdoc/infos.md`.
- **Relations** (`relations`) : 1 PC restant = une relation (PNJ, lieu ou culture) ; en mode règles, leur nombre doit correspondre aux PC dépensés.
- **Export** : `GET /api/characters/{id}/export` renvoie un fichier JSON `{format, version, exported_at, character}`. `version` augmente quand le format change : c'est ce qui permettra l'import plus tard.
- **Textes des règles** : `app/rules/texts/*.md` (un fichier par page, déclaré dans `TEXT_ORDER` de `api/rules.py`). Une ligne `<!-- data:especes -->` ou `<!-- data:priorites -->` est remplacée par un tableau construit à partir des données, pour que les chiffres ne soient écrits qu'une fois.
- **Les données de la fiche sont stockées en JSON** (attributs, compétences, rôles…) : ajouter une compétence ne demande pas de migration. Le nom, l'espèce et les dates sont de vraies colonnes, pour pouvoir filtrer et trier.

## Frontend

- **Composants** : shadcn/ui, dans `src/components/ui/`. Ce sont des fichiers générés et modifiables. Pour en ajouter un : `npx shadcn@latest add <composant>`. Les composants 21st.dev s'ajoutent de la même façon, avec leur URL de registre (il faut une clé `API_KEY_21ST`).
- **Thème** : palette parchemin et bronze, définie en variables CSS dans `src/index.css` (`:root` pour le clair, `.dark` pour le sombre). Titres en Cinzel, texte en Geist.
- **Navigation par l'URL** : `#/pj`, `#/pnj`, `#/monstre` (listes), `#/nouveau/<type>` (création), `#/personnage/<id>` (édition), `#/fiche/<id>` (fiche à imprimer), `#/regles/<page>/<section>` (règles en pleine page), `#/rooms` et `#/room/<id>` (rooms), `#/rejoindre/<code>` (lien d'invitation).
- **Règles** (`src/rules/`) : pages construites à partir de `GET /api/rules` (texte retranscrit + catalogues), recherche sans accents sur toutes les pages, panneau à droite de n'importe quelle page (bouton « Règles » ou Ctrl+K), boutons « ? » dans l'éditeur.
- **Fiche imprimable** (`src/pages/CharacterSheet.tsx`) : sur le modèle de la Fiche PJ vide ; « Imprimer » → PDF depuis le navigateur.
- **Organisation de l'éditeur** (`src/pages/CharacterEditor.tsx`) : une carte par étape. Le panneau latéral contient la navigation (avec le nombre de problèmes par section), les jauges de points et ce qui reste à compléter.

## Rooms

Une room est une table de jeu (`app/api/rooms.py`, tables `rooms`, `room_members`, `room_characters`, `chat_messages`).

- **N'importe quel compte crée une room et en devient le MJ** (`Room.gm`). Les joueurs sont dans `room_members` ; le MJ n'y figure pas.
- **Entrer** : avec le code d'invitation (`POST /api/rooms/join`, lien `#/rejoindre/<code>`), ou ajouté par le MJ via son identifiant. Le code n'est montré qu'au MJ, qui peut en générer un nouveau (l'ancien ne marche plus).
- **Sortir** : un joueur quitte, le MJ exclut ; ses personnages sortent de la room et son websocket de room est fermé (4403). Le MJ ne quitte pas, il supprime la room (le chat est effacé, les personnages restent).
- **Personnages** : un joueur propose un ou plusieurs de ses personnages, de n'importe quel type (PJ, animal de compagnie…) → `pending`. Le MJ accepte (`accepted`) ou refuse (la ligne est supprimée). Ceux du MJ entrent directement.
- **Qui voit quoi** : tous les membres et le MJ lisent les fiches des personnages acceptés ; le MJ lit aussi les propositions en attente. Seul le propriétaire modifie (le MJ non plus).
- **Temps réel** (canal `room:<id>`) : la présence, le chat, et les propositions / décisions sur les personnages (signal `room.characters`, sans contenu : chaque client relit la room avec ses droits, puisque le MJ voit toutes les propositions et un joueur seulement les siennes). Les fiches et le reste de la room (membres, nom) ne sont pas poussés : la page les relit après chaque action. Les messages s'envoient en REST (`POST /api/rooms/{id}/messages`, enregistrés en base) puis sont poussés à la room ; l'historique se lit par pages (`GET .../messages?before=<id>&limit=50`).

## Websockets

Le client se connecte à `/ws/<canal>`. Il doit être connecté (cookie de session), sinon le serveur ferme avec le code `4403` :

- `characters` : événements `character.created`, `character.updated` et `character.deleted` sur ses personnages (sur tous pour un admin). La liste du frontend s'en sert pour se rafraîchir toute seule. En interne, le serveur branche le client sur `characters:user:<id>` ou `characters:all` ; `notify_character` (`realtime/manager.py`) prévient les bons canaux.
- `character:<id>` : événements d'un de ses personnages.
- `room:<id>` (membres et MJ) : `{"type": "room.presence", "online": [ids]}` à chaque arrivée ou départ, `{"type": "room.message", "message": {...}}` pour le chat, et `{"type": "room.characters"}` quand un personnage est proposé, accepté, refusé ou retiré. Le gestionnaire retient le compte derrière chaque connexion (`manager.online`) et peut couper un compte (`manager.kick`).

Les messages ont la forme `{"type": "character.updated", "id": 3}`. Pour la suite (jets de dés, édition à plusieurs, table de jeu…) :

- les nouveaux types de messages se gèrent dans `api/ws.py` ;
- les envois se font avec `manager.broadcast(canal, event)`.

Le gestionnaire actuel garde les connexions en mémoire, ce qui suffit avec un seul processus backend. Avec plusieurs workers, il faudra le remplacer par Redis pub/sub, sans changer son interface.

## Faire évoluer

| Je veux… | Je fais… |
|---|---|
| Modifier une règle (limites, coûts, compétences) | `backend/app/rules/data.py`, puis compléter `tests/test_rules.py` |
| Ajouter, renommer ou supprimer une compétence, un groupe ou un attribut | voir [docs/faire-evoluer-les-regles.md](docs/faire-evoluer-les-regles.md) |
| Ajouter un champ au personnage | `models.py` + `schemas.py`, puis `uv run alembic revision --autogenerate -m "..."` et `alembic upgrade head` |
| Ajouter une route | un `APIRouter` dans `app/api/`, branché dans `main.py` ; elle apparaît automatiquement dans `/docs` |
| Mettre à jour les types du frontend après un changement d'API | `cd backend && uv run python scripts/export_openapi.py ../frontend/openapi.json`, puis `cd frontend && npm run gen:api` |

Les types TypeScript (`frontend/src/api/schema.d.ts`) sont générés à partir de l'OpenAPI du backend. Si le backend change une route ou un champ, `npm run build` signale tout de suite les endroits du frontend à corriger.

## Rôles

Source : `refdoc/Roles.pdf`. Les décisions de transcription sont dans `refdoc/infos.md`, et les points à confirmer dans `refdoc/fix.md`.

| Fichier | Contenu |
|---|---|
| `app/rules/role_model.py` | `Role`, `Grant`, `Choice`, et `STATS` (effets numériques) |
| `app/rules/roles_catalog.py` | ★ le catalogue : 59 rôles et 13 troncs communs |
| `app/rules/roles.py` | Le calcul : ce que les rôles et les choix d'un personnage lui donnent |

Un rôle a deux listes de `Grant`, `primary` et `secondary` (`None` si le rôle ne peut pas être pris à ce rang). Il a aussi une valeur d'équilibrage (`value`, `secondary_value`) et une `description`. Un grant cible :
- une compétence ou un groupe : ce sont les PCR ;
- une connaissance : ajoutée aux connaissances libres ;
- une stat (Magie, mana, bottes, sorts, langues, dieux, codes, piété, animaux…) ;
- un choix du joueur.

Helpers du catalogue :
- `sk(3, "sabre")` : points fixes dans une compétence ;
- `kn(2, "Magique")` : points fixes dans une connaissance ;
- `st(45, "mana")` : effet numérique ;
- `one_of("arme", 3, "sabre", "epee")` : une compétence parmi une liste ;
- `pick("arme", 3, "combat_melee")` : une compétence d'un groupe ;
- `spread("melee", 2, "combat_melee")` : points répartis librement dans un groupe ;
- `kn_choice("connaissance", 4)` : connaissance à intitulé libre.

Les choix du joueur sont stockés dans `creation.role_choices["<rôle>/<id>"]`.

**Ce que donnent les rôles est un minimum**, appliqué à la création ou avec `PATCH ...?sync_roles=true` :
- les PCR sont remplacés par le calcul ;
- Magie et bottes valent exactement ce que donnent les rôles plus ce qui est acheté avec les PC restants ;
- les connaissances, le mana maximum et les ressources sont remontés au minimum, et ce que le joueur a ajouté au-dessus est conservé ;
- la validation signale tout ce qui descend sous un minimum.

**Ressources** (`RESOURCE_DEFS` dans `role_model.py`) :
- la plupart donnent accès à des choix, stockés dans `selections` : N sorts, langues, bottes, dieux, animaux… ;
- les codes sont une limite que la valeur totale des codes choisis doit atteindre ou dépasser ;
- la piété est un score plafonné à 10.

Les choix sont des intitulés libres en attendant les catalogues de sorts, langues, dieux, codes… Le moment venu, il suffira de remplacer les champs texte par des listes.

Sans `sync_roles`, un `PATCH` conserve les PCR enregistrés. `role_points_outdated` signale alors qu'ils ne correspondent plus au calcul.

**Reste à faire** : les « autres moments où on peut choisir » en dehors de la création, et les points listés dans `refdoc/fix.md`.

## Pistes pour la suite

- Équipement et marché international : seul le total des sous dépensés est suivi.
- Rooms : jets de dés, droits du MJ sur les fiches, mises à jour des fiches en direct.
- Comptes : limiter les tentatives de connexion, changer son mot de passe, gérer les comptes depuis l'interface admin.
- Export PDF de la fiche remplie.
