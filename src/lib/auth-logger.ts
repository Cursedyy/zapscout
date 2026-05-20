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
 * transition (signed in, signed out, token refreshed, user updated,
 * password recovery, MFA challenge) is captured even if it happens
 * outside our login/cadastro forms. Each entry records the full session
 * context plus a diff against the previous state so it's easy to spot
 * token rotations, silent sign-outs, or unexpected user swaps.
 */
let installed = false;

type SessionSnapshot = {
  userId: string | null;
  email: string | null;
  provider: string | null;
  expiresAt: number | null;
  accessTokenHash: string | null;
  refreshTokenHash: string | null;
};

let lastSnapshot: SessionSnapshot | null = null;

/** Short non-reversible fingerprint so we can compare tokens without leaking them. */
function fingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return `t_${(h >>> 0).toString(16)}_${value.length}`;
}

type RawSession = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number | null;
  user?: { id?: string; email?: string | null; app_metadata?: { provider?: string } };
} | null;

function snapshot(session: RawSession): SessionSnapshot {
  return {
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    provider: session?.user?.app_metadata?.provider ?? null,
    expiresAt: session?.expires_at ?? null,
    accessTokenHash: fingerprint(session?.access_token ?? null),
    refreshTokenHash: fingerprint(session?.refresh_token ?? null),
  };
}

function diff(prev: SessionSnapshot | null, next: SessionSnapshot) {
  if (!prev) return { firstSession: true };
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  (Object.keys(next) as (keyof SessionSnapshot)[]).forEach((k) => {
    if (prev[k] !== next[k]) changed[k] = { from: prev[k], to: next[k] };
  });
  return {
    changed,
    userSwapped: !!prev.userId && !!next.userId && prev.userId !== next.userId,
  };
}

export function installAuthListener() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Seed with whatever session is already restored so the first state_change
  // produces a meaningful diff instead of "firstSession: true".
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("[auth] initial_session_error", {
        timestamp: new Date().toISOString(),
        message: error.message,
      });
      return;
    }
    const snap = snapshot(data.session as RawSession);
    lastSnapshot = snap;
    console.info("[auth] initial_session", {
      timestamp: new Date().toISOString(),
      hasSession: !!data.session,
      ...snap,
      expiresInSec: snap.expiresAt ? snap.expiresAt - Math.floor(Date.now() / 1000) : null,
    });
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const next = snapshot(session as RawSession);
    const delta = diff(lastSnapshot, next);
    const nowSec = Math.floor(Date.now() / 1000);

    const entry = {
      scope: "auth",
      // INITIAL_SESSION | SIGNED_IN | SIGNED_OUT | TOKEN_REFRESHED |
      // USER_UPDATED | PASSWORD_RECOVERY | MFA_CHALLENGE_VERIFIED
      event,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      hasSession: !!session,
      ...next,
      expiresInSec: next.expiresAt ? next.expiresAt - nowSec : null,
      tokenType: (session as RawSession)?.token_type ?? null,
      accessTokenRotated:
        !!lastSnapshot &&
        !!next.accessTokenHash &&
        lastSnapshot.accessTokenHash !== next.accessTokenHash,
      refreshTokenRotated:
        !!lastSnapshot &&
        !!next.refreshTokenHash &&
        lastSnapshot.refreshTokenHash !== next.refreshTokenHash,
      diff: delta,
      visibility: typeof document !== "undefined" ? document.visibilityState : null,
    };

    lastSnapshot = next;

    if (event === "SIGNED_OUT" || (delta as { userSwapped?: boolean }).userSwapped) {
      console.warn("[auth] state_change", entry);
    } else {
      console.info("[auth] state_change", entry);
    }
  });

  // Capture token-refresh failures that surface as global rejections but never
  // make it into onAuthStateChange (e.g. network outage during silent refresh).
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason as { message?: string; name?: string } | undefined;
    const msg = reason?.message ?? String(ev.reason ?? "");
    if (/refresh|token|jwt|auth/i.test(msg)) {
      console.error("[auth] unhandled_rejection", {
        timestamp: new Date().toISOString(),
        name: reason?.name ?? null,
        message: msg,
      });
    }
  });
}
