import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Attribute, Rules } from "@/api/client";
import SpellEffects from "@/components/SpellEffects";
import { Badge } from "@/components/ui/badge";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { cumulate, describeGrant, type GrantLine } from "@/lib/roleGrants";

/**
 * Pages de règles à lire, construites à partir de `GET /api/rules` :
 * - le texte retranscrit (Création de personnage), découpé en sections à chaque « ## » ;
 * - les catalogues (compétences, rôles, traits, langues, animaux totems), toujours à jour avec l'appli.
 * Chaque section a un `text` brut, utilisé par la recherche.
 */
export type RuleSection = {
  id: string;
  title: string;
  /** Intertitre au-dessus de la section (catégorie de rôle, Bonus / Malus...). */
  group?: string;
  /** Texte brut, pour la recherche. */
  text: string;
  content: ReactNode;
};

export type RulePage = { id: string; title: string; sections: RuleSection[] };

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Tableaux construits à partir des données (marqueurs <!-- data:xxx --> du texte) ---

function speciesTable(rules: Rules) {
  const rows = Object.entries(rules.species_limits);
  const text = rows
    .map(([s, l]) => `${cap(s)} ${rules.attributes.map((a) => `${ATTRIBUTE_LABELS[a]} ${l[a].min}-${l[a].max}-${l[a].superhuman}`).join(" ")}`)
    .join(" ");
  const node = (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr><th>Espèce</th>{rules.attributes.map((a) => <th key={a}>{ATTRIBUTE_LABELS[a]}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([s, l]) => (
            <tr key={s}>
              <td className="font-medium">{cap(s)}</td>
              {rules.attributes.map((a: Attribute) => <td key={a}>{l[a].min}-{l[a].max}-{l[a].superhuman}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return { node, text };
}

function priorityTable(rules: Rules) {
  const rows = Object.entries(rules.priorities);
  const combos = (row: (typeof rows)[number][1]) => row.roles.map((r) => `${r.primary}P et ${r.secondary}S`).join(" ou ");
  const text = rows
    .map(([p, r]) => `${p} ${r.cost} PC rôles ${combos(r)} attributs ${r.attributes} groupes ${r.skill_groups} sous ${r.money}`)
    .join(" ");
  const node = (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr><th>Priorité</th><th>Valeur en PC</th><th>Rôles*</th><th>Points d'attributs</th><th>Groupes de compétences</th><th>Sous</th></tr>
        </thead>
        <tbody>
          {rows.map(([p, r]) => (
            <tr key={p}>
              <td className="font-semibold">{p}</td><td>{r.cost}</td><td>{combos(r)}</td>
              <td>{r.attributes}</td><td>{r.skill_groups}</td><td>{r.money}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">* P : rôle principal, S : rôle secondaire. « ou » : un des deux duos au choix.</p>
    </div>
  );
  return { node, text };
}

const DATA_BLOCKS: Record<string, (rules: Rules) => { node: ReactNode; text: string }> = {
  especes: speciesTable,
  priorites: priorityTable,
};

const MARKER = /^<!-- data:([a-z]+) -->$/m;

function stripMarkdown(md: string) {
  return md.replace(/^#+\s*/gm, "").replace(/^>\s*/gm, "").replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "").replace(/[*_`|]/g, "");
}

/** Markdown du texte des règles, avec les tableaux de données à la place des marqueurs. */
function markdownSection(rules: Rules, md: string): { content: ReactNode; text: string } {
  const parts = md.split(MARKER);
  const nodes: ReactNode[] = [];
  const texts: string[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const block = DATA_BLOCKS[part]?.(rules);
      if (block) {
        nodes.push(<div key={i}>{block.node}</div>);
        texts.push(block.text);
      }
    } else if (part.trim()) {
      nodes.push(<ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>);
      texts.push(stripMarkdown(part));
    }
  });
  return { content: <div className="rules-prose">{nodes}</div>, text: texts.join(" ") };
}

function textPages(rules: Rules): RulePage[] {
  return rules.texts.map((t) => {
    const chunks = t.markdown.split(/^## /m);
    const sections: RuleSection[] = [];
    chunks.forEach((chunk, i) => {
      if (!chunk.trim()) return;
      const [first, ...rest] = chunk.split("\n");
      // Le texte avant le premier « ## » sert d'introduction.
      const title = i === 0 ? "Introduction" : first.trim();
      const body = i === 0 ? chunk : rest.join("\n");
      const { content, text } = markdownSection(rules, body);
      sections.push({ id: slugify(title), title, text, content });
    });
    return { id: t.id, title: t.title, sections };
  });
}

// --- Pages construites à partir des catalogues ---

function GrantList({ lines }: { lines: GrantLine[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {lines.map((l, i) => (
        <li key={i}>
          <span className="font-semibold text-primary tabular-nums">+{l.points}</span> {l.label}
          {l.note && <span className="text-muted-foreground"> {l.note}</span>}
        </li>
      ))}
    </ul>
  );
}

const linesText = (lines: GrantLine[]) => lines.map((l) => `+${l.points} ${l.label} ${l.note ?? ""}`).join(" ");

function skillsPage(rules: Rules): RulePage {
  const sections: RuleSection[] = Object.entries(rules.skill_groups).map(([g, group]) => {
    const pools = Object.values(rules.skill_pools).filter((p) => p.group === g);
    const skills = Object.values(group.skills);
    return {
      id: slugify(g),
      title: group.label,
      text: `${skills.join(" ")} ${pools.map((p) => `${p.label} ${p.per_point} par PCP`).join(" ")}`,
      content: (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-1.5">{skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
          {pools.map((p) => (
            <p key={p.label} className="text-muted-foreground">
              Réserve <span className="font-medium text-foreground">{p.label}</span> : chaque PCP du groupe mis dedans donne {p.per_point}
              {p.label === "Mana" ? " de mana maximum" : " points de connaissance libres"}.
            </p>
          ))}
        </div>
      ),
    };
  });
  return { id: "competences", title: "Compétences", sections };
}

function rolesPage(rules: Rules): RulePage {
  const sections: RuleSection[] = [];
  for (const [cat, catLabel] of Object.entries(rules.role_categories)) {
    const trunk = rules.common_trunks[cat];
    if (trunk?.length) {
      const lines = trunk.map((g) => describeGrant(rules, g));
      sections.push({
        id: `tronc-${cat}`, title: `Tronc commun ${catLabel}`, group: catLabel, text: linesText(lines),
        content: (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Compté une fois, quel que soit le nombre de rôles de la catégorie.</p>
            <GrantList lines={lines} />
          </div>
        ),
      });
    }
    for (const [key, role] of Object.entries(rules.roles).filter(([, r]) => r.category === cat)) {
      const primary = role.primary ? cumulate(role.primary.map((g) => describeGrant(rules, g))) : null;
      const secondary = role.secondary ? cumulate(role.secondary.map((g) => describeGrant(rules, g))) : null;
      const value = role.value ? ` (${role.value}${role.secondary_value ? ` - ${role.secondary_value}` : ""})` : "";
      sections.push({
        id: key, title: `${role.label}${value}`, group: catLabel,
        text: `${role.description ?? ""} Principal : ${primary ? linesText(primary) : "—"}. Secondaire : ${secondary ? linesText(secondary) : "—"}.`,
        content: (
          <div className="flex flex-col gap-2">
            {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {([["Principal", primary], ["Secondaire", secondary]] as const).map(([label, lines]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  {lines ? <GrantList lines={lines} /> : <span className="text-sm text-muted-foreground">—</span>}
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }
  }
  return { id: "roles", title: "Rôles", sections };
}

function traitsPage(rules: Rules): RulePage {
  const sections: RuleSection[] = [{
    id: "introduction", title: "Introduction", text: "traits bonus malus PC MJ",
    content: (
      <p className="text-sm">
        Les traits de personnage (surtout les malus) sont à décider avec le MJ. Ils doivent être intégrés à votre rôle,
        comme une part entière de la personnalité et de l'essence de votre personnage. Les <strong>bonus coûtent des PC</strong>,
        les <strong>malus en rapportent</strong>.
      </p>
    ),
  }];
  for (const kind of ["bonus", "malus"] as const) {
    for (const [key, t] of Object.entries(rules.traits).filter(([, t]) => t.kind === kind)) {
      const pcs = t.variants.length > 1 ? t.variants.map((v) => v.label).join(" ; ") : `${t.variants[0].pc > 0 ? "+" : "−"}${Math.abs(t.variants[0].pc)} PC`;
      sections.push({
        id: key, title: t.label, group: kind === "bonus" ? "Bonus" : "Malus",
        text: `${pcs} ${t.effect} ${t.automated ?? ""}`,
        content: (
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="font-medium text-primary">{pcs}</p>
            <p>{t.effect}</p>
            {t.automated && <p className="text-xs text-muted-foreground">Dans l'application : {t.automated}</p>}
          </div>
        ),
      });
    }
  }
  return { id: "traits", title: "Traits", sections };
}

function languagesPage(rules: Rules): RulePage {
  const intro = rules.resource_defs.langues?.description ?? "";
  const sections: RuleSection[] = [{
    id: "introduction", title: "Langues", text: intro, content: <p className="text-sm">{intro}</p>,
  }];
  for (const e of rules.catalogs.langues ?? []) {
    sections.push({ id: `langue-${slugify(e.label)}`, title: e.label, group: "Langues", text: e.effect, content: <p className="text-sm">{e.effect}</p> });
  }
  for (const e of rules.catalogs.animaux_totems ?? []) {
    sections.push({
      id: `totem-${slugify(e.label)}`, title: e.label, group: "Animaux totems", text: e.effect,
      content: <p className="text-sm">{e.effect}{e.skill || e.mana || e.free_knowledge ? " (compté en PCR)" : ""}</p>,
    });
  }
  return { id: "langues", title: "Langues et totems", sections };
}

/** Sorts : une section par famille (Feu, Eau...), regroupées par compétence magique. */
function spellsPage(rules: Rules): RulePage {
  const spells = rules.catalogs.sorts ?? [];
  const magic = rules.skill_groups.magie?.skills ?? {};
  const families = [...new Map(spells.map((s) => [`${s.school}/${s.group}`, s])).values()];
  const sections: RuleSection[] = families.map((f) => {
    const entries = spells.filter((s) => s.school === f.school && s.group === f.group);
    return {
      id: `sorts-${slugify(`${f.school ?? ""}-${f.group ?? ""}`)}`, title: f.group ?? "Sorts",
      group: f.school ? magic[f.school] ?? f.school : undefined,
      text: entries.map((s) => `${s.label} ${s.target ?? ""} ${(s.effects ?? []).map((e) => e.text).join(" ")}`).join(" "),
      content: (
        <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
          {entries.map((s) => (
            <li key={s.label} className={cn(s.effects?.length && "sm:col-span-2 py-1")}>
              {s.label}{s.target && <span className="text-muted-foreground"> — {s.target}</span>}
              {!!s.effects?.length && <div className="mt-1 pl-3"><SpellEffects effects={s.effects} scaling={s.scaling} /></div>}
            </li>
          ))}
        </ul>
      ),
    };
  });
  return { id: "sorts", title: "Sorts", sections };
}

export function buildRulePages(rules: Rules): RulePage[] {
  return [...textPages(rules), skillsPage(rules), rolesPage(rules), traitsPage(rules), languagesPage(rules), spellsPage(rules)];
}
