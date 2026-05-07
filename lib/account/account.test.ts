import { describe, expect, it, vi } from "vitest";
import {
  deleteAccountCompletely,
  deleteAccountData,
  updateAccountProfile,
  validateAccountProfileInput,
  type AccountGateway
} from "@/lib/account/account";
import type { UserProfileUpdateInput } from "@/types/profile";

function validInput(): UserProfileUpdateInput {
  return {
    firstName: "Marie",
    lastName: "Dupont",
    companyName: "Vyzor SAS",
    siren: "123456789",
    companySize: "pme",
    sector: "SaaS & Edition de Logiciels"
  };
}

describe("validateAccountProfileInput", () => {
  it("returns errors for invalid profile values", () => {
    const errors = validateAccountProfileInput({
      firstName: "A",
      lastName: "",
      companyName: "",
      siren: "12",
      companySize: "",
      sector: ""
    });

    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
    expect(errors.companyName).toBeDefined();
    expect(errors.siren).toBeDefined();
    expect(errors.companySize).toBeDefined();
    expect(errors.sector).toBeDefined();
  });
});

describe("updateAccountProfile", () => {
  it("does not call gateway when validation fails", async () => {
    const gateway = {
      updateProfile: vi.fn()
    };

    const result = await updateAccountProfile(gateway, "uid-1", {
      firstName: "",
      lastName: "",
      companyName: "",
      siren: "",
      companySize: "",
      sector: ""
    });

    expect(result.success).toBe(false);
    expect(gateway.updateProfile).not.toHaveBeenCalled();
  });

  it("updates sanitized profile on valid data", async () => {
    const gateway = {
      updateProfile: vi.fn().mockResolvedValue(undefined)
    };

    const result = await updateAccountProfile(gateway, "uid-1", {
      ...validInput(),
      firstName: " Marie "
    });

    expect(result).toEqual({ success: true });
    expect(gateway.updateProfile).toHaveBeenCalledWith("uid-1", {
      ...validInput(),
      firstName: "Marie"
    });
  });
});

describe("account deletion use cases", () => {
  function makeGateway(overrides?: Partial<AccountGateway>): AccountGateway {
    return {
      updateProfile: vi.fn(),
      deleteUserData: vi.fn().mockResolvedValue({ deletedAnalysesCount: 3 }),
      deleteAuthAccount: vi.fn().mockResolvedValue(undefined),
      ...overrides
    };
  }

  it("deletes firestore user data only", async () => {
    const gateway = makeGateway();
    const result = await deleteAccountData(gateway, "uid-1");

    expect(result).toEqual({ success: true, deletedAnalysesCount: 3 });
    expect(gateway.deleteUserData).toHaveBeenCalledWith("uid-1");
    expect(gateway.deleteAuthAccount).not.toHaveBeenCalled();
  });

  it("deletes data and auth account", async () => {
    const gateway = makeGateway();
    const result = await deleteAccountCompletely(gateway, "uid-1");

    expect(result).toEqual({ success: true, deletedAnalysesCount: 3 });
    expect(gateway.deleteUserData).toHaveBeenCalledWith("uid-1");
    expect(gateway.deleteAuthAccount).toHaveBeenCalled();
  });

  it("maps requires recent login error", async () => {
    const gateway = makeGateway({
      deleteAuthAccount: vi.fn().mockRejectedValue({ code: "auth/requires-recent-login" })
    });

    const result = await deleteAccountCompletely(gateway, "uid-1");

    expect(result).toEqual({
      success: false,
      message: "Veuillez vous reconnecter avant de supprimer votre compte."
    });
  });
});

