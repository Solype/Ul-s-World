import { ArrowLeft, FileJson, Printer } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Attribute, type Character, type ValidationReport } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRules } from "@/hooks/useRules";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { KIND_LABELS } from "./CharacterEditor";

const COMPANIONS = ["montures", "oiseaux", "fauves", "dragons", "creatures_magiques", "familiers", "chiens"];

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-5 break-inside-avoid", className)}>
      <h3 className="mb-1.5 border-b pb-0.5 font-heading text-sm font-semibold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

const Empty = () => <span className="text-muted-foreground">—</span>;

/**
 * Fiche de personnage à lire ou imprimer (Imprimer → PDF), sur le modèle de refdoc/Fiche PJ vide.pdf.
 * Elle montre la version enregistrée du personnage.
 */
export default function CharacterSheet({ id, onClose, embedded = false }: {
  id: number; onClose?: () => void;
  /** Affichée dans une fenêtre par-dessus une autre page (room) : pas de Retour, ni de titre d'onglet. */
  embedded?: boolean;
}) {
  const rules = useRules();
  const [c, setC] = useState<Character | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.GET("/api/characters/{character_id}", { params: { path: { character_id: id } } })
      .then(({ data }) => (data ? setC(data) : setMissing(true)));
    api.GET("/api/characters/{character_id}/validation", { params: { path: { character_id: id } } })
      .then(({ data }) => setReport(data ?? null));
  }, [id]);

  useEffect(() => {
    if (!c || embedded) return;
    document.title = `${c.name} — NewMannheim`;
    return () => { document.title = "NewMannheim"; };
  }, [c, embedded]);

  if (missing) return <p className="text-muted-foreground">Personnage introuvable.</p>;
  if (!rules || !c) return <div className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  const isPC = (c.kind ?? "pj") === "pj";
  const rulesMode = c.creation_mode !== "free";
  const creation = c.creation ?? {};
  const p = creation.priorities ?? {};
  const selections = c.selections ?? {};
  const names = (key: string) => (selections[key] ?? []).map((i) => i.name);
  const list = (items: string[]) => (items.length ? items.join(", ") : <Empty />);
  const roleLabel = (k: string) => rules.roles[k]?.label ?? k;
  const skillGroupOf = (g: string) => c.skill_groups?.[g] ?? {};
  // Monstre : seulement ce que ses caractéristiques lui donnent (ou ce qui a des points), et pas de blocs vides.
  const isMonster = c.kind === "monstre";
  const access = isMonster ? report?.monster_access ?? null : null;
  const hasSkill = (s: string) => (c.skills?.[s]?.pcp ?? 0) + (c.skills?.[s]?.pcr ?? 0) > 0;
  const skillShown = (s: string) => !access || access.skills.includes(s) || hasSkill(s);
  const groupShown = (g: string, skills: string[]) =>
    !access || access.skill_groups.includes(g) || (c.skill_groups?.[g]?.pcp ?? 0) > 0 || skills.some(hasSkill);
  const showBlock = (filled: boolean) => !isMonster || filled;
  const monsterTraits = (c.monster?.traits ?? []).map((t) => rules.monster_traits[t]?.label ?? t);
  const moneyLeft = rulesMode && report?.money_available != null ? report.money_available - (creation.money_spent ?? 0) : null;

  const skillRow = (key: string, label: string, pcp: number, pcr: number, pool = false) => (
    <tr key={key} className={cn(pcp + pcr === 0 && "text-muted-foreground", pool && "italic")}>
      <td className="py-px pr-2">{label}</td>
      {isPC ? (
        <>
          <td className="w-8 text-center tabular-nums">{pcp || ""}</td>
          <td className="w-8 text-center tabular-nums">{pool ? "" : pcr || ""}</td>
          <td className="w-8 text-center font-semibold tabular-nums">{pool ? "" : pcp + pcr || ""}</td>
        </>
      ) : (
        <td className="w-10 text-center tabular-nums">{pcp || ""}</td>
      )}
    </tr>
  );

  const traitText = (t: NonNullable<Character["traits"]>[number]) => {
    const def = rules.traits[t.key];
    if (!def) return t.key;
    const variant = def.variants.length > 1 ? def.variants.find((v) => v.id === t.variant)?.label : null;
    const choiceLabel = (o: string) =>
      def.choice?.labels?.[o] ?? ATTRIBUTE_LABELS[o as Attribute] ?? rules.skill_groups[o]?.label
      ?? Object.values(rules.skill_groups).find((g) => o in g.skills)?.skills[o] ?? o;
    const details = [variant, ...(t.choices ?? []).map(choiceLabel), t.note].filter(Boolean);
    return `${def.label}${details.length ? ` (${details.join(", ")})` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex flex-wrap items-center gap-2 print:hidden", embedded && "pr-8")}>
        {!embedded && <Button variant="ghost" size="icon" aria-label="Retour" onClick={onClose}><ArrowLeft /></Button>}
        <h1 className="flex-1 truncate text-xl font-semibold">Fiche de {c.name}</h1>
        <Button variant="outline" asChild>
          <a href={`/api/characters/${id}/export`} download><FileJson data-icon="inline-start" />JSON</a>
        </Button>
        {embedded ? (
          // Imprimer depuis une fenêtre superposée imprimerait la page derrière : on ouvre la fiche seule.
          <Button asChild><a href={`#/fiche/${id}`} target="_blank" rel="noopener"><Printer data-icon="inline-start" />Imprimer</a></Button>
        ) : (
          <Button onClick={() => window.print()}><Printer data-icon="inline-start" />Imprimer</Button>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 text-sm print:rounded-none print:border-0 print:p-0">
        {/* Identité */}
        <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-1 border-b pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{KIND_LABELS[c.kind ?? "pj"]}{rulesMode ? "" : " · création libre"}</p>
            <h2 className="truncate font-heading text-2xl font-semibold">{c.name}</h2>
          </div>
          <p><span className="text-muted-foreground">Espèce</span> <span className="capitalize">{c.species || "—"}</span></p>
          <p><span className="text-muted-foreground">Âge</span> {c.age ?? "—"}</p>
          {isMonster && c.monster && (
            <p><span className="text-muted-foreground">Caractéristiques</span> {monsterTraits.length ? monsterTraits.join(", ") : "entité de base"}</p>
          )}
          {rulesMode && (
            <p><span className="text-muted-foreground">Priorités</span>{" "}
              <span className="font-semibold tracking-widest">{[p.roles, p.attributes, p.skill_groups, p.money].map((x) => x ?? "_").join("|")}</span></p>
          )}
        </div>

        <div className="columns-1 gap-8 md:columns-2 print:columns-2">
          <Block title="Attributs">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {rules.attributes.filter((a) => !access || access.attributes.includes(a) || (c.attributes?.[a] ?? 0) > 0).map((a) => (
                <div key={a} className="flex justify-between"><dt>{ATTRIBUTE_LABELS[a]}</dt><dd className="font-semibold tabular-nums">{c.attributes?.[a] ?? 0}</dd></div>
              ))}
              {(!access || access.magic || (c.magic ?? 0) > 0) && (
                <div className="flex justify-between"><dt>Magie</dt><dd className="font-semibold tabular-nums">{c.magic ?? 0}</dd></div>
              )}
              {isMonster && (
                <div className="flex justify-between"><dt>Armure naturelle</dt><dd className="font-semibold tabular-nums">{c.monster?.natural_armor ?? 0}</dd></div>
              )}
            </dl>
          </Block>

          {showBlock((c.roles?.primary ?? []).length + (c.roles?.secondary ?? []).length > 0) && <Block title="Rôles">
            <p><span className="text-muted-foreground">Principaux :</span> {list((c.roles?.primary ?? []).map(roleLabel))}</p>
            <p><span className="text-muted-foreground">Secondaires :</span> {list((c.roles?.secondary ?? []).map(roleLabel))}</p>
          </Block>}

          {Object.entries(rules.skill_groups).filter(([g, group]) => groupShown(g, Object.keys(group.skills))).map(([g, group]) => {
            const level = skillGroupOf(g);
            const pools = Object.entries(rules.skill_pools).filter(([, pool]) => pool.group === g);
            const poolRows = (which: "before" | "after") => pools
              .filter(([name]) => (name === "mana") === (which === "after"))
              .filter(([name]) => !access || access.pools.includes(name) || (c.pools?.[name] ?? 0) > 0)
              .map(([name, pool]) => skillRow(`pool-${name}`, pool.label, c.pools?.[name] ?? 0, 0, true));
            return (
              <Block key={g} title={`${group.label} · niv. ${level.pcp ?? 0}${level.pcr ? ` (+${level.pcr})` : ""}`}>
                <table className="w-full">
                  {isPC && (
                    <thead className="text-[10px] text-muted-foreground">
                      <tr><th /><th className="font-normal">PCP</th><th className="font-normal">PCR</th><th className="font-normal">PCT</th></tr>
                    </thead>
                  )}
                  <tbody>
                    {poolRows("before")}
                    {Object.entries(group.skills).filter(([s]) => skillShown(s)).map(([s, label]) =>
                      skillRow(s, label, c.skills?.[s]?.pcp ?? 0, c.skills?.[s]?.pcr ?? 0))}
                    {poolRows("after")}
                  </tbody>
                </table>
                {g === "intellect" && Object.keys(c.knowledges ?? {}).length > 0 && (
                  <ul className="mt-1 border-t pt-1">
                    {Object.entries(c.knowledges ?? {}).map(([k, v]) => (
                      <li key={k} className="flex justify-between"><span>Connaissance {k}</span><span className="tabular-nums">{v}</span></li>
                    ))}
                  </ul>
                )}
                {g === "magie" && (!access || access.magic || (c.mana?.max ?? 0) > 0) && (
                  <p className="mt-1 border-t pt-1 font-medium">Mana {c.mana?.current ?? 0} / {c.mana?.max ?? 0}</p>
                )}
              </Block>
            );
          })}

          {showBlock(names("langues").length > 0) && <Block title="Langues"><p>{list(names("langues"))}</p></Block>}
          {showBlock(names("animaux_totems").length > 0) && <Block title="Animaux totems"><p>{list(names("animaux_totems"))}</p></Block>}

          {showBlock(names("dieux").length + (selections.codes ?? []).length + (c.resources?.piete ?? 0) > 0) && <Block title="Religion">
            <p><span className="text-muted-foreground">Dieux :</span> {list(names("dieux"))}</p>
            <p><span className="text-muted-foreground">Piété :</span> {c.resources?.piete ?? 0}/10</p>
            {(selections.codes ?? []).length > 0 && (
              <p><span className="text-muted-foreground">Codes :</span> {(selections.codes ?? []).map((i) => `${i.name} (${i.value ?? 0})`).join(", ")}</p>
            )}
          </Block>}

          {showBlock((c.relations ?? []).length > 0) && <Block title="Relations">
            {(c.relations ?? []).length ? <ul className="list-disc pl-4">{(c.relations ?? []).map((r) => <li key={r}>{r}</li>)}</ul> : <Empty />}
          </Block>}

          {showBlock(COMPANIONS.some((k) => names(k).length)) && <Block title="Compagnons">
            {COMPANIONS.some((k) => names(k).length) ? COMPANIONS.filter((k) => names(k).length).map((k) => (
              <p key={k}><span className="text-muted-foreground">{rules.resource_defs[k]?.label ?? k} :</span> {names(k).join(", ")}</p>
            )) : <Empty />}
          </Block>}

          {showBlock((c.traits ?? []).length > 0) && <Block title="Traits">
            {(c.traits ?? []).length ? <ul className="list-disc pl-4">{(c.traits ?? []).map((t, i) => <li key={i}>{traitText(t)}</li>)}</ul> : <Empty />}
          </Block>}

          <Block title="Inventaire">
            <p><span className="text-muted-foreground">Sous :</span> {moneyLeft ?? "—"}
              {moneyLeft !== null && <span className="text-muted-foreground"> (budget {report?.money_available}, dépensés {creation.money_spent ?? 0})</span>}</p>
            {(c.equipment ?? []).length > 0 && <ul className="list-disc pl-4">{(c.equipment ?? []).map((e) => <li key={e}>{e}</li>)}</ul>}
          </Block>

          {showBlock((c.bottes ?? 0) + names("bottes").length > 0) && <Block title={`Bottes (${c.bottes ?? 0})`}><p>{list(names("bottes"))}</p></Block>}
          {showBlock((c.resources?.sorts ?? 0) + names("sorts").length > 0) && <Block title={`Sorts (${c.resources?.sorts ?? 0})`}><p>{list(names("sorts"))}</p></Block>}

          {c.notes && (
            <Block title="Notes"><p className="whitespace-pre-wrap">{c.notes}</p></Block>
          )}
        </div>
      </div>
    </div>
  );
}
