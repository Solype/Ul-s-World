import { FileJson, FileText, MoreHorizontal, Plus, Printer, Trash2, UserRound, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Character, type CharacterKind, type UserPublic } from "@/api/client";
import { useUser } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannel } from "@/hooks/useChannel";
import { useRules } from "@/hooks/useRules";
import { KIND_LABELS } from "./CharacterEditor";

type Props = {
  kind: CharacterKind;
  onKindChange: (kind: CharacterKind) => void;
  onOpen: (id: number | null) => void;
  /** Fiche à lire ou imprimer. */
  onSheet: (id: number) => void;
};

const NEW_LABEL: Record<CharacterKind, string> = { pj: "Nouveau PJ", pnj: "Nouveau PNJ", monstre: "Nouveau monstre" };

export default function CharacterList({ kind, onKindChange, onOpen, onSheet }: Props) {
  const rules = useRules();
  const user = useUser();
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [toDelete, setToDelete] = useState<Character | null>(null);
  // Admin : changement de propriétaire.
  const [toReassign, setToReassign] = useState<Character | null>(null);
  const [newOwner, setNewOwner] = useState<string>("");
  const [users, setUsers] = useState<UserPublic[]>([]);
  useEffect(() => {
    if (user.is_admin) api.GET("/api/users").then(({ data }) => setUsers(data ?? []));
  }, [user.is_admin]);

  const load = useCallback(() => {
    api.GET("/api/characters", { params: { query: { kind } } }).then(({ data }) => setCharacters(data ?? []));
  }, [kind]);
  useEffect(load, [load]);
  // Rafraîchit la liste quand un autre client crée, modifie ou supprime un personnage.
  useChannel("characters", load);

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await api.DELETE("/api/characters/{character_id}", { params: { path: { character_id: toDelete.id } } });
    if (error) toast.error("Suppression impossible");
    else toast.success(`${toDelete.name} supprimé`);
    setToDelete(null);
  };

  const openReassign = (c: Character) => {
    setNewOwner(c.owner ? String(c.owner.id) : "");
    setToReassign(c);
  };
  const reassign = async () => {
    if (!toReassign || !newOwner) return;
    const { data } = await api.PUT("/api/characters/{character_id}/owner", {
      params: { path: { character_id: toReassign.id } }, body: { owner_id: Number(newOwner) },
    });
    if (data) toast.success(`${data.name} appartient maintenant à ${data.owner?.username}`);
    else toast.error("Changement de propriétaire impossible");
    setToReassign(null);
  };

  const roleLabel = (key: string) => rules?.roles[key]?.label ?? key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Personnages</h1>
          <p className="text-sm text-muted-foreground">Joueurs, personnages non joueurs et créatures de la campagne.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="#/fiche-vierge" title="Fiche à imprimer pour créer un personnage sur papier">
              <FileText data-icon="inline-start" />Fiche vierge
            </a>
          </Button>
          <Button onClick={() => onOpen(null)}><Plus data-icon="inline-start" />{NEW_LABEL[kind]}</Button>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => onKindChange(v as CharacterKind)}>
        <TabsList>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <TabsTrigger key={k} value={k}>{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {characters === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : characters.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <UserRound className="size-10 text-muted-foreground" />
          <CardTitle className="font-heading">Aucun {KIND_LABELS[kind]} pour l'instant</CardTitle>
          <CardDescription>Commence par en créer un.</CardDescription>
          <Button variant="outline" onClick={() => onOpen(null)}><Plus data-icon="inline-start" />{NEW_LABEL[kind]}</Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => {
            const roles = [...(c.roles?.primary ?? []), ...(c.roles?.secondary ?? [])];
            return (
              <Card key={c.id} className="cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
                onClick={() => onOpen(c.id)}>
                <CardHeader>
                  <CardTitle className="font-heading text-base">{c.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-1.5">
                    <span className="capitalize">{c.species ?? "espèce ?"}</span>
                    {c.age != null && <span>· {c.age} ans</span>}
                    {c.creation_mode === "free" && <Badge variant="outline">libre</Badge>}
                    {user.is_admin && c.owner && c.owner.id !== user.id && (
                      <Badge variant="secondary"><UserRound />{c.owner.username}</Badge>
                    )}
                  </CardDescription>
                  <CardAction onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onSheet(c.id)}><Printer />Fiche imprimable</DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/characters/${c.id}/export`} download><FileJson />Exporter (JSON)</a>
                        </DropdownMenuItem>
                        {user.is_admin && (
                          <DropdownMenuItem onSelect={() => openReassign(c)}><UserRoundCog />Changer de propriétaire</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)}>
                          <Trash2 />Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Aucun rôle</span>
                    ) : (
                      roles.map((r, i) => (
                        <Badge key={r} variant={i < (c.roles?.primary?.length ?? 0) ? "default" : "secondary"}>{roleLabel(r)}</Badge>
                      ))
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Modifié le {new Date(c.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {toDelete?.name} ?</DialogTitle>
            <DialogDescription>Cette action est définitive.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={remove}><Trash2 data-icon="inline-start" />Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={toReassign !== null} onOpenChange={(open) => !open && setToReassign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propriétaire de {toReassign?.name}</DialogTitle>
            <DialogDescription>Le nouveau propriétaire pourra le voir et le modifier, l'ancien non.</DialogDescription>
          </DialogHeader>
          <Select value={newOwner} onValueChange={setNewOwner}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button onClick={reassign} disabled={!newOwner || String(toReassign?.owner?.id) === newOwner}>
              <UserRoundCog data-icon="inline-start" />Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
