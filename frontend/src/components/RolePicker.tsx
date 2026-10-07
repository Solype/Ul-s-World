import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { Rules } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RoleDetails from "./RoleDetails";

type Props = {
  rules: Rules;
  rank: "primary" | "secondary";
  selected: string[];
  /** Rôles déjà pris à l'autre rang : un rôle ne se prend qu'une fois. */
  taken: string[];
  canAdd: boolean;
  onChange: (roles: string[]) => void;
};

/**
 * Sélecteur de rôles avec recherche, groupé par catégorie. Le rôle survolé (ou choisi au clavier)
 * est détaillé à côté : tronc commun, rôle à ce rang, et total. Chaque rôle choisi devient une
 * étiquette ; un clic dessus réaffiche son détail.
 */
export default function RolePicker({ rules, rank, selected, taken, canAdd, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState("");
  const available = Object.entries(rules.roles).filter(
    ([key, role]) => role[rank] != null && !selected.includes(key) && !taken.includes(key),
  );
  const byCategory = Object.entries(rules.role_categories)
    .map(([cat, label]) => [label, available.filter(([, r]) => r.category === cat)] as const)
    .filter(([, roles]) => roles.length > 0);
  const value = (key: string) => (rank === "primary" ? rules.roles[key]?.value : rules.roles[key]?.secondary_value);

  // Le tronc commun ne compte qu'une fois par catégorie : déjà compté si un autre rôle du personnage
  // (à n'importe quel rang) est de la même catégorie. Pour un rôle déjà choisi, c'est le premier de
  // sa catégorie qui porte le tronc.
  const allRoles = [...(rank === "primary" ? selected : taken), ...(rank === "primary" ? taken : selected)];
  const trunkCountedBefore = (key: string, existing: string[]) => {
    const cat = rules.roles[key]?.category;
    return existing.some((k) => k !== key && rules.roles[k]?.category === cat);
  };
  const trunkCountedForSelected = (key: string) =>
    trunkCountedBefore(key, allRoles.slice(0, allRoles.indexOf(key)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((key) => {
        const role = rules.roles[key];
        return (
          <Popover key={key}>
            <Badge asChild variant={role ? (rank === "primary" ? "default" : "secondary") : "destructive"}
              className="h-7 gap-1 pr-1 pl-2.5 text-sm">
              <span>
                <PopoverTrigger className="flex items-center gap-1" title="Voir ce que donne ce rôle">
                  {role?.label ?? key}
                  {value(key) != null && <span className="opacity-60">({value(key)})</span>}
                </PopoverTrigger>
                <button type="button" aria-label={`Retirer ${role?.label ?? key}`}
                  className="rounded-full p-0.5 opacity-70 hover:bg-background/30 hover:opacity-100"
                  onClick={() => onChange(selected.filter((k) => k !== key))}>
                  <X className="size-3.5" />
                </button>
              </span>
            </Badge>
            <PopoverContent className="w-[min(36rem,calc(100vw-2rem))]" align="start">
              <RoleDetails rules={rules} roleKey={key} rank={rank} trunkAlreadyCounted={trunkCountedForSelected(key)} />
            </PopoverContent>
          </Popover>
        );
      })}

      {canAdd && available.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm"><Plus data-icon="inline-start" />Ajouter un rôle</Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(52rem,calc(100vw-2rem))] p-0" align="start">
            <div className="flex max-h-[70vh] flex-col sm:flex-row">
              <Command value={highlighted} onValueChange={setHighlighted} className="sm:w-64 sm:shrink-0 sm:border-r">
                <CommandInput placeholder="Rechercher un rôle…" />
                <CommandList className="max-h-60 sm:max-h-[60vh]">
                  <CommandEmpty>Aucun rôle.</CommandEmpty>
                  {byCategory.map(([label, roles]) => (
                    <CommandGroup key={label} heading={label}>
                      {roles.map(([key, role]) => (
                        <CommandItem key={key} value={key} keywords={[role.label, label]}
                          onSelect={() => { onChange([...selected, key]); setOpen(false); }}>
                          {role.label}
                          {value(key) != null && <span className="ml-auto text-xs text-muted-foreground">{value(key)}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
              <div className="min-w-0 flex-1 overflow-y-auto border-t p-4 sm:border-t-0">
                {rules.roles[highlighted] ? (
                  <RoleDetails rules={rules} roleKey={highlighted} rank={rank}
                    trunkAlreadyCounted={trunkCountedBefore(highlighted, allRoles)} />
                ) : (
                  <p className="text-sm text-muted-foreground">Survole un rôle pour voir ce qu'il donne.</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {selected.length === 0 && !canAdd && <span className="text-sm text-muted-foreground">—</span>}
    </div>
  );
}
