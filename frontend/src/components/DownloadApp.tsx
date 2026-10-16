import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** APK servi par nginx (android/dist, voir docker-compose.yml) ; absent tant qu'il n'a pas été compilé. */
const APK_URL = "/newmannheim.apk";

/** Navigateur d'un téléphone Android, hors de l'app elle-même (sa WebView ajoute « NewMannheimApp » au user-agent). */
const ANDROID_BROWSER = /Android/i.test(navigator.userAgent) && !/NewMannheimApp/.test(navigator.userAgent);

// Une seule vérification par chargement de page, partagée par tous les boutons.
let available: Promise<boolean> | null = null;
const apkAvailable = () => (available ??= fetch(APK_URL, { method: "HEAD" })
  // Sans APK, un serveur de dev peut répondre par la page de l'app : ce n'est pas un APK.
  .then((res) => res.ok && !(res.headers.get("content-type") ?? "").startsWith("text/html"))
  .catch(() => false));

/**
 * Bouton « Télécharger » l'app Android. N'apparaît que dans le navigateur d'un téléphone Android, et seulement
 * si un APK a été compilé (`docker compose run --rm apk`).
 */
export default function DownloadApp({ wide, className }: { wide?: boolean; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (ANDROID_BROWSER) apkAvailable().then(setShow);
  }, []);
  if (!show) return null;
  return (
    <Button asChild variant={wide ? "outline" : "ghost"} size="sm" className={cn(wide && "w-full", className)}>
      <a href={APK_URL} download title="Installer l'app Android">
        <Download data-icon="inline-start" />{wide ? "Télécharger l'app Android" : "Télécharger"}
      </a>
    </Button>
  );
}
