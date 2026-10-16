/** Pont exposé par l'app Android (MainActivity) : sa WebView ignore `window.print()`. */
type AppBridge = { print(title: string): void };

/**
 * Imprime la page (ou l'enregistre en PDF). Dans l'app Android, la boîte d'impression est celle d'Android,
 * ouverte par l'app ; un APK antérieur à ce pont n'imprime pas.
 */
export function printPage() {
  const app = (window as { NewMannheimApp?: AppBridge }).NewMannheimApp;
  if (app) app.print(document.title);
  else window.print();
}
