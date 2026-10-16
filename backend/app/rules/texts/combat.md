# Combat

## Dégâts et armure

Chaque attaque peut rencontrer une **armure**. Une armure protège contre un type de dégâts : l'armure naturelle et les armures portées contre les dégâts physiques, l'armure mentale contre les dégâts mentaux, l'armure pathologique contre les dégâts pathologiques.

Chaque arme a une **pénétration** : le nombre de dégâts qu'elle garantit contre une armure.

- **Sans armure**, la pénétration est ignorée : tous les dégâts passent.
- **Dégâts supérieurs à l'armure** : l'armure est réduite de la pénétration (sans descendre sous 0), puis retirée des dégâts.
- **Armure supérieure aux dégâts** : seuls les dégâts de la pénétration passent.

Les dégâts après armure ne sont jamais supérieurs aux dégâts avant armure.

### Exemples

Une armure de 6 :

- 10 dégâts, pénétration 2 : l'armure tombe à 4, **6 dégâts** passent ;
- 10 dégâts, pénétration 8 : l'armure tombe à 0, les **10 dégâts** passent ;
- 5 dégâts, pénétration 2 : l'armure arrête l'attaque, la pénétration passe : **2 dégâts** ;
- 1 dégât, pénétration 3 : la pénétration passe, mais pas plus que les dégâts : **1 dégât**.

Dans une room, le bouton **Dégâts** de la carte d'un personnage fait le calcul et retire le résultat du moniteur touché.
