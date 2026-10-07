import { MoreHorizontal, Plus, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Character, type CharacterKind } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannel } from "@/hooks/useChannel";
import { useRules } from "@/hooks/useRules";
import { KIND_LABELS } from "./CharacterEditor";

type Props = {
  kind: CharacterKind;
  onKindChange: (kind: CharacterKind) => void;
  onOpen: (id: number | null) => void;
};

const NEW_LABEL: Record<CharacterKind, string> = { pj: "Nouveau PJ", pnj: "Nouveau PNJ", monstre: "Nouveau monstre" };

export default function CharacterList({ kind, onKindChange, onOpen }: Props) {
  const rules = useRules();
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [toDelete, setToDelete] = useState<Character | null>(null);

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

  const roleLabel = (key: string) => rules?.roles[key]?.label ?? key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Personnages</h1>
          <p className="text-sm text-muted-foreground">Joueurs, personnages non joueurs et créatures de la campagne.</p>
        </div>
        <Button onClick={() => onOpen(null)}><Plus data-icon="inline-start" />{NEW_LABEL[kind]}</Button>
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
                  </CardDescription>
                  <CardAction onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
    </div>
  );
}
