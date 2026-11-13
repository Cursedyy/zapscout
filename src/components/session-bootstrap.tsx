import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

// Public applications do not need an account, cookies or a restored CRM session.
export function SessionBootstrap() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    const path = pathname.replace(/\/+$/, "");
    if (path === "/influenciadores" || path === "/representantes") return;
    let active = true;
    void Promise.all([import("@/lib/auth-logger"), import("@/lib/session-persistence")])
      .then(([auth, persistence]) => {
        if (!active) return;
        auth.installAuthListener();
        persistence.installSessionPersistence();
      })
      .catch(() => {
        // Optional session telemetry must not replace the page with an error screen.
        console.warn("Não foi possível iniciar o acompanhamento da sessão.");
      });
    return () => {
      active = false;
    };
  }, [pathname]);
  return null;
}