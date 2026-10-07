import { Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRules } from "@/hooks/useRules";
import { cn } from "@/lib/utils";
import { buildRulePages, type RulePage } from "./pages";
import type { RulesTarget } from "./RulesPanelContext";
import { searchRules, type Snippet } from "./search";

type Props = {
  target: RulesTarget;
  onNavigate: (page: string, section?: string) => void;
  /** `panel` : colonne étroite à droite ; `page` : pleine page avec sommaire. */
  variant: "panel" | "page";
  /** Change quand il faut placer le curseur dans la recherche (Ctrl+K). */
  searchToken?: number;
};

const anchorId = (variant: string, page: string, section: string) => `regles-${variant}-${page}-${section}`;

function Marked({ parts }: { parts: Snippet }) {
  return <>{parts.map((p, i) => (p.mark ? <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}</>;
}

function PageContent({ page, variant }: { page: RulePage; variant: string }) {
  let group: string | undefined;
  return (
    <article className="flex flex-col gap-1">
      <h2 className="mb-2 font-heading text-xl font-semibold text-primary">{page.title}</h2>
      {page.sections.map((s) => {
        const heading = s.group && s.group !== group ? s.group : null;
        group = s.group;
        return (
          <Fragment key={s.id}>
            {heading && <h3 className="mt-5 border-b pb-1 font-heading text-base font-semibold">{heading}</h3>}
            <section id={anchorId(variant, page.id, s.id)} className="-mx-2 scroll-mt-20 rounded-lg px-2 py-2">
              <h4 className="mb-1.5 font-heading text-sm font-semibold">{s.title}</h4>
              {s.content}
            </section>
          </Fragment>
        );
      })}
    </article>
  );
}

/**
 * Lecture des règles : recherche dans toutes les pages (sans tenir compte des accents), choix de la page,
 * contenu. La cible (`target`) peut viser une section : on y défile et elle clignote brièvement.
 */
export default function RulesReader({ target, onNavigate, variant, searchToken }: Props) {
  const rules = useRules();
  const pages = useMemo(() => (rules ? buildRulePages(rules) : []), [rules]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Panneau : zone qui défile (seule elle doit bouger, pas la page à côté).
  const scrollRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchRules(pages, query), [pages, query]);
  const page = pages.find((p) => p.id === target.page) ?? pages[0];

  useEffect(() => {
    if (searchToken) searchRef.current?.focus();
  }, [searchToken]);

  // Défilement vers la section visée (ou le haut de la page), puis bref surlignage.
  useEffect(() => {
    if (!page || query) return;
    if (!target.section && variant === "page") {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(anchorId(variant, page.id, target.section ?? page.sections[0]?.id ?? ""));
    if (!el) return;
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8 });
    else el.scrollIntoView({ block: "start" });
    if (target.section) {
      el.classList.remove("rules-flash");
      void el.offsetWidth; // relance l'animation
      el.classList.add("rules-flash");
    }
  }, [page, target.section, target.nonce, query, variant]);

  if (!rules || !page) {
    return <div className="flex flex-col gap-3 p-4"><Skeleton className="h-9" /><Skeleton className="h-40" /></div>;
  }

  const go = (pageId: string, section?: string) => {
    setQuery("");
    onNavigate(pageId, section);
  };

  const searchBox = (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input ref={searchRef} value={query} placeholder="Rechercher dans les règles… (Ctrl+K)" className="pr-8 pl-8"
        aria-label="Rechercher dans les règles"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].page.id, results[0].section.id);
          if (e.key === "Escape") setQuery("");
        }} />
      {query && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Effacer la recherche"
          className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setQuery("")}><X /></Button>
      )}
    </div>
  );

  const resultList = (
    <div className="flex flex-col gap-1">
      <p className="mb-1 text-xs text-muted-foreground">
        {results.length ? `${results.length}${results.length === 50 ? "+" : ""} résultat(s) — Entrée ouvre le premier.` : "Aucun résultat."}
      </p>
      {results.map((r) => (
        <button key={`${r.page.id}/${r.section.id}`} type="button" onClick={() => go(r.page.id, r.section.id)}
          className="flex flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
          <span className="text-sm font-medium"><Marked parts={r.title} /></span>
          <span className="text-xs text-primary">{r.page.title}{r.section.group ? ` · ${r.section.group}` : ""}</span>
          <span className="text-xs text-muted-foreground"><Marked parts={r.snippet} /></span>
        </button>
      ))}
    </div>
  );

  const pageSelect = (
    <Select value={page.id} onValueChange={(v) => go(v)}>
      <SelectTrigger className="w-full" aria-label="Page des règles"><SelectValue /></SelectTrigger>
      <SelectContent>
        {pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (variant === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-2 border-b p-3">{searchBox}{!query && pageSelect}</div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">{query ? resultList : <PageContent page={page} variant={variant} />}</div>
      </div>
    );
  }

  // Pleine page : sommaire à gauche (pages et sections de la page courante).
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]">
      <nav className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
        {searchBox}
        <div className="lg:hidden">{pageSelect}</div>
        <ul className="hidden flex-col gap-0.5 text-sm lg:flex">
          {pages.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go(p.id)}
                className={cn("w-full rounded-md px-2 py-1 text-left hover:bg-muted", p.id === page.id && "bg-muted font-semibold text-primary")}>
                {p.title}
              </button>
              {p.id === page.id && p.sections.length < 40 && (
                <ul className="my-1 ml-3 flex flex-col border-l pl-2 text-xs">
                  {p.sections.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => go(p.id, s.id)}
                        className="w-full rounded px-1.5 py-0.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground">
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{query ? resultList : <PageContent page={page} variant={variant} />}</div>
    </div>
  );
}
