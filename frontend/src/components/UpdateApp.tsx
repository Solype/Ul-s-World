import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { appBridge } from "@/lib/appBridge";

/** Version de l'APK compilé, écrite par android/build.sh et servie par nginx. */
const VERSION_URL = "/newmannheim-version.json";

/** Version de l'APK du serveur, ou null (pas d'APK, ou un serveur de dev qui répond par la page de l'app). */
async function serverVersion(): Promise<number | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-cache" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const { versionCode } = await res.json();
    return typeof versionCode === "number" ? versionCode : null;
  } catch {
    return null;
  }
}

/**
 * Bandeau « Mettre à jour » dans l'app Android, quand le serveur a un APK plus récent que celui installé.
 * Un APK compilé avant ce bouton ne sait pas se mettre à jour : il ne le montre pas.
 */
export default function UpdateApp() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const app = appBridge();
    if (!app?.versionCode || !app.update) return;
    const installed = app.versionCode();
    serverVersion().then((latest) => setShow(latest !== null && latest > installed));
  }, []);
  if (!show) return null;
  return (
    <div className="flex items-center gap-3 border-t bg-primary/10 px-4 py-1.5 text-sm">
      <span className="flex-1">Nouvelle version de l'app disponible.</span>
      <Button size="sm" onClick={() => appBridge()?.update?.()}>
        <RefreshCw data-icon="inline-start" />Mettre à jour
      </Button>
    </div>
  );
}
