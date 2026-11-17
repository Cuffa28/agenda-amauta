import { AmautaBrand } from "@/components/AmautaBrand";
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, requireAgendaSession, type AgendaRole } from "@/data/supabase/client";
import { demoViewer } from "@/data/demo/memory-repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RoleState {
  role: AgendaRole;
  email: string;
  signOut?: () => void;
  setDemoRole?: (role: AgendaRole) => void;
}
const RoleContext = createContext<RoleState>({ role: "owner", email: "" });
/** Rol de la sesión: 'owner' ve toda la agenda; 'asesor', solo su pantalla de pedidos. */
export const useAgendaRole = () => useContext(RoleContext);

/** Muestra la agenda al owner y la pantalla de pedidos al asesor. */
export function RoleSwitch({ advisor, children }: { advisor: ReactNode; children: ReactNode }) {
  const { role, setDemoRole } = useAgendaRole();
  const demoBar = setDemoRole && (
    <div className="workspace-demo flex flex-wrap items-center justify-center gap-2">
      VISTA DE PRUEBA · Estás viendo la agenda como {role === "asesor" ? "asesor" : "Facundo"}.
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDemoRole(role === "asesor" ? "owner" : "asesor")}
      >
        {role === "asesor" ? "Volver a la vista de Facundo" : "Ver como asesor"}
      </Button>
    </div>
  );
  return (
    <>
      {demoBar}
      {role === "asesor" ? advisor : children}
    </>
  );
}

function loginError(error: unknown): string {
  const detail = error as { code?: string; message?: string };
  if (detail.code === "invalid_credentials")
    return "El correo o la contraseña no son correctos. Usá la contraseña de tu cuenta en Amauta, no la de Google.";
  if (detail.code === "email_not_confirmed")
    return "Primero tenés que confirmar tu correo para ingresar.";
  if (
    detail.code === "otp_expired" ||
    detail.code === "flow_state_not_found" ||
    detail.code === "bad_code_verifier"
  )
    return "El código venció o ya fue utilizado. Solicitá uno nuevo.";
  return detail.message || "No pudimos completar el ingreso. Intentá de nuevo.";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authorizedUserId = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false),
    [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [role, setRole] = useState<AgendaRole>("owner");
  const [demoRole, setDemoRoleState] = useState<AgendaRole>(demoViewer.role);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [code, setCode] = useState(""),
    [sentTo, setSentTo] = useState(""),
    [usePassword, setUsePassword] = useState(false);
  const demo = import.meta.env["VITE_AGENDA_MODE"] === "demo";
  const googleEnabled = import.meta.env["VITE_GOOGLE_AUTH_ENABLED"] === "true";

  useEffect(() => {
    if (demo) return;
    let active = true,
      authChanged = false;
    let currentUserId: string | null = null;
    try {
      const sb = getSupabase();
      void sb.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active || authChanged) return;
          currentUserId = data.session?.user.id ?? null;
          if (error) setError(loginError(error));
          setSession(data.session);
          setLoaded(true);
        })
        .catch((e) => {
          if (active) {
            setError(loginError(e));
            setLoaded(true);
          }
        });
      const { data } = sb.auth.onAuthStateChange((event, s) => {
        if (!active) return;
        authChanged = true;
        const nextUserId = s?.user.id ?? null;
        if (event === "SIGNED_OUT" || nextUserId !== currentUserId) {
          queryClient.clear();
          authorizedUserId.current = null;
          setAllowed(false);
        }
        currentUserId = nextUserId;
        setSession(s);
        setLoaded(true);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setError(loginError(e));
      setLoaded(true);
    }
    return () => {
      active = false;
    };
  }, [demo, queryClient]);

  useEffect(() => {
    if (!session) {
      authorizedUserId.current = null;
      setAllowed(false);
      return;
    }
    // Revalidar la misma cuenta en segundo plano conserva el formulario abierto.
    if (authorizedUserId.current !== session.user.id) setAllowed(false);
    let active = true;
    setCheckingAccess(true);
    void requireAgendaSession()
      .then((access) => {
        if (active) {
          authorizedUserId.current = session.user.id;
          setRole(access?.role === 'asesor' ? 'asesor' : 'owner');
          setAllowed(true);
          setError("");
          setCheckingAccess(false);
        }
      })
      .catch((e) => {
        if (active) {
          authorizedUserId.current = null;
          queryClient.clear();
          setAllowed(false);
          setError(loginError(e));
          setCheckingAccess(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session, queryClient, accessAttempt]);

  async function login(method: "google" | "email" | "password" | "verify") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const sb = getSupabase();
      if (method === "google") {
        const { error } = await sb.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: "select_account", hd: "amautainversiones.com" },
          },
        });
        if (error) throw error;
      } else if (method === "verify") {
        const { data, error } = await sb.auth.verifyOtp({
          email: sentTo,
          token: code.replace(/\s/g, ""),
          type: "email",
        });
        if (error) throw error;
        setSession(data.session);
      } else if (method === "password") {
        const { data, error } = await sb.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        setSession(data.session);
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setSentTo(email.trim().toLowerCase());
        setNotice("Te enviamos un código por correo. Revisá también la carpeta de spam.");
      }
    } catch (e) {
      setError(loginError(e));
    } finally {
      setPassword("");
      setCode("");
      setBusy(false);
    }
  }

  if (demo) {
    const setDemoRole = (next: AgendaRole) => {
      demoViewer.role = next;
      demoViewer.email = next === "asesor" ? "asesor.alfa@example.com" : "owner@example.com";
      queryClient.clear();
      setDemoRoleState(next);
    };
    return (
      <RoleContext.Provider value={{ role: demoRole, email: demoViewer.email, setDemoRole }}>
        {children}
      </RoleContext.Provider>
    );
  }
  const signOut = () => void getSupabase().auth.signOut();
  if (session && allowed)
    return (
      <RoleContext.Provider value={{ role, email: session.user.email || "", signOut }}>
        {role === "owner" && (
          <div className="account-session">
            <span>{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Cerrar sesión
            </Button>
          </div>
        )}
        <Suspense fallback={<p className="p-8">Cargando agenda…</p>}>{children}</Suspense>
      </RoleContext.Provider>
    );
  return (
    <div className="login-page">
      <aside className="login-story">
        <AmautaBrand dark />
        <div className="login-story-copy">
          <span>Agenda Amauta</span>
          <h2>
            Tu criterio.
            <br />
            Una mirada
            <br />
            <em>propia.</em>
          </h2>
          <p>
            El espacio para pensar cada cartera, documentar decisiones y acompañar lo que sigue.
          </p>
        </div>
        <div className="login-story-footer">
          <span>FACUNDO ARGAÑARAZ</span>
          <span>AMAUTA INVERSIONES</span>
        </div>
      </aside>
      <div className="login-form-panel">
        <section className="login-card space-y-5">
          <div className="login-eyebrow">TU ESPACIO DE TRABAJO</div>
          <h1>Entrá a tu agenda.</h1>
          <p className="text-sm text-muted-foreground">
            Ingresá con tu cuenta autorizada de Amauta.
          </p>
          {!loaded ? (
            <p>Comprobando sesión…</p>
          ) : session && checkingAccess ? (
            <p role="status">Recuperando tu acceso…</p>
          ) : session ? (
            <div className="space-y-3">
              <p className="text-sm">
                Hay una sesión guardada para <strong>{session.user.email}</strong>. No hace falta
                pedir otro código para volver a comprobar el acceso.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setError("");
                  setAccessAttempt((value) => value + 1);
                }}
              >
                Reintentar con mi sesión guardada
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => void getSupabase().auth.signOut()}
              >
                Ingresar con otra cuenta
              </Button>
            </div>
          ) : (
            <>
              {googleEnabled && (
                <Button className="w-full" disabled={busy} onClick={() => void login("google")}>
                  Ingresar con Google
                </Button>
              )}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void login(usePassword ? "password" : sentTo ? "verify" : "email");
                }}
              >
                <label className="text-sm" htmlFor="login-email">
                  Correo
                </label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={busy || !!sentTo}
                />
                {sentTo && !usePassword ? (
                  <>
                    <label className="text-sm" htmlFor="login-code">
                      Código de acceso
                    </label>
                    <Input
                      id="login-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9 ]{6,12}"
                      maxLength={12}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      autoComplete="one-time-code"
                      disabled={busy}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Ingresá el código que recibiste en {sentTo}. No necesitás contraseña.
                    </p>
                  </>
                ) : usePassword ? (
                  <>
                    <label className="text-sm" htmlFor="login-password">
                      Contraseña
                    </label>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      disabled={busy}
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Te enviamos un código para verificar tu correo. No necesitás crear una
                    contraseña.
                  </p>
                )}
                <Button className="w-full" disabled={busy}>
                  {busy
                    ? "Procesando…"
                    : usePassword
                      ? "Ingresar"
                      : sentTo
                        ? "Verificar código e ingresar"
                        : "Recibir código de acceso"}
                </Button>
              </form>
              {sentTo && !usePassword && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void login("email")}
                  >
                    Reenviar código
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setSentTo("");
                      setCode("");
                      setNotice("");
                      setError("");
                    }}
                  >
                    Cambiar correo
                  </Button>
                </div>
              )}
              {!sentTo && (
                <Button
                  className="w-full"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setUsePassword(!usePassword);
                    setPassword("");
                    setNotice("");
                    setError("");
                  }}
                >
                  {usePassword ? "Ingresar con un código por correo" : "Ya tengo contraseña"}
                </Button>
              )}
              {session && (
                <Button variant="ghost" onClick={() => void getSupabase().auth.signOut()}>
                  Cambiar cuenta
                </Button>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          <div className="login-privacy">
            Tu sesión se conserva en este navegador. Usá siempre agenda-amauta.vercel.app y cerrá
            sesión sólo cuando quieras salir de tu cuenta.
          </div>
        </section>
      </div>
    </div>
  );
}
