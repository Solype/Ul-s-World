import { Swords } from "lucide-react";
import { useEffect, useState } from "react";
import type { CharacterKind } from "./api/client";
import ThemeToggle from "./components/ThemeToggle";
import CharacterEditor from "./pages/CharacterEditor";
import CharacterList from "./pages/CharacterList";

// Navigation par l'URL (hash) : le bouton Retour et le rechargement de la page fonctionnent.
//   #/pj, #/pnj, #/monstre        liste
//   #/nouveau/<type>              création
//   #/personnage/<id>             édition
export type View = { page: "list"; kind: CharacterKind } | { page: "edit"; id: number | null; kind: CharacterKind };

const KINDS: CharacterKind[] = ["pj", "pnj", "monstre"];
const asKind = (k: string | undefined): CharacterKind => (KINDS.includes(k as CharacterKind) ? (k as CharacterKind) : "pj");

function parseHash(hash: string): View {
  const [, a, b] = hash.replace(/^#/, "").split("/");
  if (a === "nouveau") return { page: "edit", id: null, kind: asKind(b) };
  if (a === "personnage" && Number(b)) return { page: "edit", id: Number(b), kind: "pj" };
  return { page: "list", kind: asKind(a) };
}

const toHash = (v: View) =>
  v.page === "list" ? `#/${v.kind}` : v.id === null ? `#/nouveau/${v.kind}` : `#/personnage/${v.id}`;

export default function App() {
  const [view, setViewState] = useState<View>(() => parseHash(location.hash));
  useEffect(() => {
    const onHash = () => setViewState(parseHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setView = (v: View) => { location.hash = toHash(v); };
  const tab = view.kind;

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button className="flex items-center gap-2 text-primary" onClick={() => setView({ page: "list", kind: tab })}>
            <Swords className="size-5" />
            <span className="font-heading text-lg font-semibold">NewMannheim</span>
          </button>
          <span className="hidden text-sm text-muted-foreground sm:inline">Création de personnages</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {view.page === "list" ? (
          <CharacterList kind={tab} onKindChange={(k) => setView({ page: "list", kind: k })} onOpen={(id) => setView({ page: "edit", id, kind: tab })} />
        ) : (
          <CharacterEditor key={toHash(view)} id={view.id} kind={view.kind} onClose={() => history.length > 1 ? history.back() : setView({ page: "list", kind: tab })} />
        )}
      </main>
    </div>
  );
}
