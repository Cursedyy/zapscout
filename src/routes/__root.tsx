import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { installAuthListener } from "@/lib/auth-logger";
import { RouteProgress } from "@/components/route-progress";

const faviconHref =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%237C5CFF'/%3E%3Cstop offset='1' stop-color='%235947F5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Cpath d='M35 8 L16 36 H29 L25 56 L48 26 H34 Z' fill='white'/%3E%3C/svg%3E";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ZapScout" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "ZapScouter prospecção automatizada" },
      { property: "og:title", content: "ZapScouter prospecção automatizada" },
      { name: "twitter:title", content: "ZapScouter prospecção automatizada" },
      { name: "description", content: "ZapScout automatiza a prospecção de clientes via WhatsApp, integrando Google Maps e IA." },
      { property: "og:description", content: "ZapScout automatiza a prospecção de clientes via WhatsApp, integrando Google Maps e IA." },
      { name: "twitter:description", content: "ZapScout automatiza a prospecção de clientes via WhatsApp, integrando Google Maps e IA." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bc6e09cb-263d-406a-a699-3023010d0806/id-preview-081cfc45--20f307c2-3309-44e4-9aec-4535cdcee2be.lovable.app-1779217705691.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bc6e09cb-263d-406a-a699-3023010d0806/id-preview-081cfc45--20f307c2-3309-44e4-9aec-4535cdcee2be.lovable.app-1779217705691.png" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: faviconHref },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Pesos reduzidos: corta ~40% do CSS de fontes e bytes de WOFF2 baixados
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const reducedMotionBootstrap = `(function(){try{var m=localStorage.getItem('zapscout:reduced-motion')||'auto';var r=m==='on'||(m==='auto'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);if(r)document.documentElement.classList.add('reduce-motion');}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: reducedMotionBootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installAuthListener();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouteProgress />
      <Outlet />
    </QueryClientProvider>
  );
}
