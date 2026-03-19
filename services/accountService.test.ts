import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserProfile } from "@/types/profile";

vi.mock("@/services/userProfileStore", () => ({
  deleteUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn()
}));

vi.mock("@/services/analysisStore", () => ({
  deleteUserAnalyses: vi.fn()
}));

import { loadAccountProfile, purgeAccountData, saveAccountProfile } from "@/services/accountService";
import { deleteUserAnalyses } from "@/services/analysisStore";
import { deleteUserProfile, getUserProfile, updateUserProfile } from "@/services/userProfileStore";

describe("accountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stored profile when it exists", async () => {
    const profile: UserProfile = {
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      email: "marie@quantis.fr",
      emailVerified: true
    };
    vi.mocked(getUserProfile).mockResolvedValue(profile);

    const user: AuthenticatedUser = {
      uid: "uid-1",
      email: "marie@quantis.fr",
      displayName: "Unused Name",
      emailVerified: true
    };
    const result = await loadAccountProfile(user);

    expect(result).toEqual(profile);
  });

  it("builds fallback profile from auth user when firestore profile is missing", async () => {
    vi.mocked(getUserProfile).mockResolvedValue(null);

    const user: AuthenticatedUser = {
      uid: "uid-1",
      email: "marie@quantis.fr",
      displayName: "Marie Dupont",
      emailVerified: false
    };
    const result = await loadAccountProfile(user);

    expect(result).toEqual({
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "",
      siren: "",
      companySize: "",
      sector: "",
      email: "marie@quantis.fr",
      emailVerified: false
    });
  });

  it("delegates profile updates to userProfileStore", async () => {
    vi.mocked(updateUserProfile).mockResolvedValue(undefined);

    await saveAccountProfile("uid-1", {
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });

    expect(updateUserProfile).toHaveBeenCalledWith("uid-1", {
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });
  });

  it("purges analyses then user profile and returns the deleted analyses count", async () => {
    vi.mocked(deleteUserAnalyses).mockResolvedValue(4);
    vi.mocked(deleteUserProfile).mockResolvedValue(undefined);

    const result = await purgeAccountData("uid-1");

    expect(result).toEqual({ deletedAnalysesCount: 4 });
    expect(deleteUserAnalyses).toHaveBeenCalledWith("uid-1");
    expect(deleteUserProfile).toHaveBeenCalledWith("uid-1");

    const analysesCall = vi.mocked(deleteUserAnalyses).mock.invocationCallOrder[0];
    const profileCall = vi.mocked(deleteUserProfile).mock.invocationCallOrder[0];
    expect(analysesCall).toBeLessThan(profileCall);
  });
});
