import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getSession } from "backend/api/services/auth.service";
import { getProfile } from "backend/api/services/users.service";
import { ProfileContext } from "@/lib/authenticated-profile-context";
import {
  primeAuthenticatedProfile,
  resolveAuthenticatedProfile,
} from "@/lib/authenticated-profile-cache";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const cached = await resolveAuthenticatedProfile(async () => {
      const { session } = await getSession();
      if (!session) return null;

      const profile = await getProfile(session.user.id);
      if (!profile) return null;

      return primeAuthenticatedProfile({ session, profile });
    });

    const session = cached?.session ?? (await getSession()).session;
    if (!session) throw redirect({ to: "/login" });

    const profile = cached?.profile ?? (await getProfile(session.user.id));
    if (!profile) throw redirect({ to: "/aguardando" });

    primeAuthenticatedProfile({ session, profile });

    return { profile };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { profile: initialProfile } = Route.useRouteContext();
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  return (
    <ProfileContext.Provider value={{ profile, setProfile }}>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProfileContext.Provider>
  );
}
