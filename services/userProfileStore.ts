import {
  isOnboardingObjectiveValue,
  type OnboardingObjectiveValue
} from "@/lib/onboarding/objectives";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { RegisterProfilePayload } from "@/lib/auth/register";
import type {
  UserProfile,
  UserProfileUpdateInput,
  UserThemePreference
} from "@/types/profile";

export async function saveUserProfile(userId: string, profile: RegisterProfilePayload): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);

  await setDoc(
    ref,
    {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      emailVerified: false
    },
    { merge: true }
  );
}

export async function markUserEmailAsVerified(userId: string): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);
  await updateDoc(ref, {
    emailVerified: true,
    updatedAt: serverTimestamp()
  });
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const ref = doc(firestoreDb, "users", userId);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  const themePreference = resolveThemePreference(data.themePreference);

  return {
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    companyName: String(data.companyName ?? ""),
    siren: String(data.siren ?? ""),
    companySize: (data.companySize as UserProfile["companySize"]) ?? "",
    sector: (data.sector as UserProfile["sector"]) ?? "",
    usageObjectives: resolveUsageObjectives(data.usageObjectives),
    email: String(data.email ?? ""),
    emailVerified: Boolean(data.emailVerified),
    ...(themePreference ? { themePreference } : {}),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  };
}

export async function updateUserProfile(
  userId: string,
  updates: UserProfileUpdateInput
): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);
  await setDoc(
    ref,
    {
      ...updates,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveUserThemePreference(
  userId: string,
  themePreference: UserThemePreference
): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);
  await setDoc(
    ref,
    {
      themePreference,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function deleteUserProfile(userId: string): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);
  await deleteDoc(ref);
}

function toIsoString(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("toDate" in value)) {
    return undefined;
  }

  try {
    return (value as { toDate: () => Date }).toDate().toISOString();
  } catch {
    return undefined;
  }
}

function resolveUsageObjectives(value: unknown): OnboardingObjectiveValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is OnboardingObjectiveValue =>
      typeof item === "string" && isOnboardingObjectiveValue(item)
  );
}

function resolveThemePreference(value: unknown): UserThemePreference | undefined {
  if (value === "light" || value === "dark") {
    return value;
  }
  return undefined;
}
