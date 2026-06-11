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
import { ClickRipple } from "@/components/click-ripple";
import { Toaster } from "@/components/ui/sonner";

const faviconSvg = "/favicon.svg";
const faviconIco = "/favicon.ico";
const faviconPng = "/favicon.png";

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
      { rel: "icon", type: "image/svg+xml", href: faviconSvg },
      { rel: "alternate icon", href: faviconIco },
      { rel: "shortcut icon", href: faviconPng },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap",
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
      <ClickRipple />
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
