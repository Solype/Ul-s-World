import {
  Activity, ArrowLeft, Backpack, BookOpen, CircleAlert, CircleCheck, Drama, Gem, ListOrdered, Loader2, Save, Shield,
  Sparkles, UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  api, type Attribute, type CharacterInput, type CharacterKind, type Creation, type Priority, type ValidationReport,
} from "@/api/client";
import Section, { Field } from "@/components/editor/Section";
import KnowledgeAndMana from "@/components/KnowledgeAndMana";
import NumberStepper from "@/components/NumberStepper";
import ResourcesSection from "@/components/ResourcesSection";
import RelationsField from "@/components/RelationsField";
import RoleChoices from "@/components/RoleChoices";
import RolePicker from "@/components/RolePicker";
import SkillsSection from "@/components/SkillsSection";
import TraitsSection from "@/components/TraitsSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRules } from "@/hooks/useRules";
import { creationBudget } from "@/lib/budget";
import { ATTRIBUTE_LABELS } from "@/lib/labels";
import { applyRoleEffects, roleFloors } from "@/lib/roleEffects";
import { cn } from "@/lib/utils";

export const KIND_LABELS: Record<CharacterKind, string> = { pj: "PJ", pnj: "PNJ", monstre: "Monstre" };
const PRIORITY_FIELDS = [
  ["roles", "Rôles"],
  ["attributes", "Attributs"],
  ["skill_groups", "Groupes de compétence"],
  ["money", "Sous"],
] as const;
const EXTRA_PC = [["relations", "Relations"], ["magic", "Magie"], ["bottes", "Bottes (×2)"]] as const;
const NONE = "none";

const SECTIONS = [
  { id: "identite", title: "Identité", icon: UserRound },
  { id: "priorites", title: "Priorités", icon: ListOrdered, rulesOnly: true },
  { id: "traits", title: "Traits", icon: Drama },
  { id: "attributs", title: "Attributs", icon: Activity },
  { id: "roles", title: "Rôles", icon: Shield },
  { id: "competences", title: "Compétences", icon: BookOpen },
  { id: "connaissances", title: "Mana et connaissances", icon: Sparkles },
  { id: "ressources", title: "Ressources", icon: Gem },
  { id: "equipement", title: "Équipement et relations", icon: Backpack },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Section de l'éditeur concernée par un problème de validation. */
function sectionOf(field: string): SectionId {
  if (field === "creation.money_spent" || field === "relations") return "equipement";
  if (field.startsWith("creation.role_choices") || field === "roles") return "roles";
  if (field.startsWith("creation.priorities")) return "priorites";
  if (field.startsWith("traits")) return "traits";
  if (field.startsWith("attributes") || field === "magic") return "attributs";
  if (field.startsWith("skill_groups") || field.startsWith("skills")) return "competences";
  if (field.startsWith("pools")) return "competences";
  if (field.startsWith("knowledges") || field === "mana") return "connaissances";
  if (field.startsWith("resources") || field.startsWith("selections") || field === "bottes") return "ressources";
  return "identite";
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

type Props = { id: number | null; kind: CharacterKind; onClose: () => void };

export default function CharacterEditor({ id, kind, onClose }: Props) {
  const rules = useRules();
  // Un PJ se crée selon les règles ; PNJ et monstres en saisie libre (modifiable).
  const [c, setC] = useState<CharacterInput>({ name: "", kind, creation_mode: kind === "pj" ? "rules" : "free" });
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [saving, setSaving] = useState(false);
  // Recalcul des PCR à l'enregistrement. Coché automatiquement si on touche aux rôles ou aux choix.
  const [syncRoles, setSyncRoles] = useState(false);

  useEffect(() => {
    if (id === null) return;
    api
      .GET("/api/characters/{character_id}", { params: { path: { character_id: id } } })
      .then(({ data }) => data && setC(data));
  }, [id]);

  // Validation en direct par le backend, 300 ms après la dernière modification.
  useEffect(() => {
    const t = setTimeout(() => {
      api.POST("/api/rules/validate", { body: { ...c, name: c.name || "?" } }).then(({ data }) => setReport(data ?? null));
    }, 300);
    return () => clearTimeout(t);
  }, [c]);

  // Nouveau PJ ou mise à jour des rôles demandée : on applique tout de suite ce que donnent les rôles,
  // comme le fera le backend à l'enregistrement.
  const appliesRoles = c.kind === "pj" && c.creation_mode !== "free" && (id === null || syncRoles);
  useEffect(() => {
    if (!rules || !appliesRoles) return;
    const patch = applyRoleEffects(rules, c, report);
    if (patch) setC((prev) => ({ ...prev, ...patch }));
  }, [rules, report, appliesRoles]);

  if (!rules) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const set = (patch: Partial<CharacterInput>) => setC((prev) => ({ ...prev, ...patch }));
  const rulesMode = c.creation_mode !== "free";
  const isPC = (c.kind ?? "pj") === "pj";
  // Points restants (mode règles uniquement) : bornent les boutons « + ».
  const budget = rulesMode ? creationBudget(rules, c, report) : null;
  const creation: Creation = c.creation ?? {};
  const setCreation = (patch: Partial<Creation>) => set({ creation: { ...creation, ...patch } });
  // Limites d'attributs : celles calculées par le backend, traits compris (Aptitude, Hybride...).
  const limits = rulesMode && c.species
    ? report?.trait_effects?.attribute_limits ?? rules.species_limits[c.species]
    : undefined;
  const issues = report?.issues ?? [];
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;
  const issueCount = (section: SectionId) => issues.filter((i) => sectionOf(i.field) === section).length;
  const floors = roleFloors(report);
  const sections = SECTIONS.filter((s) => !("rulesOnly" in s) || rulesMode);

  const save = async () => {
    if (!c.name.trim()) {
      toast.error("Le personnage doit avoir un nom.");
      scrollTo("identite");
      return;
    }
    setSaving(true);
    const body = { ...c, creation: rulesMode ? creation : null, relations: (c.relations ?? []).filter((r) => r.trim()) };
    const res =
      id === null
        ? await api.POST("/api/characters", { body })
        : await api.PATCH("/api/characters/{character_id}", {
            params: { path: { character_id: id }, query: { sync_roles: syncRoles } },
            body,
          });
    setSaving(false);
    if (res.error) {
      toast.error("Enregistrement impossible", { description: JSON.stringify(res.error).slice(0, 200) });
    } else {
      toast.success(`${c.name} enregistré`, { description: report?.valid ? "Personnage valide." : "Brouillon : il reste des points à compléter." });
      onClose();
    }
  };

  const gauges = rulesMode && report
    ? [
        { label: "Points de création", spent: report.pc_spent, total: report.pc_total },
        { label: "Attributs", spent: report.attribute_points_spent, total: report.attribute_points_available },
        { label: "Points de groupe", spent: report.skill_group_points_spent, total: report.skill_group_points_available },
        { label: "Sous", spent: creation.money_spent ?? 0, total: report.money_available },
      ]
    : [];

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="icon" aria-label="Retour" onClick={onClose}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate text-2xl font-semibold">{c.name || (id === null ? "Nouveau personnage" : "…")}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Badge variant="secondary">{KIND_LABELS[c.kind ?? "pj"]}</Badge>
            <Badge variant="outline">{rulesMode ? "Selon les règles" : "Création libre"}</Badge>
            {c.species && <span className="capitalize">{c.species}</span>}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>Annuler</Button>
          <Button type="submit" className="flex-1 sm:flex-none" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Identité */}
          <Section id="identite" title="Identité" icon={UserRound} issues={issueCount("identite")}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nom">
                <Input required value={c.name} placeholder="Nom du personnage" onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Type">
                <Select value={c.kind ?? "pj"} onValueChange={(v) => set({ kind: v as CharacterKind })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Création">
                <Select value={c.creation_mode ?? "rules"} onValueChange={(v) => set({ creation_mode: v as "rules" | "free" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rules">Selon les règles</SelectItem>
                    <SelectItem value="free">Libre (sans vérification des règles)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Espèce">
                {rulesMode ? (
                  <Select value={c.species ?? undefined} onValueChange={(v) => set({ species: v })}>
                    <SelectTrigger className={cn("w-full", c.species && "capitalize")} aria-invalid={!!issueFor("species") || undefined}>
                      <SelectValue placeholder="Choisir une espèce" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(rules.species_limits).map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input list="species-list" placeholder="loup, dragon…" value={c.species ?? ""}
                      onChange={(e) => set({ species: e.target.value || null })} />
                    <datalist id="species-list">
                      {Object.keys(rules.species_limits).map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Âge">
                <Input type="number" min={0} value={c.age ?? ""} placeholder="—"
                  onChange={(e) => set({ age: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            </div>
          </Section>

          {/* Priorités */}
          {rulesMode && (
            <Section id="priorites" title="Priorités" icon={ListOrdered} issues={issueCount("priorites")}
              description={`Chaque priorité coûte des points de création : ${report?.pc_spent ?? 0} / ${report?.pc_total ?? rules.start_pc} PC dépensés`
                + (report && report.pc_total !== rules.start_pc ? ` (${rules.start_pc} de base, ${report.pc_total - rules.start_pc > 0 ? "+" : ""}${report.pc_total - rules.start_pc} par les traits).` : ".")}>
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {PRIORITY_FIELDS.map(([key, label]) => (
                    <Field key={key} label={label}>
                      <Select value={creation.priorities?.[key] ?? NONE}
                        onValueChange={(v) => setCreation({ priorities: { ...creation.priorities, [key]: v === NONE ? null : (v as Priority) } })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {Object.entries(rules.priorities).map(([p, row]) => (
                            <SelectItem key={p} value={p}>
                              <span className="font-semibold">{p}</span>
                              <span className="text-muted-foreground">· {row.cost} PC</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">PC restants ({Math.max(0, budget?.pcLeft ?? 0)})</p>
                  <div className="flex flex-wrap gap-6">
                    {EXTRA_PC.map(([k, label]) => (
                      <Field key={k} label={label}>
                        <NumberStepper
                          value={creation.extra_pc?.[k] ?? 0}
                          max={(creation.extra_pc?.[k] ?? 0) + Math.max(0, budget?.pcLeft ?? 0)}
                          onChange={(v) => {
                            const extra = { ...creation.extra_pc, [k]: v };
                            set({
                              creation: { ...creation, extra_pc: extra },
                              magic: (floors.stats.magic ?? 0) + (extra.magic ?? 0),
                              bottes: (floors.stats.bottes ?? 0) + (extra.bottes ?? 0) * rules.bottes_per_pc,
                            });
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Traits */}
          <Section id="traits" title="Traits" icon={Drama} issues={issueCount("traits")}
            description="Les bonus coûtent des PC, les malus en rapportent.">
            <TraitsSection rules={rules} traits={c.traits ?? []} species={c.species} report={report} rulesMode={rulesMode}
              onChange={(traits) => { setSyncRoles(true); set({ traits }); }} />
          </Section>

          {/* Attributs */}
          <Section id="attributs" title="Attributs" icon={Activity} issues={issueCount("attributs")}
            description={rulesMode
              ? `${report?.attribute_points_spent ?? 0} / ${report?.attribute_points_available ?? "?"} points répartis, dans les limites de l'espèce.`
              : undefined}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {rules.attributes.map((a: Attribute) => {
                const value = c.attributes?.[a] ?? 0;
                // Mode règles : plafonné par le maximum de l'espèce et par les points d'attributs restants.
                const max = budget
                  ? Math.min(limits?.[a].max ?? Infinity, value + Math.max(0, budget.attributesLeft))
                  : undefined;
                const invalid = !!issueFor(`attributes.${a}`);
                return (
                  <div key={a} className={cn("flex flex-col items-center gap-2 rounded-xl border p-3", invalid && "border-destructive/60 bg-destructive/5")}>
                    <span className="text-sm font-medium">{ATTRIBUTE_LABELS[a]}</span>
                    <NumberStepper value={value} max={max} invalid={invalid}
                      onChange={(v) => set({ attributes: { ...c.attributes, [a]: v } })} />
                    <span className="text-xs text-muted-foreground">{limits ? `${limits[a].min} – ${limits[a].max}` : " "}</span>
                  </div>
                );
              })}
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-3">
                <span className="text-sm font-medium">Magie</span>
                {rulesMode ? (
                  <NumberStepper value={c.magic ?? 0} readOnly title="Rôles + PC restants" />
                ) : (
                  <NumberStepper value={c.magic ?? 0} onChange={(v) => set({ magic: v })} />
                )}
                <span className="text-xs text-muted-foreground">{rulesMode ? "rôles + PC" : " "}</span>
              </div>
            </div>
          </Section>

          {/* Rôles */}
          <Section id="roles" title="Rôles" icon={Shield} issues={issueCount("roles")}
            description={rulesMode && !creation.priorities?.roles ? "Choisis d'abord la priorité des rôles." : undefined}>
            <div className="flex flex-col gap-4">
              {(["primary", "secondary"] as const).map((k) => {
                const other = k === "primary" ? "secondary" : "primary";
                const canAdd = budget ? (k === "primary" ? budget.canAddPrimary : budget.canAddSecondary) : true;
                return (
                  <div key={k} className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-center">
                    <span className="text-sm font-medium text-muted-foreground">{k === "primary" ? "Principaux" : "Secondaires"}</span>
                    <RolePicker rules={rules} rank={k} selected={c.roles?.[k] ?? []} taken={c.roles?.[other] ?? []} canAdd={canAdd}
                      onChange={(roles) => { setSyncRoles(true); set({ roles: { ...c.roles, [k]: roles } }); }} />
                  </div>
                );
              })}
              {rulesMode && isPC && (
                <RoleChoices rules={rules} creation={creation} report={report}
                  onChange={(patch) => { setSyncRoles(true); setCreation(patch); }} />
              )}
              {rulesMode && isPC && id !== null && (report?.role_points_outdated || syncRoles) && (
                <Alert>
                  <CircleAlert />
                  <AlertTitle>Mise à jour des rôles</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    {report?.role_points_outdated && (
                      <span>Les points enregistrés ne correspondent plus aux rôles (rôles, choix ou catalogue modifiés).</span>
                    )}
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox checked={syncRoles} onCheckedChange={(v) => setSyncRoles(v === true)} />
                      Mettre à jour les rôles à l'enregistrement (recalculer les PCR)
                    </Label>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </Section>

          {/* Compétences */}
          <Section id="competences" title="Compétences" icon={BookOpen} issues={issueCount("competences")}
            description={rulesMode
              ? `Points de groupe : ${report?.skill_group_points_spent ?? 0} / ${report?.skill_group_points_available ?? "?"}. Chaque niveau donne 2 PCP à répartir dans le groupe.`
              : undefined}>
            {/* Nouveau personnage ou mise à jour demandée : aperçu des PCR calculés ; sinon PCR enregistrés. */}
            <SkillsSection rules={rules} character={c} report={report} onChange={set} roleMana={floors.stats.mana ?? 0}
              pcrSource={id === null || syncRoles ? "computed" : "stored"} />
          </Section>

          <Section id="connaissances" title="Mana et connaissances" icon={Sparkles} issues={issueCount("connaissances")}>
            <KnowledgeAndMana character={c} onChange={set} knowledgeFloors={floors.knowledges}
              rules={rulesMode ? {
                roleMana: floors.stats.mana ?? 0,
                // Part du mana des rôles qui vient des animaux totems (Cerf).
                totemMana: (report?.role_points?.totems ?? []).reduce(
                  (sum, t) => sum + (rules.catalogs.animaux_totems?.find((e) => e.label === t)?.mana ?? 0), 0),
                manaFromPool: (c.pools?.mana ?? 0) * rules.skill_pools.mana.per_point,
                traitMana: report?.trait_effects?.mana_bonus ?? 0,
                freeKnowledge: (c.pools?.connaissances ?? 0) * rules.skill_pools.connaissances.per_point
                  + (report?.role_points?.free_knowledge ?? 0),
              } : null} />
          </Section>

          <Section id="ressources" title="Ressources" icon={Gem} issues={issueCount("ressources")}
            description="Sorts, langues, bottes, dieux, compagnons… : chaque ressource donne accès à des choix.">
            <ResourcesSection rules={rules} character={c} rulesMode={rulesMode} floors={floors.stats} imposed={floors.imposed} onChange={set} />
          </Section>

          <Section id="equipement" title="Équipement et relations" icon={Backpack} issues={issueCount("equipement")}>
            <div className="flex flex-col gap-4">
              {rulesMode && (
                <Field label="Sous dépensés" hint={`Budget : ${report?.money_available ?? 0} sous (priorité « Sous »).`}>
                  <NumberStepper value={creation.money_spent ?? 0} className="w-32"
                    max={report?.money_available ?? (creation.priorities?.money ? rules.priorities[creation.priorities.money].money : 0)}
                    onChange={(v) => setCreation({ money_spent: v })} />
                </Field>
              )}
              <RelationsField relations={c.relations ?? []} bought={rulesMode ? creation.extra_pc?.relations ?? 0 : null}
                invalid={!!issueFor("relations")} onChange={(relations) => set({ relations })} />
              <Field label="Notes">
                <Textarea rows={4} value={c.notes ?? ""} placeholder="Histoire, équipement, apparence…"
                  onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </Section>
        </div>

        {/* Panneau latéral */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {!report ? <Loader2 className="size-4 animate-spin" />
                  : report.valid ? <CircleCheck className="size-4 text-success" />
                  : <CircleAlert className="size-4 text-warning" />}
                {!report ? "Vérification…" : report.valid ? (report.rules_checked ? "Personnage valide" : "Fiche cohérente") : `${issues.length} point(s) à compléter`}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {sections.map((s) => {
                const n = issueCount(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => scrollTo(s.id)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <s.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{s.title}</span>
                    {n > 0 ? <Badge variant="destructive">{n}</Badge> : report && <CircleCheck className="size-3.5 text-success" />}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {gauges.length > 0 && (
            <Card size="sm">
              <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {gauges.map((g) => (
                  <div key={g.label} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{g.label}</span>
                      <span className={cn("tabular-nums", g.total != null && g.spent > g.total ? "text-destructive" : "text-muted-foreground")}>
                        {g.spent} / {g.total ?? "?"}
                      </span>
                    </div>
                    <Progress value={g.total ? Math.min(100, (g.spent / g.total) * 100) : 0} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {issues.length > 0 && (
            <Card size="sm">
              <CardHeader><CardTitle>À compléter</CardTitle></CardHeader>
              <CardContent>
                <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
                  {issues.map((i) => (
                    <li key={i.field + i.message}>
                      <button type="button" onClick={() => scrollTo(sectionOf(i.field))}
                        className="w-full rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground">
                        {i.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {report && !report.rules_checked && (
            <p className="px-1 text-xs text-muted-foreground">Création libre : les règles de création ne sont pas vérifiées.</p>
          )}
        </aside>
      </div>
    </form>
  );
}
