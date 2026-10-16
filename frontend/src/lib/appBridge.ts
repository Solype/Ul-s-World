/**
 * Pont exposé par l'app Android (MainActivity, `NewMannheimApp`) pour ce que sa WebView ne sait pas faire seule.
 * Absent dans un navigateur, et dans un APK compilé avant l'ajout de la méthode.
 */
type AppBridge = {
  /** Ouvre l'impression d'Android (ou l'enregistrement en PDF) pour la page affichée. */
  print?(title: string): void;
  /** Demande où enregistrer le fichier, puis l'écrit. */
  saveFile?(name: string, mime: string, content: string): void;
  /** Version de l'app installée (`versionCode`, voir android/build.sh). */
  versionCode?(): number;
  /** Télécharge l'APK du serveur et l'installe par-dessus l'app (Android demande confirmation). */
  update?(): void;
};

export const appBridge = (): AppBridge | null => (window as { NewMannheimApp?: AppBridge }).NewMannheimApp ?? null;
