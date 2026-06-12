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
      { name: "theme-color", content: "#0F172A" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ZapScout" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@zapscout" },
      { title: "ZapScout — Prospecção automática via WhatsApp e Google Maps" },
      { property: "og:title", content: "ZapScout — Prospecção automática via WhatsApp" },
      { name: "twitter:title", content: "ZapScout — Prospecção automática via WhatsApp" },
      {
        name: "description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente. Prospecção B2B inteligente para agências e consultores brasileiros.",
      },
      {
        property: "og:description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente.",
      },
      {
        name: "twitter:description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente.",
      },
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://zapscout.com.br/#org",
              name: "ZapScout",
              url: "https://zapscout.com.br",
              logo: "https://zapscout.com.br/favicon.png",
              sameAs: [],
            },
            {
              "@type": "WebSite",
              "@id": "https://zapscout.com.br/#website",
              url: "https://zapscout.com.br",
              name: "ZapScout",
              inLanguage: "pt-BR",
              publisher: { "@id": "https://zapscout.com.br/#org" },
            },
          ],
        }),
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
