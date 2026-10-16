import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRules } from "@/hooks/useRules";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { printPage } from "@/lib/print";
import { cn } from "@/lib/utils";

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h3 className="mb-1.5 flex items-end gap-2 border-b pb-0.5 font-heading text-sm font-semibold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

/** Case à remplir à la main (un nombre). */
const Box = ({ className }: { className?: string }) => (
  <span className={cn("inline-block h-5 w-8 rounded-sm border border-foreground/50 align-middle", className)} />
);

/** Libellé suivi d'un trait à remplir. */
const Field = ({ label, className }: { label: string; className?: string }) => (
  <span className="flex min-w-0 flex-1 items-end gap-1.5">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className={cn("inline-block h-5 flex-1 border-b border-foreground/50", className)} />
  </span>
);

/** Lignes vides pour écrire. */
const Lines = ({ n }: { n: number }) => (
  <div>{Array.from({ length: n }, (_, i) => <div key={i} className="h-6 border-b border-dashed border-foreground/40" />)}</div>
);

/** Valeur actuelle / maximum. */
const OutOf = ({ label }: { label: string }) => (
  <p className="flex items-center gap-1.5 py-px"><span className="flex-1">{label}</span><Box /><span>/</span><Box /></p>
);

/**
 * Fiche vierge à imprimer pour créer un personnage sur papier, sur le modèle de refdoc/Fiche PJ vide.pdf.
 * Générée depuis les règles (GET /api/rules) : attributs, groupes de compétences et moniteurs restent à jour.
 */
export default function BlankSheet({ onClose }: { onClose?: () => void }) {
  const rules = useRules();

  useEffect(() => {
    document.title = "Fiche vierge — NewMannheim";
    return () => { document.title = "NewMannheim"; };
  }, []);

  if (!rules) return <div className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  const skillRow = (key: string, label: string, pool = false) => (
    <tr key={key} className={cn(pool && "italic")}>
      <td className="py-px pr-2">{label}</td>
      <td className="w-10 text-center"><Box /></td>
      <td className="w-10 text-center">{!pool && <Box />}</td>
      <td className="w-10 text-center">{!pool && <Box className="border-foreground" />}</td>
    </tr>
  );
  const conditionMonitors = Object.entries(rules.monitors).filter(([k]) => k !== "mana");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" aria-label="Retour" onClick={onClose}><ArrowLeft /></Button>
        <h1 className="flex-1 truncate text-xl font-semibold">Fiche vierge</h1>
        <Button onClick={printPage} title="Imprimer, ou choisir « Enregistrer en PDF »">
          <Printer data-icon="inline-start" />Imprimer / PDF
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 text-sm print:rounded-none print:border-0 print:p-0">
        {/* Identité */}
        <div className="mb-5 grid grid-cols-1 gap-x-8 gap-y-2 border-b pb-3 sm:grid-cols-[2fr_1fr_auto] print:grid-cols-[2fr_1fr_auto]">
          <Field label="Nom" className="h-7" />
          <Field label="Espèce" />
          <Field label="Âge" className="w-12 flex-none" />
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1 sm:col-span-3 print:col-span-3">
            <span className="text-muted-foreground">Priorités</span>
            {["Rôles", "Attributs", "Compétences", "Sous"].map((label) => (
              <span key={label} className="flex items-center gap-1"><Box /><span className="text-xs text-muted-foreground">{label}</span></span>
            ))}
          </div>
        </div>

        <div className="columns-1 gap-8 md:columns-2 print:columns-2">
          <Block title="Attributs">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[...rules.attributes.map((a) => ATTRIBUTE_LABELS[a]), "Magie"].map((label) => (
                <div key={label} className="flex items-center justify-between"><dt>{label}</dt><dd><Box /></dd></div>
              ))}
            </dl>
          </Block>

          <Block title="Rôles">
            <div className="flex flex-col gap-1">
              <Field label="Principaux" />
              <Field label="Secondaires" />
            </div>
          </Block>

          {conditionMonitors.length > 0 && (
            <Block title="Moniteurs de condition">
              {conditionMonitors.map(([k, m]) => <OutOf key={k} label={m.label} />)}
            </Block>
          )}

          {Object.entries(rules.skill_groups).map(([g, group]) => {
            const pools = Object.entries(rules.skill_pools).filter(([, pool]) => pool.group === g);
            const poolRows = (which: "before" | "after") => pools
              .filter(([name]) => (name === "mana") === (which === "after"))
              .map(([name, pool]) => skillRow(`pool-${name}`, pool.label, true));
            return (
              <Block key={g} title={<><span className="flex-1">{group.label}</span><span className="text-xs font-normal normal-case">niv.</span><Box className="h-4" /></>}>
                <table className="w-full">
                  <thead className="text-[10px] text-muted-foreground">
                    <tr><th /><th className="font-normal">PCP</th><th className="font-normal">PCR</th><th className="font-normal">PCT</th></tr>
                  </thead>
                  <tbody>
                    {poolRows("before")}
                    {Object.entries(group.skills).map(([s, label]) => skillRow(s, label))}
                    {poolRows("after")}
                  </tbody>
                </table>
                {g === "intellect" && (
                  <div className="mt-1 border-t pt-1">
                    <span className="text-muted-foreground">Domaines de connaissance (et niveau)</span>
                    <Lines n={3} />
                  </div>
                )}
                {g === "magie" && <div className="mt-1 border-t pt-1 font-medium"><OutOf label="Mana" /></div>}
              </Block>
            );
          })}

          <Block title="Langues"><Lines n={2} /></Block>
          <Block title="Animaux totems"><Lines n={1} /></Block>

          <Block title="Religion">
            <div className="flex flex-col gap-1">
              {[1, 2].map((i) => (
                <p key={i} className="flex items-end gap-2">
                  <Field label="Dieu" />
                  <span className="text-muted-foreground">Piété</span><Box /><span>/ 10</span>
                </p>
              ))}
              <Field label="Pouvoirs" />
              <Field label="Codes" />
            </div>
          </Block>

          <Block title="Relations"><Lines n={3} /></Block>
          <Block title="Compagnons"><Lines n={2} /></Block>
          <Block title="Traits"><Lines n={3} /></Block>

          <Block title="Inventaire">
            <div className="flex flex-col gap-1">
              <p className="flex items-end gap-4">
                <span className="flex items-center gap-1.5"><span className="text-muted-foreground">Sous</span><Box className="w-14" /></span>
                <span className="flex items-center gap-1.5"><span className="text-muted-foreground">Poids</span><Box className="w-12" />kg</span>
              </p>
              <Field label="Arme active" />
              <Field label="Armure active" />
              <span className="text-muted-foreground">Besace</span>
              <Lines n={3} />
            </div>
          </Block>

          <Block title={<><span className="flex-1">Bottes</span><Box className="h-4" /></>}><Lines n={2} /></Block>
          <Block title={<><span className="flex-1">Sorts</span><Box className="h-4" /></>}><Lines n={3} /></Block>
          <Block title="Notes"><Lines n={4} /></Block>
        </div>
      </div>
    </div>
  );
}
