import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  id: string;
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  /** Nombre de problèmes de validation dans la section. */
  issues?: number;
  action?: ReactNode;
  children: ReactNode;
};

/** Carte d'une étape de l'éditeur ; `id` sert d'ancre à la navigation latérale. */
export default function Section({ id, title, icon: Icon, description, issues = 0, action, children }: Props) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Icon className="size-4 text-primary" />
          {title}
          {issues > 0 && <Badge variant="destructive">{issues}</Badge>}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Libellé + contrôle, alignés en grille. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
