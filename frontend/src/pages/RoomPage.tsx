import {
  ArrowLeft, Check, Copy, Crown, FileText, LogOut, Pencil, RefreshCw, Send, Trash2, UserPlus, UserX, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type Character, type ChatMessage, type Room, type RoomCharacter, type UserPublic } from "@/api/client";
import { useUser } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannel, WS_FORBIDDEN } from "@/hooks/useChannel";
import { formatInviteCode, inviteLink, isLocalOnly } from "@/lib/rooms";
import { cn } from "@/lib/utils";
import { KIND_LABELS } from "./CharacterEditor";

type Props = {
  id: number;
  onBack: () => void;
  /** Après avoir quitté, été exclu, ou supprimé la room. */
  onGone: () => void;
  onSheet: (characterId: number) => void;
};

const HISTORY_PAGE = 50;
const path = (room_id: number) => ({ params: { path: { room_id } } });

/**
 * Une room. Temps réel : la présence et le chat (canal `room:<id>`). Le reste (membres, personnages)
 * est relu après chaque action.
 */
export default function RoomPage({ id, onBack, onGone, onSheet }: Props) {
  const user = useUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [online, setOnline] = useState<number[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [mine, setMine] = useState<Character[]>([]);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const isGM = room?.gm.id === user.id;

  const load = useCallback(() => {
    api.GET("/api/rooms/{room_id}", path(id)).then(({ data }) => (data ? setRoom(data) : setMissing(true)));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    api.GET("/api/rooms/{room_id}/messages", { params: { path: { room_id: id }, query: { limit: HISTORY_PAGE } } })
      .then(({ data }) => { setMessages(data ?? []); setHasOlder((data?.length ?? 0) === HISTORY_PAGE); });
    api.GET("/api/characters").then(({ data }) => setMine((data ?? []).filter((c) => c.owner?.id === user.id)));
  }, [id, user.id]);

  const addMessage = (m: ChatMessage) =>
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));

  useChannel(room ? `room:${id}` : null, (event) => {
    if (event.type === "room.presence") setOnline(event.online);
    if (event.type === "room.message") addMessage(event.message);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Retour" onClick={onBack}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {room.name}
            {isGM && (
              <Button variant="ghost" size="icon-sm" aria-label="Renommer" onClick={() => setRenaming(room.name)}><Pencil /></Button>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">{isGM ? "Tu es le MJ de cette room." : `MJ : ${room.gm.username}`}</p>
        </div>
        {isGM ? (
          <Button variant="outline" onClick={() => setConfirm("delete")}><Trash2 data-icon="inline-start" />Supprimer la room</Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirm("leave")}><LogOut data-icon="inline-start" />Quitter</Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {isGM && room.invite_code && <InviteCard room={room} onUpdate={act} />}
          <MembersCard room={room} online={online} isGM={isGM} currentUser={user}
            onAdd={(username) => act(api.POST("/api/rooms/{room_id}/members", { ...path(id), body: { username } }),
              "Aucun compte avec cet identifiant")}
            onRemove={removeMember} />
          <CharactersCard room={room} isGM={isGM} currentUser={user} mine={mine} onSheet={onSheet}
            onSubmit={(character_id) => act(api.POST("/api/rooms/{room_id}/characters", { ...path(id), body: { character_id } }),
              "Proposition impossible")}
            onAccept={(character_id) => act(api.POST("/api/rooms/{room_id}/characters/{character_id}/accept",
              { params: { path: { room_id: id, character_id } } }), "Action impossible")}
            onRemove={(character_id) => act(api.DELETE("/api/rooms/{room_id}/characters/{character_id}",
              { params: { path: { room_id: id, character_id } } }), "Action impossible")} />
        </div>
        <ChatCard roomId={id} messages={messages} hasOlder={hasOlder} currentUser={user}
          onOlder={loadOlder} onSent={addMessage} />
      </div>

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

function InviteCard({ room, onUpdate }: { room: Room; onUpdate: Act }) {
  const code = room.invite_code!;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copié`); }
    catch { toast.error("Copie impossible"); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Invitation</CardTitle>
        <CardDescription>Donne ce code ou ce lien aux joueurs. Un nouveau code rend l'ancien inutilisable.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-lg tracking-widest">{formatInviteCode(code)}</code>
        <Button variant="outline" size="sm" onClick={() => copy(formatInviteCode(code), "Code")}><Copy data-icon="inline-start" />Code</Button>
        <Button variant="outline" size="sm" onClick={() => copy(inviteLink(code), "Lien")}><Copy data-icon="inline-start" />Lien</Button>
        <Button variant="ghost" size="sm" onClick={() => onUpdate(
          api.POST("/api/rooms/{room_id}/invite-code", path(room.id)), "Impossible de changer le code")}>
          <RefreshCw data-icon="inline-start" />Nouveau code
        </Button>
        {isLocalOnly() && (
          <p className="basis-full text-xs text-muted-foreground">
            Tu as ouvert l'app avec <code>{location.host}</code> : le lien ne marchera que sur cette machine.
            Pour les joueurs sur le même wifi, ouvre l'app avec l'adresse réseau de la machine
            (par ex. <code>http://192.168.x.x:{location.port || 80}</code>, voir le README), puis copie le lien.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OnlineDot({ on }: { on: boolean }) {
  return <span className={cn("size-2 shrink-0 rounded-full", on ? "bg-emerald-500" : "bg-muted-foreground/30")}
    title={on ? "En ligne" : "Hors ligne"} />;
}

function MembersCard({ room, online, isGM, currentUser, onAdd, onRemove }: {
  room: Room; online: number[]; isGM: boolean; currentUser: UserPublic;
  onAdd: (username: string) => Promise<boolean>; onRemove: (userId: number) => void;
}) {
  const [username, setUsername] = useState("");
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await onAdd(username.trim())) setUsername("");
  };
  const people: { user: UserPublic; gm: boolean }[] = [
    { user: room.gm, gm: true }, ...room.members.map((m) => ({ user: m.user, gm: false })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Membres</CardTitle>
        <CardDescription>{online.length} en ligne sur {people.length}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {people.map(({ user, gm }) => (
            <li key={user.id} className="flex items-center gap-2 text-sm">
              <OnlineDot on={online.includes(user.id)} />
              <span className={cn(user.id === currentUser.id && "font-medium")}>{user.username}</span>
              {gm && <Badge variant="secondary"><Crown />MJ</Badge>}
              {isGM && !gm && (
                <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Exclure ${user.username}`}
                  title="Exclure" onClick={() => onRemove(user.id)}><UserX /></Button>
              )}
            </li>
          ))}
        </ul>
        {isGM && (
          <form className="flex gap-2" onSubmit={add}>
            <Input placeholder="Identifiant du joueur" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!username.trim()}><UserPlus data-icon="inline-start" />Ajouter</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CharactersCard({ room, isGM, currentUser, mine, onSheet, onSubmit, onAccept, onRemove }: {
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
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Personnages</CardTitle>
        <CardDescription>
          {isGM ? "Les joueurs proposent leurs personnages, tu les acceptes ou les refuses."
            : "Propose tes personnages (PJ, animaux de compagnie...) au MJ. Tout le monde voit les fiches acceptées."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {accepted.length === 0
          ? <p className="text-sm text-muted-foreground">Aucun personnage dans la room.</p>
          : <ul className="flex flex-col gap-2">{accepted.map(row)}</ul>}
        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isGM ? "Propositions à valider" : "En attente du MJ"}
            </h3>
            <ul className="flex flex-col gap-2">{pending.map(row)}</ul>
          </div>
        )}
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
      </CardContent>
    </Card>
  );
}

function ChatCard({ roomId, messages, hasOlder, currentUser, onOlder, onSent }: {
  roomId: number; messages: ChatMessage[]; hasOlder: boolean; currentUser: UserPublic;
  onOlder: () => void; onSent: (m: ChatMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  // Défile vers le bas à chaque nouveau message (pas quand on charge les plus anciens).
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lastId]);

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
    <Card className="flex max-h-[calc(100svh-8rem)] min-h-96 flex-col lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle className="font-heading text-base">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
          <div ref={bottom} />
        </div>
        <form className="flex gap-2" onSubmit={send}>
          <Input placeholder="Message" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="icon" aria-label="Envoyer" disabled={sending || !body.trim()}><Send /></Button>
        </form>
      </CardContent>
    </Card>
  );
}
