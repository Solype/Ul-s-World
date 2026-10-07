/** Code d'invitation affiché en deux blocs (`ABCD-EFGH`), plus facile à dicter. */
export const formatInviteCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Lien à partager : l'ouvrir fait rejoindre la room (après connexion si besoin). */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}#/rejoindre/${code}`;
