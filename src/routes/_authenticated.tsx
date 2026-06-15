import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import { getSession } from "backend/api/services/auth.service";
import { getProfile, type Profile } from "backend/api/services/users.service";
import { NotePopupProvider } from "@/contexts/NotePopupContext";
import { FloatingNotePopup } from "@/components/FloatingNotePopup";

const ProfileContext = createContext<Profile | null>(null);
export const useProfile = () => useContext(ProfileContext);

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { session } = await getSession();
    if (!session) throw redirect({ to: "/login" });

    const profile = await getProfile(session.user.id);
    if (!profile) throw redirect({ to: "/aguardando" });

    return { profile };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { profile } = Route.useRouteContext();
  return (
    <ProfileContext.Provider value={profile}>
      <NotePopupProvider>
        <Outlet />
        <FloatingNotePopup />
      </NotePopupProvider>
    </ProfileContext.Provider>
  );
}
