/** Code d'invitation affiché en deux blocs (`ABCD-EFGH`), plus facile à dicter. */
export const formatInviteCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** L'app est ouverte par `localhost` : un lien construit sur cette adresse ne marche que sur cette machine. */
export const isLocalOnly = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

/** Lien à partager : l'ouvrir fait rejoindre la room (après connexion si besoin). */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}#/rejoindre/${code}`;
