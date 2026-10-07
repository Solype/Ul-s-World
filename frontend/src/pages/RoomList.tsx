import { DoorOpen, Plus, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type RoomSummary } from "@/api/client";
import { useUser } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { onOpen: (id: number) => void };

/** Rooms dont on est MJ ou joueur ; on en crée une (on en devient le MJ) ou on en rejoint une par code. */
export default function RoomList({ onOpen }: Props) {
  const user = useUser();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    api.GET("/api/rooms").then(({ data }) => setRooms(data ?? []));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { data } = await api.POST("/api/rooms", { body: { name: name.trim() } });
    if (data) onOpen(data.id);
    else toast.error("Création impossible");
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const { data } = await api.POST("/api/rooms/join", { body: { code } });
    if (data) onOpen(data.id);
    else toast.error("Code d'invitation inconnu");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Rooms</h1>
        <p className="text-sm text-muted-foreground">Les tables de jeu : celles que tu mènes en MJ et celles où tu joues.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Créer une room</CardTitle>
            <CardDescription>Tu en seras le MJ.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={create}>
              <Input placeholder="Nom de la room" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" disabled={!name.trim()}><Plus data-icon="inline-start" />Créer</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Rejoindre une room</CardTitle>
            <CardDescription>Avec le code donné par le MJ.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={join}>
              <Input placeholder="ABCD-EFGH" value={code} className="font-mono uppercase"
                onChange={(e) => setCode(e.target.value)} />
              <Button type="submit" variant="outline" disabled={code.trim().length < 4}>
                <DoorOpen data-icon="inline-start" />Rejoindre
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {rooms === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : rooms.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <Users className="size-10 text-muted-foreground" />
          <CardDescription>Aucune room pour l'instant.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <Card key={r.id} className="cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
              onClick={() => onOpen(r.id)}>
              <CardHeader>
                <CardTitle className="font-heading text-base">{r.name}</CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  {r.gm.id === user.id ? <Badge>MJ</Badge> : <span>MJ : {r.gm.username}</span>}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
