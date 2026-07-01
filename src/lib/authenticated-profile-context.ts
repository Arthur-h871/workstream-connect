import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Profile } from "backend/api/services/users.service";

export type ProfileContextValue = {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error("useProfile must be used inside the authenticated layout.");
  }
  return value;
}
