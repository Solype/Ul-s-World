import { toast } from "sonner";
import { api, type Character } from "@/api/client";
import { appBridge } from "./appBridge";

/** Nom du fichier proposé par le serveur (`filename*` en UTF-8 de préférence). */
function filenameOf(disposition: string | null, fallback: string) {
  const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/**
 * Télécharge le fichier JSON d'export d'un personnage (version enregistrée). Dans l'app Android, la WebView
 * ne télécharge pas les liens : l'app demande où enregistrer le fichier.
 */
export async function exportCharacter(id: number) {
  const res = await fetch(`/api/characters/${id}/export`);
  if (!res.ok) {
    toast.error("Export impossible");
    return;
  }
  const name = filenameOf(res.headers.get("content-disposition"), "personnage.json");
  const content = await res.text();
  const app = appBridge();
  if (app?.saveFile) {
    app.saveFile(name, "application/json", content);
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Message d'une erreur 422 : texte du serveur, ou premier champ refusé. */
function importError(detail: unknown) {
  if (typeof detail === "string") return detail;
  const first = Array.isArray(detail) ? detail[0] : null;
  if (first?.loc?.[1] === "format") return "Ce n'est pas un fichier de personnage NewMannheim";
  if (first) return `Champ refusé : ${first.loc.slice(1).join(" › ")} (${first.msg})`;
  return "Import impossible";
}

/** Recrée un personnage depuis son fichier d'export (n'importe quelle version) ; null si refusé (message affiché). */
export async function importCharacter(file: File): Promise<Character | null> {
  let body: unknown;
  try {
    body = JSON.parse(await file.text());
  } catch {
    toast.error("Fichier illisible : ce n'est pas du JSON");
    return null;
  }
  // Le contenu est vérifié par le serveur ; un fichier mal formé revient en 422.
  const { data, error } = await api.POST("/api/characters/import", { body: body as never });
  if (!data) {
    toast.error(importError((error as { detail?: unknown } | undefined)?.detail));
    return null;
  }
  toast.success(`${data.name} importé`);
  return data;
}
