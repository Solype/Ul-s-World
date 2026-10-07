import { LogOut, ScrollText, Swords, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { CharacterKind } from "./api/client";
import { AuthProvider, useAuth, useUser } from "./auth/AuthContext";
import ThemeToggle from "./components/ThemeToggle";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { cn } from "./lib/utils";
import CharacterEditor from "./pages/CharacterEditor";
import CharacterList from "./pages/CharacterList";
import CharacterSheet from "./pages/CharacterSheet";
import LoginPage from "./pages/LoginPage";
import RulesPanel from "./rules/RulesPanel";
import { RulesPanelProvider, useRulesPanel } from "./rules/RulesPanelContext";
import RulesReader from "./rules/RulesReader";

// Navigation par l'URL (hash) : le bouton Retour et le rechargement de la page fonctionnent.
//   #/pj, #/pnj, #/monstre        liste
//   #/nouveau/<type>              création
//   #/personnage/<id>             édition
//   #/fiche/<id>                  fiche à lire ou imprimer
//   #/regles/<page>/<section>     règles en pleine page
export type View =
  | { page: "list"; kind: CharacterKind }
  | { page: "edit"; id: number | null; kind: CharacterKind }
  | { page: "sheet"; id: number }
  | { page: "rules"; rulesPage?: string; section?: string };

const KINDS: CharacterKind[] = ["pj", "pnj", "monstre"];
const asKind = (k: string | undefined): CharacterKind => (KINDS.includes(k as CharacterKind) ? (k as CharacterKind) : "pj");

function parseHash(hash: string): View {
  const [, a, b, c] = hash.replace(/^#/, "").split("/");
  if (a === "nouveau") return { page: "edit", id: null, kind: asKind(b) };
  if (a === "personnage" && Number(b)) return { page: "edit", id: Number(b), kind: "pj" };
  if (a === "fiche" && Number(b)) return { page: "sheet", id: Number(b) };
  if (a === "regles") return { page: "rules", rulesPage: b || undefined, section: c || undefined };
  return { page: "list", kind: asKind(a) };
}

const toHash = (v: View) => {
  switch (v.page) {
    case "list": return `#/${v.kind}`;
    case "edit": return v.id === null ? `#/nouveau/${v.kind}` : `#/personnage/${v.id}`;
    case "sheet": return `#/fiche/${v.id}`;
    case "rules": return `#/regles${v.rulesPage ? `/${v.rulesPage}` : ""}${v.section ? `/${v.section}` : ""}`;
  }
};

function AccountMenu() {
  const user = useUser();
  const { logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm"><UserRound data-icon="inline-start" />{user.username}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-2">
          {user.username}{user.is_admin && <Badge variant="secondary">admin</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}><LogOut />Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Layout() {
  const [view, setViewState] = useState<View>(() => parseHash(location.hash));
  const rulesPanel = useRulesPanel();
  const [listKind, setListKind] = useState<CharacterKind>(view.page === "list" ? view.kind : "pj");
  useEffect(() => {
    const onHash = () => {
      const v = parseHash(location.hash);
      setViewState(v);
      if (v.page === "list") setListKind(v.kind);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setView = (v: View) => { location.hash = toHash(v); };
  const back = () => (history.length > 1 ? history.back() : setView({ page: "list", kind: listKind }));
  const onRulesPage = view.page === "rules";

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur print:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <button className="flex items-center gap-2 text-primary" onClick={() => setView({ page: "list", kind: listKind })}>
            <Swords className="size-5" />
            <span className="font-heading text-lg font-semibold">NewMannheim</span>
          </button>
          <span className="hidden text-sm text-muted-foreground sm:inline">Création de personnages</span>
          <div className="ml-auto flex items-center gap-1">
            {!onRulesPage && (
              <Button variant={rulesPanel.isOpen ? "secondary" : "ghost"} size="sm" onClick={rulesPanel.toggle}
                aria-pressed={rulesPanel.isOpen} title="Règles (Ctrl+K pour rechercher)">
                <ScrollText data-icon="inline-start" />Règles
              </Button>
            )}
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>
      <div className="flex">
        <main className={cn("min-w-0 flex-1 @container/main print:p-0")}>
          <div className="mx-auto max-w-7xl px-4 py-6 print:max-w-none print:p-0">
            {view.page === "list" && (
              <CharacterList kind={view.kind} onKindChange={(k) => setView({ page: "list", kind: k })}
                onOpen={(id) => setView({ page: "edit", id, kind: view.kind })}
                onSheet={(id) => setView({ page: "sheet", id })} />
            )}
            {view.page === "edit" && (
              <CharacterEditor key={toHash(view)} id={view.id} kind={view.kind} onClose={back} />
            )}
            {view.page === "sheet" && <CharacterSheet id={view.id} onClose={back} />}
            {view.page === "rules" && (
              <RulesReader variant="page" searchToken={rulesPanel.searchToken}
                target={{ page: view.rulesPage ?? "creation", section: view.section }}
                onNavigate={(page, section) => setView({ page: "rules", rulesPage: page, section })} />
            )}
          </div>
        </main>
        {!onRulesPage && <RulesPanel />}
      </div>
    </div>
  );
}

/** Rien tant qu'on ne sait pas si une session existe, puis la connexion ou l'application. */
function Gate() {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user === null) return <LoginPage />;
  // `key` : changer de compte repart d'un état propre (listes, websockets...).
  return (
    <RulesPanelProvider key={user.id}>
      <Layout />
    </RulesPanelProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
