import type { GodResourceDef } from "@/api/client";

/** Ressources propres à un dieu (rien si le dieu n'en a pas). */
export default function GodResources({ resources }: { resources: GodResourceDef[] }) {
  if (resources.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">Ressources propres</span>
      {resources.map((r) => (
        <p key={r.name} className="text-sm">
          <span className="font-medium">{r.name}</span>{r.description && <> : {r.description}</>}
        </p>
      ))}
    </div>
  );
}
