import type { RulePage, RuleSection } from "./pages";

/** Texte sans accents ni majuscules, avec, pour chaque caractère, sa position dans le texte d'origine. */
function fold(s: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const f = s[i].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const ch of f) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

export const foldText = (s: string) => fold(s).folded;

/** Morceaux d'extrait : `mark` = mot recherché, à surligner. */
export type Snippet = { text: string; mark: boolean }[];

export type SearchResult = { page: RulePage; section: RuleSection; score: number; title: Snippet; snippet: Snippet };

/** Découpe `s` en morceaux surlignés là où apparaissent les mots (déjà sans accents). */
function highlight(s: string, terms: string[]): Snippet {
  const { folded, map } = fold(s);
  const marks = new Array<boolean>(s.length).fill(false);
  for (const t of terms) {
    for (let at = folded.indexOf(t); at !== -1; at = folded.indexOf(t, at + 1)) {
      for (let k = at; k < at + t.length; k++) marks[map[k]] = true;
    }
  }
  const out: Snippet = [];
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1];
    if (last && last.mark === marks[i]) last.text += s[i];
    else out.push({ text: s[i], mark: marks[i] });
  }
  return out;
}

/** Extrait d'environ `width` caractères autour de la première occurrence d'un des mots. */
function excerpt(text: string, terms: string[], width = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const { folded, map } = fold(clean);
  const hits = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0);
  if (!hits.length) return clean.slice(0, width) + (clean.length > width ? "…" : "");
  const center = map[Math.min(...hits)];
  const start = Math.max(0, center - width / 3);
  const end = Math.min(clean.length, start + width);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

/**
 * Recherche dans toutes les pages : tous les mots doivent apparaître (titre, intertitre ou texte),
 * sans tenir compte des accents ni des majuscules. Les correspondances dans le titre comptent plus.
 */
export function searchRules(pages: RulePage[], query: string, limit = 50): SearchResult[] {
  const terms = foldText(query).split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return [];
  const results: SearchResult[] = [];
  for (const page of pages) {
    for (const section of page.sections) {
      const title = foldText(section.title);
      const all = `${title} ${foldText(section.group ?? "")} ${foldText(page.title)} ${foldText(section.text)}`;
      if (!terms.every((t) => all.includes(t))) continue;
      const score = terms.reduce((sum, t) => sum + (title.startsWith(t) ? 6 : title.includes(t) ? 4 : 0) + (foldText(section.text).includes(t) ? 1 : 0), 0);
      results.push({
        page, section, score,
        title: highlight(section.title, terms),
        snippet: highlight(excerpt(section.text, terms), terms),
      });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
