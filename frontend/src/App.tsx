import { LogOut, ScrollText, Swords, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type CharacterKind } from "./api/client";
import { AuthProvider, useAuth, useUser } from "./auth/AuthContext";
import DownloadApp from "./components/DownloadApp";
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
import RoomList from "./pages/RoomList";
import RoomPage from "./pages/RoomPage";
import RulesPanel from "./rules/RulesPanel";
import { RulesPanelProvider, useRulesPanel } from "./rules/RulesPanelContext";
import RulesReader from "./rules/RulesReader";

// Navigation par l'URL (hash) : le bouton Retour et le rechargement de la page fonctionnent.
//   #/pj, #/pnj, #/monstre        liste
//   #/nouveau/<type>              création
//   #/personnage/<id>             édition
//   #/fiche/<id>                  fiche à lire ou imprimer
//   #/regles/<page>/<section>     règles en pleine page
//   #/rooms, #/room/<id>          rooms (tables de jeu)
//   #/rejoindre/<code>            lien d'invitation : rejoint la room puis l'ouvre
export type View =
  | { page: "list"; kind: CharacterKind }
  | { page: "edit"; id: number | null; kind: CharacterKind }
  | { page: "sheet"; id: number }
  | { page: "rules"; rulesPage?: string; section?: string }
  | { page: "rooms" }
  | { page: "room"; id: number }
  | { page: "join"; code: string };

const KINDS: CharacterKind[] = ["pj", "pnj", "monstre"];
const asKind = (k: string | undefined): CharacterKind => (KINDS.includes(k as CharacterKind) ? (k as CharacterKind) : "pj");

function parseHash(hash: string): View {
  const [, a, b, c] = hash.replace(/^#/, "").split("/");
  if (a === "nouveau") return { page: "edit", id: null, kind: asKind(b) };
  if (a === "personnage" && Number(b)) return { page: "edit", id: Number(b), kind: "pj" };
  if (a === "fiche" && Number(b)) return { page: "sheet", id: Number(b) };
  if (a === "rooms") return { page: "rooms" };
  if (a === "room" && Number(b)) return { page: "room", id: Number(b) };
  if (a === "rejoindre" && b) return { page: "join", code: b };
  if (a === "regles") return { page: "rules", rulesPage: b || undefined, section: c || undefined };
  return { page: "list", kind: asKind(a) };
}

const toHash = (v: View) => {
  switch (v.page) {
    case "list": return `#/${v.kind}`;
    case "edit": return v.id === null ? `#/nouveau/${v.kind}` : `#/personnage/${v.id}`;
    case "sheet": return `#/fiche/${v.id}`;
    case "rules": return `#/regles${v.rulesPage ? `/${v.rulesPage}` : ""}${v.section ? `/${v.section}` : ""}`;
    case "rooms": return "#/rooms";
    case "room": return `#/room/${v.id}`;
    case "join": return `#/rejoindre/${v.code}`;
  }
};

/** Lien d'invitation : rejoint la room, puis la remplace dans l'historique par la page de la room. */
function JoinRoom({ code }: { code: string }) {
  useEffect(() => {
    api.POST("/api/rooms/join", { body: { code } }).then(({ data }) => {
      if (!data) toast.error("Code d'invitation inconnu");
      location.replace(data ? `#/room/${data.id}` : "#/rooms");
    });
  }, [code]);
  return <p className="text-muted-foreground">Entrée dans la room…</p>;
}

function AccountMenu() {
  const user = useUser();
  const { logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={user.username}>
          <UserRound data-icon="inline-start" /><span className="hidden sm:inline">{user.username}</span>
        </Button>
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
          <button className="flex items-center gap-2 text-primary" aria-label="NewMannheim, accueil" onClick={() => setView({ page: "list", kind: listKind })}>
            <Swords className="size-5" />
            <span className="hidden font-heading text-lg font-semibold md:inline">NewMannheim</span>
          </button>
          <nav className="flex items-center gap-1">
            <Button variant={["list", "edit", "sheet"].includes(view.page) ? "secondary" : "ghost"} size="sm"
              aria-label="Personnages" onClick={() => setView({ page: "list", kind: listKind })}>
              <UserRound data-icon="inline-start" /><span className="hidden sm:inline">Personnages</span>
            </Button>
            <Button variant={["rooms", "room"].includes(view.page) ? "secondary" : "ghost"} size="sm"
              aria-label="Rooms" onClick={() => setView({ page: "rooms" })}>
              <Users data-icon="inline-start" /><span className="hidden sm:inline">Rooms</span>
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <DownloadApp />
            {!onRulesPage && (
              <Button variant={rulesPanel.isOpen ? "secondary" : "ghost"} size="sm" onClick={rulesPanel.toggle}
                aria-label="Règles" aria-pressed={rulesPanel.isOpen} title="Règles (Ctrl+K pour rechercher)">
                <ScrollText data-icon="inline-start" /><span className="hidden sm:inline">Règles</span>
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
            {view.page === "rooms" && <RoomList onOpen={(id) => setView({ page: "room", id })} />}
            {view.page === "room" && (
              <RoomPage key={view.id} id={view.id} onBack={back} onGone={() => setView({ page: "rooms" })} />
            )}
            {view.page === "join" && <JoinRoom code={view.code} />}
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
