import { deleteUserAnalyses } from "@/services/analysisStore";
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

export async function purgeAccountData(userId: string): Promise<{ deletedAnalysesCount: number }> {
  const deletedAnalysesCount = await deleteUserAnalyses(userId);
  await deleteUserProfile(userId);
  return {
    deletedAnalysesCount
  };
}
