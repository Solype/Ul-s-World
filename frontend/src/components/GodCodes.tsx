import type { GodCode } from "@/api/client";

/** Codes d'un dieu : contenu, valeur de code et zèle. */
export default function GodCodes({ codes }: { codes: GodCode[] }) {
  if (codes.length === 0) return <p className="text-sm text-muted-foreground italic">Codes à venir.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="pb-1 text-left font-normal">Code</th>
          <th className="pb-1 pl-3 text-right font-normal">Valeur</th>
          <th className="pb-1 pl-3 text-right font-normal">Zèle</th>
        </tr>
      </thead>
      <tbody>
        {codes.map((c, i) => (
          <tr key={i} className="border-t align-top">
            <td className="py-1">{c.content}</td>
            <td className="py-1 pl-3 text-right tabular-nums">{c.value}</td>
            <td className="py-1 pl-3 text-right tabular-nums">{c.zeal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
