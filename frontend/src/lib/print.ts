import { appBridge } from "./appBridge";

/**
 * Imprime la page (ou l'enregistre en PDF). Dans l'app Android, la WebView ignore `window.print()` : la boîte
 * d'impression est celle d'Android, ouverte par l'app ; un APK antérieur à ce pont n'imprime pas.
 */
export function printPage() {
  const app = appBridge();
  if (app?.print) app.print(document.title);
  else window.print();
}
