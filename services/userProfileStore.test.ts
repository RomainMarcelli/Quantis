import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  firestoreDb: { app: "test-db" }
}));

vi.mock("firebase/firestore", () => ({
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({
    collectionName,
    id,
    path: `${collectionName}/${id}`
  })),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __type: "serverTimestamp" })),
  setDoc: vi.fn(),
  updateDoc: vi.fn()
}));

import * as firestore from "firebase/firestore";
import {
  deleteUserProfile,
  getUserProfile,
  markUserEmailAsVerified,
  saveUserThemePreference,
  saveUserProfile,
  updateUserProfile
} from "@/services/userProfileStore";

describe("userProfileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves user profile with timestamps and merge=true", async () => {
    await saveUserProfile("uid-1", {
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie@quantis.fr",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: ["analyser_comptes"]
    });

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1" }),
      expect.objectContaining({
        firstName: "Marie",
        emailVerified: false
      }),
      { merge: true }
    );
  });

  it("marks user email as verified", async () => {
    await markUserEmailAsVerified("uid-1");

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1" }),
      expect.objectContaining({
        emailVerified: true
      })
    );
  });

  it("returns null when profile does not exist", async () => {
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => false
    } as never);

    const result = await getUserProfile("uid-1");

    expect(result).toBeNull();
  });

  it("maps firestore profile to normalized app profile", async () => {
    const createdAt = { toDate: () => new Date("2026-03-01T10:00:00.000Z") };
    const updatedAt = { toDate: () => new Date("2026-03-03T10:00:00.000Z") };

    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        firstName: "Marie",
        lastName: "Dupont",
        companyName: "Quantis SAS",
        siren: "123456789",
        companySize: "pme",
        sector: "SaaS & Edition de Logiciels",
        email: "marie@quantis.fr",
        emailVerified: true,
        createdAt,
        updatedAt
      })
    } as never);

    const result = await getUserProfile("uid-1");

    expect(result).toEqual({
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: [],
      email: "marie@quantis.fr",
      emailVerified: true,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-03T10:00:00.000Z"
    });
  });

  it("updates profile fields with merge=true", async () => {
    await updateUserProfile("uid-1", {
      firstName: "Marie",
      lastName: "Dupont",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1" }),
      expect.objectContaining({
        firstName: "Marie"
      }),
      { merge: true }
    );
  });

  it("saves theme preference with merge=true", async () => {
    await saveUserThemePreference("uid-1", "light");

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1" }),
      expect.objectContaining({
        themePreference: "light"
      }),
      { merge: true }
    );
  });

  it("deletes user profile document", async () => {
    await deleteUserProfile("uid-1");

    expect(firestore.deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1" })
    );
  });
});
