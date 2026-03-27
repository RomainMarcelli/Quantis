import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccountEverywhere } from "@/services/accountDeletionApi";

describe("accountDeletionApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns deletion counts when API responds success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          deletedAnalysesCount: 3,
          deletedFoldersCount: 2
        })
      })
    );

    const result = await deleteAccountEverywhere("token-123");

    expect(result).toEqual({
      success: true,
      deletedAnalysesCount: 3,
      deletedFoldersCount: 2
    });
    expect(fetch).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123"
      }
    });
  });

  it("throws when API responds error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Suppression complète impossible."
        })
      })
    );

    await expect(deleteAccountEverywhere("token-123")).rejects.toThrow(
      "Suppression complète impossible."
    );
  });
});
