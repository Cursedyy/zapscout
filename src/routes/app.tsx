import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { AppMobileTopbar } from "@/components/app-mobile-topbar";
import { supabase } from "@/integrations/supabase/client";
import { AppStoreProvider } from "@/store/app-store";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppStoreProvider>
      <div className="flex min-h-dvh bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <AppMobileTopbar />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </AppStoreProvider>
  );
}
