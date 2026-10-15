import { Lock } from "lucide-react";
import type { GodPower, PowerTierDef } from "@/api/client";
import { cn } from "@/lib/utils";

/** Pouvoirs débloqués à cette piété, dans l'ordre des paliers. */
export function unlockedPowers(powers: GodPower[], tiers: Record<string, PowerTierDef>, piety: number) {
  return powers.filter((p) => (tiers[p.tier]?.piety ?? Infinity) <= piety);
}

/**
 * Pouvoirs d'un dieu, par palier (passif, paliers 1 à 3, ultime) avec la piété qui les débloque.
 * Avec `piety`, les paliers pas encore atteints sont estompés.
 */
export default function GodPowers({ powers, tiers, piety }: {
  powers: GodPower[]; tiers: Record<string, PowerTierDef>; piety?: number;
}) {
  if (powers.length === 0) return <p className="text-sm text-muted-foreground italic">Pouvoirs à venir.</p>;
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(tiers).map(([key, tier]) => {
        const inTier = powers.filter((p) => p.tier === key);
        if (inTier.length === 0) return null;
        const locked = piety !== undefined && piety < tier.piety;
        return (
          <div key={key} className={cn("flex flex-col gap-0.5", locked && "opacity-50")}>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {locked && <Lock className="size-3" />}{tier.label} · piété {tier.piety}
            </span>
            {inTier.map((p) => (
              <p key={p.name} className="text-sm"><span className="font-medium">{p.name}</span> : {p.effect}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
