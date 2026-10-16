import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { LogIn, Swords, UserPlus } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import DownloadApp from "@/components/DownloadApp";
import ThemeToggle from "@/components/ThemeToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "login" | "register";

/** Message lisible à partir d'une erreur de l'API (texte simple, ou liste d'erreurs de validation). */
function errorMessage(detail: unknown, mode: Mode): string {
  if (typeof detail === "string") return detail;
  return mode === "register"
    ? "Identifiant de 3 à 32 caractères (lettres, chiffres, _ . -) et mot de passe d'au moins 8 caractères."
    : "Identifiant ou mot de passe incorrect";
}

export default function LoginPage() {
  const { signedIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { resolvedTheme } = useTheme();
  // Captcha Turnstile, seulement à l'inscription et si le serveur en a un (site_key non nul).
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileInstance>(undefined);
  const needsCaptcha = mode === "register" && siteKey !== null;

  useEffect(() => {
    api.GET("/api/auth/captcha").then(({ data }) => setSiteKey(data?.site_key ?? null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { username: username.trim(), password };
    const { data, error } = mode === "login"
      ? await api.POST("/api/auth/login", { body })
      : await api.POST("/api/auth/register", { body: { ...body, captcha_token: captchaToken } });
    setBusy(false);
    if (data) signedIn(data);
    else {
      setError(errorMessage((error as { detail?: unknown } | undefined)?.detail, mode));
      // Un jeton ne sert qu'une fois : on en redemande un.
      if (needsCaptcha) { setCaptchaToken(null); captcha.current?.reset(); }
    }
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <div className="absolute top-3 right-3"><ThemeToggle /></div>
      <div className="flex items-center gap-2 text-primary">
        <Swords className="size-7" />
        <span className="font-heading text-2xl font-semibold">NewMannheim</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading">{mode === "login" ? "Connexion" : "Créer un compte"}</CardTitle>
          <CardDescription>
            {mode === "login" ? "Retrouve tes personnages." : "Le premier compte créé devient administrateur."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="login">Connexion</TabsTrigger>
                <TabsTrigger value="register">Inscription</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Identifiant</Label>
              <Input id="username" autoComplete="username" autoFocus required value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" required value={password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {needsCaptcha && (
              <Turnstile ref={captcha} siteKey={siteKey} onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)} onError={() => setCaptchaToken(null)}
                options={{ language: "fr", size: "flexible", theme: resolvedTheme === "dark" ? "dark" : "light" }} />
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" disabled={busy || (needsCaptcha && !captchaToken)}>
              {mode === "login" ? <><LogIn data-icon="inline-start" />Se connecter</> : <><UserPlus data-icon="inline-start" />Créer le compte</>}
            </Button>
          </form>
        </CardContent>
      </Card>
      <DownloadApp wide className="max-w-sm" />
    </div>
  );
}
