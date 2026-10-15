import {
  ArrowLeft, Check, Copy, Crown, FileText, LogOut, Pencil, Plus, RefreshCw, Send, Skull, Trash2, UserPlus, Users, UserX, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  api, type Character, type ChatMessage, type Instance, type InstanceVisibility, type Room, type RoomCharacter, type UserPublic,
} from "@/api/client";
import { useUser } from "@/auth/AuthContext";
import InstanceCard from "@/components/room/InstanceCard";
import type { StatusActions, StatusColor } from "@/components/room/StatusTags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannel, WS_FORBIDDEN } from "@/hooks/useChannel";
import { useRules } from "@/hooks/useRules";
import { formatInviteCode, inviteLink, isLocalOnly } from "@/lib/rooms";
import { cn } from "@/lib/utils";
import CharacterSheet from "./CharacterSheet";
import { KIND_LABELS } from "./CharacterEditor";

type Props = {
  id: number;
  onBack: () => void;
  /** Après avoir quitté, été exclu, ou supprimé la room. */
  onGone: () => void;
};

const HISTORY_PAGE = 50;
const path = (room_id: number) => ({ params: { path: { room_id } } });
/** Personnages en jeu dans l'ordre choisi par le MJ. */
const byPosition = (list: Instance[]) => [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);

/**
 * Une room. Au centre, les personnages en jeu et leurs moniteurs ; à droite, les membres (présence)
 * au-dessus du chat. Invitation et liste des personnages s'ouvrent à la demande, les fiches dans
 * une fenêtre par-dessus la room.
 *
 * Temps réel (canal `room:<id>`) : présence, chat, moniteurs, propositions de personnages.
 * Le reste (membres, nom) est relu après chaque action.
 */
export default function RoomPage({ id, onBack, onGone }: Props) {
  const user = useUser();
  const rules = useRules();
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [online, setOnline] = useState<number[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [mine, setMine] = useState<Character[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  // PJ que le MJ s'apprête à retirer de la room depuis sa carte.
  const [removingPc, setRemovingPc] = useState<Instance["character"] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [monstersOpen, setMonstersOpen] = useState(false);
  // Fiche affichée par-dessus la room.
  const [sheetId, setSheetId] = useState<number | null>(null);

  const isGM = room?.gm.id === user.id;

  const load = useCallback(() => {
    api.GET("/api/rooms/{room_id}", path(id)).then(({ data }) => (data ? setRoom(data) : setMissing(true)));
  }, [id]);
  useEffect(load, [load]);
  const loadInstances = useCallback(() => {
    api.GET("/api/rooms/{room_id}/instances", path(id)).then(({ data }) => data && setInstances(data));
  }, [id]);
  useEffect(loadInstances, [loadInstances]);
  useEffect(() => {
    api.GET("/api/rooms/{room_id}/messages", { params: { path: { room_id: id }, query: { limit: HISTORY_PAGE } } })
      .then(({ data }) => { setMessages(data ?? []); setHasOlder((data?.length ?? 0) === HISTORY_PAGE); });
    api.GET("/api/characters").then(({ data }) => setMine((data ?? []).filter((c) => c.owner?.id === user.id)));
  }, [id, user.id]);

  const addMessage = (m: ChatMessage) =>
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
  // Ajout ou mise à jour : un monstre ajouté, ou qui devient visible pour un joueur, arrive comme une nouvelle instance,
  // à sa place dans l'ordre choisi par le MJ.
  const putInstance = (i: Instance) => setInstances((prev) => byPosition(
    prev.some((p) => p.id === i.id) ? prev.map((p) => (p.id === i.id ? i : p)) : [...prev, i]));
  const dropInstance = (instanceId: number) => setInstances((prev) => prev.filter((p) => p.id !== instanceId));

  // Monstres (MJ) : mise en jeu d'un exemplaire, visibilité, retrait.
  const addMonster = async (character_id: number) => {
    const { data } = await api.POST("/api/rooms/{room_id}/instances", { ...path(id), body: { character_id } });
    if (data) { putInstance(data); toast.success(`${data.character.name} ajouté, caché aux joueurs`); }
    else toast.error("Ajout impossible");
  };
  const setVisibility = async (instanceId: number, visibility: InstanceVisibility) => {
    const { data } = await api.PUT("/api/rooms/{room_id}/instances/{instance_id}/visibility",
      { params: { path: { room_id: id, instance_id: instanceId } }, body: { visibility } });
    if (data) putInstance(data);
    else toast.error("Action impossible");
  };
  const removeInstance = async (instanceId: number) => {
    const { error } = await api.DELETE("/api/rooms/{room_id}/instances/{instance_id}",
      { params: { path: { room_id: id, instance_id: instanceId } } });
    if (error) toast.error("Retrait impossible");
    else dropInstance(instanceId);
  };

  const changeMonitors = async (instanceId: number, body: { delta?: Record<string, number>; set?: Record<string, number> }) => {
    const { data } = await api.PATCH("/api/rooms/{room_id}/instances/{instance_id}",
      { params: { path: { room_id: id, instance_id: instanceId } }, body });
    if (data) putInstance(data);
    else toast.error("Modification impossible");
  };
  // MJ : déplacer un personnage en jeu d'un cran (avant : -1, après : +1). L'ordre est le même pour tous.
  const moveInstance = async (instanceId: number, step: -1 | 1) => {
    const ids = instances.map((i) => i.id);
    const from = ids.indexOf(instanceId);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const { data } = await api.PUT("/api/rooms/{room_id}/instances/order", { ...path(id), body: { ids } });
    if (data) setInstances(data);
    else { toast.error("Déplacement impossible"); loadInstances(); }
  };
  const changeGodResource = async (instanceId: number, body: { god: string; name: string; delta: number }) => {
    const { data } = await api.PATCH("/api/rooms/{room_id}/instances/{instance_id}/god-resources",
      { params: { path: { room_id: id, instance_id: instanceId } }, body });
    if (data) putInstance(data);
    else toast.error("Modification impossible");
  };
  const resync = async (instanceId: number) => {
    const { data } = await api.POST("/api/rooms/{room_id}/instances/{instance_id}/resync",
      { params: { path: { room_id: id, instance_id: instanceId } } });
    if (data) { putInstance(data); toast.success(`${data.character.name} : max repris de la fiche`); }
    else toast.error("Resynchronisation impossible");
  };

  // Statuts (tags libres) des personnages en jeu. Les cachés n'arrivent qu'au MJ, filtrés par le serveur.
  const statusActions = (instanceId: number): StatusActions => {
    const p = { params: { path: { room_id: id, instance_id: instanceId } } };
    const done = (data: Instance | undefined, failure: string) => {
      if (data) putInstance(data);
      else toast.error(failure);
      return !!data;
    };
    const patch = async (statusId: string, body: { hidden?: boolean; color?: StatusColor }) => {
      done((await api.PATCH("/api/rooms/{room_id}/instances/{instance_id}/statuses/{status_id}",
        { params: { path: { ...p.params.path, status_id: statusId } }, body })).data, "Action impossible");
    };
    return {
      onAdd: async (label, hidden, color) =>
        done((await api.POST("/api/rooms/{room_id}/instances/{instance_id}/statuses",
          { ...p, body: { label, hidden, color } })).data, "Statut non ajouté"),
      onRemove: async (statusId) => {
        done((await api.DELETE("/api/rooms/{room_id}/instances/{instance_id}/statuses/{status_id}",
          { params: { path: { ...p.params.path, status_id: statusId } } })).data, "Statut non retiré");
      },
      onRecolor: (statusId, color) => patch(statusId, { color }),
      onToggleHidden: (statusId, hidden) => patch(statusId, { hidden }),
    };
  };
  // Statuts déjà utilisés dans la room (un par intitulé, avec sa couleur), proposés à la saisie.
  const statusSuggestions = [...new Map(instances.flatMap((i) => i.statuses ?? [])
    .map((s) => [s.label.toLocaleLowerCase(), { label: s.label, color: s.color ?? "neutre" }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));

  // Personnages qu'on vient de retirer soi-même : pas de « refusé par le MJ » si le signal arrive avant la réponse.
  const withdrawn = useRef(new Set<number>());

  // Propositions et décisions poussées par le serveur : on relit la room, et on signale ce qui nous concerne.
  const refreshCharacters = async () => {
    const { data } = await api.GET("/api/rooms/{room_id}", path(id));
    if (!data) return;
    const before = new Map((room?.characters ?? []).map((rc) => [rc.character.id, rc.status]));
    const after = new Map(data.characters.map((rc) => [rc.character.id, rc]));
    if (data.gm.id === user.id) {
      for (const rc of data.characters) {
        if (rc.status === "pending" && !before.has(rc.character.id)) {
          toast.info(`${rc.character.owner?.username} propose ${rc.character.name}`);
        }
      }
    } else {
      for (const [cid, status] of before) {
        const rc = room?.characters.find((r) => r.character.id === cid);
        if (status !== "pending" || rc?.character.owner?.id !== user.id) continue;
        if (after.get(cid)?.status === "accepted") toast.success(`${rc.character.name} est accepté par le MJ`);
        else if (!after.has(cid) && !withdrawn.current.has(cid)) toast.info(`${rc.character.name} n'a pas été retenu par le MJ`);
      }
    }
    setRoom(data);
  };

  useChannel(room ? `room:${id}` : null, (event) => {
    if (event.type === "room.presence") setOnline(event.online);
    if (event.type === "room.message") addMessage(event.message);
    if (event.type === "room.characters") { refreshCharacters(); loadInstances(); }
    if (event.type === "room.instance") putInstance(event.instance);
    if (event.type === "room.instance.removed") dropInstance(event.id);
    if (event.type === "room.instances.order") loadInstances();
  }, (code) => {
    if (code === WS_FORBIDDEN) { toast.info("Tu n'as plus accès à cette room"); onGone(); }
  });

  const loadOlder = async () => {
    const { data } = await api.GET("/api/rooms/{room_id}/messages", {
      params: { path: { room_id: id }, query: { before: messages[0]?.id, limit: HISTORY_PAGE } },
    });
    if (!data) return;
    setMessages((prev) => [...data, ...prev]);
    setHasOlder(data.length === HISTORY_PAGE);
  };

  /** Appelle une route qui renvoie la room à jour ; en cas d'échec, affiche le message du backend. */
  const act = async (call: Promise<{ data?: Room; error?: unknown }>, failure: string) => {
    const { data, error } = await call;
    if (data) setRoom(data);
    else {
      const detail = (error as { detail?: unknown } | undefined)?.detail;
      toast.error(typeof detail === "string" ? detail : failure);
    }
    return !!data;
  };

  if (missing) return <p className="text-muted-foreground">Room introuvable.</p>;
  if (!room) return <div className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  // Refuser ou retirer un personnage de la room ; un PJ sort du jeu avec (son état en jeu est effacé).
  const removeCharacter = (character_id: number) => {
    withdrawn.current.add(character_id);
    act(api.DELETE("/api/rooms/{room_id}/characters/{character_id}",
      { params: { path: { room_id: id, character_id } } }), "Action impossible");
  };

  const removeMember = async (memberId: number) => {
    const { error } = await api.DELETE("/api/rooms/{room_id}/members/{user_id}",
      { params: { path: { room_id: id, user_id: memberId } } });
    if (error) return toast.error("Action impossible");
    if (memberId === user.id) onGone();
    else load();
  };

  const deleteRoom = async () => {
    const { error } = await api.DELETE("/api/rooms/{room_id}", path(id));
    if (error) toast.error("Suppression impossible");
    else { toast.success(`${room.name} supprimée`); onGone(); }
  };

  const rename = async () => {
    if (renaming?.trim() && await act(api.PATCH("/api/rooms/{room_id}", { ...path(id), body: { name: renaming.trim() } }),
      "Renommage impossible")) setRenaming(null);
  };

  const pendingCount = room.characters.filter((rc) => rc.status === "pending").length;
  // Monstres que le MJ peut mettre en jeu : les siens, et ceux des joueurs acceptés dans la room.
  const monsterChoices = [...new Map([
    ...mine.filter((c) => c.kind === "monstre").map((c) => ({ id: c.id, name: c.name, species: c.species, owner: c.owner })),
    ...room.characters.filter((rc) => rc.status === "accepted" && rc.character.kind === "monstre").map((rc) => rc.character),
  ].map((c) => [c.id, c])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const inPlayCount = (cid: number) => instances.filter((i) => i.character.id === cid).length;
  // Fiche lisible : tout pour le MJ ; pour un joueur, pas les monstres du MJ qui ne sont pas dans la room.
  const canReadSheet = (i: Instance) =>
    isGM || i.character.kind !== "monstre" || room.characters.some((rc) => rc.character.id === i.character.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Retour" onClick={onBack}><ArrowLeft /></Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">
              {room.name}
              {isGM && (
                <Button variant="ghost" size="icon-sm" className="ml-1 align-middle" aria-label="Renommer"
                  onClick={() => setRenaming(room.name)}><Pencil /></Button>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{isGM ? "Tu es le MJ de cette room." : `MJ : ${room.gm.username}`}</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setCharactersOpen(true)}>
            <Users data-icon="inline-start" />Personnages
            {isGM && pendingCount > 0 && <Badge title="Propositions à valider">{pendingCount}</Badge>}
          </Button>
          {isGM && (
            <Button variant="outline" onClick={() => setMonstersOpen(true)}><Skull data-icon="inline-start" />Ajouter un monstre</Button>
          )}
          {isGM && room.invite_code && (
            <InvitePopover room={room} onUpdate={act}
              onAdd={(username) => act(api.POST("/api/rooms/{room_id}/members", { ...path(id), body: { username } }),
                "Aucun compte avec cet identifiant")} />
          )}
          {isGM ? (
            <Button variant="ghost" onClick={() => setConfirm("delete")}><Trash2 data-icon="inline-start" />Supprimer</Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm("leave")}><LogOut data-icon="inline-start" />Quitter</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">En jeu</h2>
          {!rules ? (
            <Skeleton className="h-48" />
          ) : instances.length === 0 ? (
            <Card className="items-center py-10 text-center">
              <CardDescription className="max-w-sm">
                Aucun personnage en jeu. Un PJ y entre dès que le MJ l'accepte (bouton « Personnages ») ;
                le MJ y met ses monstres avec « Ajouter un monstre ».
              </CardDescription>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-x-12 gap-y-8 pb-4">
              {instances.map((i, index) => (
                <InstanceCard key={i.id} instance={i} defs={rules.monitors} canEdit={isGM || i.character.kind === "pj"}
                  onMoveBefore={isGM && index > 0 ? () => moveInstance(i.id, -1) : undefined}
                  onMoveAfter={isGM && index < instances.length - 1 ? () => moveInstance(i.id, 1) : undefined}
                  isGM={isGM} statusSuggestions={statusSuggestions} statusActions={statusActions(i.id)}
                  onDelta={(m, d) => changeMonitors(i.id, { delta: { [m]: d } })}
                  onSet={(m, v) => changeMonitors(i.id, { set: { [m]: v } })}
                  onGodResource={(god, name, delta) => changeGodResource(i.id, { god, name, delta })}
                  onResync={() => resync(i.id)} onSheet={canReadSheet(i) ? () => setSheetId(i.character.id) : undefined}
                  onVisibility={isGM && i.character.kind !== "pj" ? (v) => setVisibility(i.id, v) : undefined}
                  onRemove={!isGM ? undefined
                    : i.character.kind === "pj" ? () => setRemovingPc(i.character) : () => removeInstance(i.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Membres au-dessus du chat, collés en haut de l'écran sur grand écran. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-[calc(100svh-7rem)]">
          <MembersCard room={room} online={online} isGM={isGM} currentUser={user} onRemove={removeMember} />
          <ChatCard roomId={id} messages={messages} hasOlder={hasOlder} currentUser={user}
            onOlder={loadOlder} onSent={addMessage} />
        </aside>
      </div>

      <Dialog open={charactersOpen} onOpenChange={setCharactersOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Personnages de la room</DialogTitle>
            <DialogDescription>
              {isGM ? "Les joueurs proposent leurs personnages, tu les acceptes ou les refuses."
                : "Propose tes personnages (PJ, animaux de compagnie...) au MJ. Tout le monde voit les fiches acceptées."}
            </DialogDescription>
          </DialogHeader>
          <CharactersList room={room} isGM={isGM} currentUser={user} mine={mine} onSheet={setSheetId}
            onSubmit={(character_id) => act(api.POST("/api/rooms/{room_id}/characters", { ...path(id), body: { character_id } }),
              "Proposition impossible")}
            onAccept={(character_id) => act(api.POST("/api/rooms/{room_id}/characters/{character_id}/accept",
              { params: { path: { room_id: id, character_id } } }), "Action impossible")}
            onRemove={removeCharacter} />
        </DialogContent>
      </Dialog>

      <Dialog open={monstersOpen} onOpenChange={setMonstersOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un monstre</DialogTitle>
            <DialogDescription>
              Tes monstres et ceux des joueurs acceptés dans la room. Chaque clic ajoute un exemplaire, caché aux joueurs :
              tu le montres ou le révèles depuis sa plaquette.
            </DialogDescription>
          </DialogHeader>
          {monsterChoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun monstre : crée-en un depuis la liste « Monstres ».</p>
          ) : (
            <ul className="flex max-h-[60svh] flex-col gap-1 overflow-y-auto">
              {monsterChoices.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[m.species, m.owner && m.owner.id !== user.id ? `à ${m.owner.username}` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {inPlayCount(m.id) > 0 && <Badge variant="secondary">{inPlayCount(m.id)} en jeu</Badge>}
                  <Button size="sm" onClick={() => addMonster(m.id)}><Plus data-icon="inline-start" />Ajouter</Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sheetId !== null} onOpenChange={(open) => !open && setSheetId(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
          <DialogTitle className="sr-only">Fiche du personnage</DialogTitle>
          {sheetId !== null && <CharacterSheet key={sheetId} id={sheetId} embedded />}
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? `Supprimer ${room.name} ?` : `Quitter ${room.name} ?`}</DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "Le chat est effacé. Les personnages ne sont pas supprimés, ils sortent juste de la room."
                : "Tes personnages sortent de la room. Tu pourras revenir avec le code d'invitation."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={() => (confirm === "delete" ? deleteRoom() : removeMember(user.id))}>
              {confirm === "delete" ? "Supprimer" : "Quitter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removingPc !== null} onOpenChange={(open) => !open && setRemovingPc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer {removingPc?.name} de la room ?</DialogTitle>
            <DialogDescription>
              Il sort du jeu : son état en jeu (dégâts, statuts) est effacé. Sa fiche est conservée,
              et {removingPc?.owner?.username ?? "son joueur"} pourra le proposer de nouveau.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={() => { if (removingPc) removeCharacter(removingPc.id); setRemovingPc(null); }}>
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renommer la room</DialogTitle></DialogHeader>
          <Input value={renaming ?? ""} maxLength={100} onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rename()} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button onClick={rename} disabled={!renaming?.trim()}>Renommer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Act = (call: Promise<{ data?: Room; error?: unknown }>, failure: string) => Promise<boolean>;

/** MJ : code et lien d'invitation, nouveau code, ajout direct d'un joueur par identifiant. */
function InvitePopover({ room, onUpdate, onAdd }: { room: Room; onUpdate: Act; onAdd: (username: string) => Promise<boolean> }) {
  const code = room.invite_code!;
  const [username, setUsername] = useState("");
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copié`); }
    catch { toast.error("Copie impossible"); }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await onAdd(username.trim())) { toast.success(`${username.trim()} ajouté`); setUsername(""); }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline"><UserPlus data-icon="inline-start" />Inviter</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Invitation</PopoverTitle>
          <PopoverDescription>Donne ce code ou ce lien aux joueurs.</PopoverDescription>
        </PopoverHeader>
        <code className="block rounded-md border bg-muted px-3 py-1.5 text-center font-mono text-lg tracking-widest">
          {formatInviteCode(code)}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(formatInviteCode(code), "Code")}><Copy data-icon="inline-start" />Code</Button>
          <Button variant="outline" size="sm" onClick={() => copy(inviteLink(code), "Lien")}><Copy data-icon="inline-start" />Lien</Button>
          <Button variant="ghost" size="sm" title="L'ancien code ne marchera plus" onClick={() => onUpdate(
            api.POST("/api/rooms/{room_id}/invite-code", path(room.id)), "Impossible de changer le code")}>
            <RefreshCw data-icon="inline-start" />Nouveau code
          </Button>
        </div>
        {isLocalOnly() && (
          <p className="text-xs text-muted-foreground">
            App ouverte avec <code>{location.host}</code> : le lien ne marchera que sur cette machine. Ouvre l'app avec
            l'adresse réseau de la machine (ex. <code>http://192.168.x.x:{location.port || 80}</code>) avant de le copier.
          </p>
        )}
        <Separator />
        <form className="flex flex-col gap-2" onSubmit={add}>
          <span className="text-sm font-medium">Ajouter directement</span>
          <div className="flex gap-2">
            <Input placeholder="Identifiant du joueur" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!username.trim()}>Ajouter</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function OnlineDot({ on }: { on: boolean }) {
  return <span className={cn("size-2 shrink-0 rounded-full", on ? "bg-emerald-500" : "bg-muted-foreground/30")}
    title={on ? "En ligne" : "Hors ligne"} />;
}

/** Membres, connectés en premier. */
function MembersCard({ room, online, isGM, currentUser, onRemove }: {
  room: Room; online: number[]; isGM: boolean; currentUser: UserPublic; onRemove: (userId: number) => void;
}) {
  const people = [{ user: room.gm, gm: true }, ...room.members.map((m) => ({ user: m.user, gm: false }))]
    .sort((a, b) => Number(online.includes(b.user.id)) - Number(online.includes(a.user.id)));
  return (
    <Card size="sm" className="shrink-0">
      <CardHeader>
        <CardTitle className="font-heading text-base">Membres</CardTitle>
        <CardDescription>{online.length} en ligne sur {people.length}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {people.map(({ user, gm }) => {
            const on = online.includes(user.id);
            return (
              <li key={user.id} className="group flex h-7 items-center gap-2 text-sm">
                <OnlineDot on={on} />
                <span className={cn(!on && "text-muted-foreground", user.id === currentUser.id && "font-medium")}>
                  {user.username}
                </span>
                {gm && <Badge variant="secondary"><Crown />MJ</Badge>}
                {isGM && !gm && (
                  <Button variant="ghost" size="icon-sm" className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Exclure ${user.username}`} title="Exclure" onClick={() => onRemove(user.id)}><UserX /></Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function CharactersList({ room, isGM, currentUser, mine, onSheet, onSubmit, onAccept, onRemove }: {
  room: Room; isGM: boolean; currentUser: UserPublic; mine: Character[]; onSheet: (id: number) => void;
  onSubmit: (id: number) => Promise<boolean>; onAccept: (id: number) => void; onRemove: (id: number) => void;
}) {
  const [choice, setChoice] = useState("");
  const inRoom = new Set(room.characters.map((rc) => rc.character.id));
  const available = mine.filter((c) => !inRoom.has(c.id));
  const accepted = room.characters.filter((rc) => rc.status === "accepted");
  const pending = room.characters.filter((rc) => rc.status === "pending");

  const row = (rc: RoomCharacter) => {
    const c = rc.character;
    const own = c.owner?.id === currentUser.id;
    return (
      <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
        <button className="font-medium hover:underline" onClick={() => onSheet(c.id)}>{c.name}</button>
        <Badge variant="outline">{KIND_LABELS[c.kind]}</Badge>
        {c.species && <span className="capitalize text-muted-foreground">{c.species}</span>}
        <span className="text-muted-foreground">· {own ? "à toi" : c.owner?.username}</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Fiche" title="Fiche" onClick={() => onSheet(c.id)}><FileText /></Button>
          {isGM && rc.status === "pending" && (
            <Button variant="ghost" size="icon-sm" aria-label="Accepter" title="Accepter" onClick={() => onAccept(c.id)}><Check /></Button>
          )}
          {(isGM || own) && (
            <Button variant="ghost" size="icon-sm" title={rc.status === "pending" && isGM && !own ? "Refuser" : "Retirer de la room"}
              aria-label="Retirer" onClick={() => onRemove(c.id)}><X /></Button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="flex max-h-[60svh] flex-col gap-4 overflow-y-auto">
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isGM ? "Propositions à valider" : "En attente du MJ"}
          </h3>
          <ul className="flex flex-col gap-2">{pending.map(row)}</ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dans la room</h3>
        {accepted.length === 0
          ? <p className="text-sm text-muted-foreground">Aucun personnage pour l'instant.</p>
          : <ul className="flex flex-col gap-2">{accepted.map(row)}</ul>}
      </div>
      {available.length > 0 && (
        <div className="flex gap-2">
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir un de mes personnages" /></SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name} ({KIND_LABELS[c.kind ?? "pj"]})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!choice}
            onClick={async () => { if (await onSubmit(Number(choice))) setChoice(""); }}>
            {isGM ? "Ajouter" : "Proposer"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Chat de table (servira aussi de journal de la partie). */
function ChatCard({ roomId, messages, hasOlder, currentUser, onOlder, onSent }: {
  roomId: number; messages: ChatMessage[]; hasOlder: boolean; currentUser: UserPublic;
  onOlder: () => void; onSent: (m: ChatMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  // Défile en bas de la zone du chat à chaque nouveau message (pas quand on charge les plus anciens),
  // sans faire défiler la page.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const { data } = await api.POST("/api/rooms/{room_id}/messages", { ...path(roomId), body: { body } });
    setSending(false);
    if (data) { onSent(data); setBody(""); }
    else toast.error("Message non envoyé");
  };

  return (
    <Card size="sm" className="flex min-h-96 flex-1 flex-col lg:min-h-0">
      <CardHeader>
        <CardTitle className="font-heading text-base">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {hasOlder && (
            <Button variant="ghost" size="sm" className="mb-2 w-full" onClick={onOlder}>Messages plus anciens</Button>
          )}
          {messages.length === 0 && <p className="text-sm text-muted-foreground">Aucun message.</p>}
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <span className={cn("font-medium", m.author?.id === currentUser.id && "text-primary")}>
                  {m.author?.username ?? "compte supprimé"}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <form className="flex gap-2" onSubmit={send}>
          <Input placeholder="Message" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="icon" aria-label="Envoyer" disabled={sending || !body.trim()}><Send /></Button>
        </form>
      </CardContent>
    </Card>
  );
}
