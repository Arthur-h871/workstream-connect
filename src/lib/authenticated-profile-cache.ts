import type { Session } from "@supabase/supabase-js";
import type { Profile } from "backend/api/services/users.service";

type AuthenticatedProfileState = {
  session: Session;
  profile: Profile;
};

let cachedState: AuthenticatedProfileState | null = null;
let pendingState: Promise<AuthenticatedProfileState | null> | null = null;

export function getCachedAuthenticatedProfile() {
  return cachedState;
}

export function primeAuthenticatedProfile(state: AuthenticatedProfileState) {
  cachedState = state;
  return cachedState;
}

export function mergeCachedAuthenticatedProfile(fields: Partial<Profile>) {
  if (!cachedState) return null;
  cachedState = {
    ...cachedState,
    profile: {
      ...cachedState.profile,
      ...fields,
    },
  };
  return cachedState;
}

export function invalidateAuthenticatedProfile() {
  cachedState = null;
  pendingState = null;
}

export async function resolveAuthenticatedProfile(
  loader: () => Promise<AuthenticatedProfileState | null>,
) {
  if (cachedState) return cachedState;
  if (!pendingState) {
    pendingState = loader().then((state) => {
      if (state) {
        cachedState = state;
      }
      return state;
    });
  }

  try {
    return await pendingState;
  } finally {
    pendingState = null;
  }
}
