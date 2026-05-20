import { supabase } from "@/integrations/supabase/client";

export type AuthAction =
  | "sign_in"
  | "sign_up"
  | "sign_out"
  | "resend_confirmation"
  | "password_reset";

export interface AuthLogPayload {
  action: AuthAction;
  email?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  status?: number | null;
  success: boolean;
  extra?: Record<string, unknown>;
}

/**
 * Centralized auth telemetry. Logs to the browser console with a stable
 * `[auth]` prefix so the events are easy to grep in monitoring tools that
 * capture console output (Sentry breadcrumbs, LogRocket, browser devtools).
 *
 * We deliberately keep this lightweight: no network call, no PII beyond the
 * email the user typed themselves. Add a remote sink later by extending the
 * `emit` step.
 */
export function logAuthEvent(payload: AuthLogPayload) {
  const entry = {
    scope: "auth",
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    ...payload,
  };

  if (payload.success) {
    console.info("[auth]", payload.action, entry);
  } else {
    console.error("[auth]", payload.action, entry);
  }
}

/** Helpers that normalize Supabase auth errors into a structured shape. */
export function describeAuthError(error: unknown): {
  code: string | null;
  message: string;
  status: number | null;
} {
  if (!error) return { code: null, message: "unknown_error", status: null };
  // Supabase AuthError exposes `code` (string) and `status` (number)
  const e = error as { code?: string; status?: number; message?: string; name?: string };
  return {
    code: e.code ?? e.name ?? null,
    message: e.message ?? String(error),
    status: typeof e.status === "number" ? e.status : null,
  };
}

/**
 * Subscribe to supabase auth state changes once, so every session
 * transition (signed in, signed out, token refreshed, user updated) is
 * captured even if it happens outside our login/cadastro forms.
 */
let installed = false;
export function installAuthListener() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  supabase.auth.onAuthStateChange((event, session) => {
    console.info("[auth] state_change", {
      event,
      hasSession: !!session,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      timestamp: new Date().toISOString(),
    });
  });
}
