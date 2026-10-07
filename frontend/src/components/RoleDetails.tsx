import { BookOpen, Dices, Gem, Library, Sigma } from "lucide-react";
import type { Rules } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cumulate, describeGrant, type GrantLine } from "@/lib/roleGrants";
import { cn } from "@/lib/utils";

type Props = {
  rules: Rules;
  roleKey: string;
  rank: "primary" | "secondary";
  /** Un autre rôle du personnage est déjà de cette catégorie : le tronc commun ne compte qu'une fois. */
  trunkAlreadyCounted: boolean;
};

const ICONS = { skill: BookOpen, skill_group: BookOpen, knowledge: Library, stat: Gem, choice: Dices };

function Lines({ lines, muted }: { lines: GrantLine[]; muted?: boolean }) {
  if (lines.length === 0) return <p className="text-xs text-muted-foreground">Rien.</p>;
  return (
    <ul className={cn("flex flex-col gap-1", muted && "opacity-50")}>
      {lines.map((l, i) => {
        const Icon = ICONS[l.kind];
        return (
          <li key={i} className="flex items-baseline gap-2 text-sm">
            <Icon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
            <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-primary">
              {l.kind === "stat" ? l.points : `+${l.points}`}
            </span>
            <span className="min-w-0">
              {l.label}
              {l.note && <span className="text-muted-foreground"> {l.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Ce que donne un rôle : tronc commun de sa catégorie, le rôle lui-même à ce rang, et le cumul des deux. */
export default function RoleDetails({ rules, roleKey, rank, trunkAlreadyCounted }: Props) {
  const role = rules.roles[roleKey];
  if (!role) return <p className="text-sm text-muted-foreground">Rôle hors catalogue : aucun point compté.</p>;

  const category = rules.role_categories[role.category] ?? role.category;
  const trunk = (rules.common_trunks[role.category] ?? []).map((g) => describeGrant(rules, g));
  const own = (role[rank] ?? []).map((g) => describeGrant(rules, g));
  const total = cumulate(trunkAlreadyCounted ? own : [...trunk, ...own]);
  const value = rank === "primary" ? role.value : role.secondary_value;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-heading text-base font-semibold">{role.label}</h4>
        <Badge variant="secondary">{rank === "primary" ? "Principal" : "Secondaire"}</Badge>
        <Badge variant="outline">{category}</Badge>
        {value != null && <Badge variant="outline">valeur {value}</Badge>}
      </div>
      {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tronc commun {category}
            {trunkAlreadyCounted && trunk.length > 0 && <Badge variant="outline" className="normal-case">déjà compté</Badge>}
          </span>
          {trunk.length === 0 ? <p className="text-xs text-muted-foreground">Pas de tronc commun.</p> : <Lines lines={trunk} muted={trunkAlreadyCounted} />}
        </section>
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {role.label} ({rank === "primary" ? "principal" : "secondaire"})
          </span>
          <Lines lines={own} />
        </section>
      </div>

      <Separator />
      <section className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
          <Sigma className="size-3.5 text-primary" />Total apporté
        </span>
        <Lines lines={total} />
      </section>
    </div>
  );
}
