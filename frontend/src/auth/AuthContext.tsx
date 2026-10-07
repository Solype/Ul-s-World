import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type User } from "@/api/client";

type Auth = {
  /** `undefined` tant qu'on ne sait pas encore, `null` si personne n'est connecté. */
  user: User | null | undefined;
  /** Après une connexion ou une inscription réussie. */
  signedIn: (user: User) => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

/**
 * Compte connecté. La session est un cookie HttpOnly posé par le backend : le navigateur l'envoie
 * tout seul sur /api et /ws, et ce code n'y touche jamais. On demande juste `/api/auth/me` au démarrage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.GET("/api/auth/me").then(({ data }) => setUser(data ?? null));
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const logout = useCallback(async () => {
    await api.POST("/api/auth/logout");
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, signedIn: setUser, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

/** Compte connecté, dans les pages qui ne s'affichent qu'une fois connecté. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser appelé sans compte connecté");
  return user;
}
