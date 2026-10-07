# Précisions sur les règles

Décisions de conception qui ne figurent pas (ou pas clairement) dans les PDF de `refdoc/`.

## Mana

- Le mana est une **ressource commune à la magie et à la religion** : sorts et pouvoirs religieux puisent dans la même réserve.
- Il se note **mana actuel / mana maximum** (`Mana ___/___` sur la fiche).
- Création : « le mana est obtenu par 15 par point de compétence utilisé » (p.6). Ce sont les PCP du groupe **Compétence magique** : sur la fiche, la ligne « Mana » suit ce groupe, sans colonnes PCR / PCT (« la statistique mana ne possède pas de colonne séparée », p.5). Chaque PCP mis dans « Mana » compte dans le « 2 × niveau » du groupe et donne +15 au mana max.
- Mana max à la création = mana donné par les rôles + 15 × PCP mis dans « Mana ».

## Connaissances

- Les connaissances ne forment **pas une liste fermée** définie par le jeu : ce sont les joueurs qui les définissent.
- Un joueur peut prendre des points de connaissance dans n'importe quel domaine, même farfelu (« Généalogie des rois nains », « Recettes de ragoût de kobold »…).
- Elles se manipulent comme des compétences (un niveau par connaissance), mais ne font pas partie du catalogue fixe de compétences.
- Historique : à la conception des règles, il y avait un nombre limité de connaissances, gérées comme des compétences ordinaires. Après discussion, la liste a été ouverte.
- Création : « les connaissances sont obtenues par 2 par point de compétence utilisé » (p.6). Ce sont les PCP du groupe **Intellect** : sur la fiche, « Connaissances » ouvre ce groupe. Chaque PCP mis dans « Connaissances » compte dans le « 2 × niveau » du groupe et donne 2 points de connaissance, à répartir librement entre les connaissances du joueur, en plus de celles données par les rôles.

## Rôles

- Le **nombre entre parenthèses** après le nom d'un rôle, par exemple « Bretteur (19) » ou « Magicien (20 - 11) », est une estimation de sa valeur en points arbitraires. Elle sert à l'équilibrage, n'est pas vérifiée, et la seconde valeur est celle du rôle pris en secondaire.
- Les **connaissances données par un rôle** (« +2 connaissance magique ») s'ajoutent aux connaissances libres du joueur.
- Les **effets numériques des rôles** (Magie, mana, bottes, sorts, langues, dieux, codes, piété, animaux…) sont cumulés, et ce cumul est un **minimum**. Le joueur ne peut pas descendre en dessous. C'est ce qui l'empêche de retirer des éléments donnés par un rôle pour les mettre ailleurs lors de la répartition.
- **Combat à mains nues** = la compétence *Main nue*.
- **Princesse** (rôle exceptionnel) : ses effets ne sont qu'une description, sans calcul automatique.
- **« +N en compétences de X (au choix) »** : N points à répartir librement entre les compétences du groupe X, éventuellement tous dans la même. « +N dans 1 catégorie … au choix » : N points dans une seule compétence.
- **« P »** (rôles religieux, « 3 en P ») : la **Piété**.
- **Connaissance « guerre » = connaissance « guerrière »** (coquille du document).

## Langues et animaux totems (Langues.pdf)

- Les **langues** et les **animaux totems** se choisissent dans un catalogue fermé. Les effets des langues sont descriptifs.
- L'**Exorciste** impose la langue **runique**.
- Les **bonus des animaux totems sont des PCR** (comme ceux des rôles), y compris les +20 de mana du **Cerf**. Le **Serpent** (+2 connaissances) donne 2 points de connaissance libres en plus.
- Restent descriptifs : la **Chouette** (vision nocturne), le **Loup** et le **Ratel** (bonus en combat sous condition), le **Crocodile** (effet en cours de discussion).
- Les « x » à côté de certains animaux dans le document concernent l'amélioration ; ils ne sont pas repris.

## Traits de personnage (Traits de personnage.pdf)

- Un trait **bonus coûte des PC**, un **malus en rapporte** : les PC de base (25) sont ajustés en conséquence. Le nombre de traits et de PC gagnés par les malus n'est **pas limité** (les traits sont validés avec le MJ).
- **Variantes** : un trait à plusieurs coûts se prend dans une variante (Bénédiction de Terlema 1/2/3 PC → +1/3/5 points d'attribut ; Estropié pied/main +1, jambe/bras +2 ; Immunité naturelle -1 ou -2 ; Appelé par l'outre-monde -2, ou -3 avec les pouvoirs).
- **Estropié** et **Immunité naturelle** peuvent être pris plusieurs fois (deux mains, plusieurs toxines) ; les autres traits une seule fois.
- **Incompétent ! en combat** couvre les **trois groupes** de combat (à distance, artillerie, mêlée) : ni PCP ni PCR dans leurs compétences, les points donnés par les rôles sont ignorés.
- **Sociopathe de haut niveau** : **désactivé** (commenté dans `backend/app/rules/traits.py`) tant que le trait n'est pas clarifié, voir fix.md.
- **Asocial** : **aucun point** dans les compétences du groupe Sociale, pas même ceux des rôles (ils sont ignorés et mis à 0), **sauf Dressage** ; l'attribut Social est au minimum de l'espèce. **Incompatible avec Incompétent ! en Sociale**, qui met déjà ces compétences à 0.
- **Ordre des modifications de limites d'attributs** : Hybride (limites moyennées) → Attribut exceptionnel (+3 au maximum) → Estropié (-3) → Aptitude (maximum = limite surhumaine) → Asocial (Social au minimum).
- **Attribut exceptionnel** : seul le maximum augmente (pas le minimum ni la limite surhumaine).
- **Hybride** : chaque espèce totalise 53 aux maximums ; le joueur choisit quels attributs à demi-valeur sont arrondis au-dessus (la moitié d'entre eux), minimum = maximum - 5, surhumain = maximum + 3.
- **Demi-démon / demi-vengeur** : **+100 au mana max**, en plus du mana des rôles et des PCP de la réserve Mana. « Tout autre gain en mana est divisé par deux » désigne la **régénération** du mana (descriptif). Les autres effets sont descriptifs.
- **Incompétent ! en Compétence magique avec une échelle de piété** : avoir de la Piété (> 0) laisse l'Absorption accessible.
- **Hyperhidrose manafique** : « posséder une réserve de mana » = mana max supérieur à 0.
- **Hostilité des esprits** : les animaux totems peuvent être choisis, mais leurs bonus ne sont pas comptés.
- **Sans le sou** : les sous disponibles à la création tombent à 0, quelle que soit la priorité.
