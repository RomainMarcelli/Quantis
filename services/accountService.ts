// File: services/accountService.ts
// Role: orchestration metier du compte utilisateur (lecture profil, mises a jour, purges partielles/completes).
import { deleteUserAnalyses } from "@/services/analysisStore";
import { deleteUserFolders } from "@/services/folderStore";
import {
  deleteUserProfile,
  getUserProfile,
  updateUserProfile
} from "@/services/userProfileStore";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserProfile, UserProfileUpdateInput } from "@/types/profile";

export async function loadAccountProfile(
  user: AuthenticatedUser
): Promise<UserProfile> {
  const profile = await getUserProfile(user.uid);

  if (profile) {
    return profile;
  }

  const [fallbackFirstName = "", ...rest] = (user.displayName ?? "").split(" ");
  const fallbackLastName = rest.join(" ");

  return {
    firstName: fallbackFirstName,
    lastName: fallbackLastName,
    companyName: "",
    siren: "",
    companySize: "",
    sector: "",
    email: user.email ?? "",
    emailVerified: user.emailVerified
  };
}

export async function saveAccountProfile(
  userId: string,
  updates: UserProfileUpdateInput
): Promise<void> {
  await updateUserProfile(userId, updates);
}

// Purge partielle: supprime uniquement les donnees d'analyse/statistiques.
export async function purgeAnalysisData(userId: string): Promise<{ deletedAnalysesCount: number }> {
  await deleteUserFolders(userId);
  const deletedAnalysesCount = await deleteUserAnalyses(userId);
  return {
    deletedAnalysesCount
  };
}

// Purge complete: supprime analyses + profil.
export async function purgeAccountData(userId: string): Promise<{ deletedAnalysesCount: number }> {
  const { deletedAnalysesCount } = await purgeAnalysisData(userId);
  await deleteUserProfile(userId);
  return {
    deletedAnalysesCount
  };
}
