type DeleteAccountEverywhereResult = {
  success: true;
  deletedAnalysesCount: number;
  deletedFoldersCount: number;
};

export async function deleteAccountEverywhere(
  idToken: string
): Promise<DeleteAccountEverywhereResult> {
  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  const payload = (await response.json()) as {
    success?: boolean;
    deletedAnalysesCount?: number;
    deletedFoldersCount?: number;
    error?: string;
  };

  if (!response.ok || payload.success !== true) {
    throw new Error(payload.error ?? "Suppression complète impossible.");
  }

  return {
    success: true,
    deletedAnalysesCount: payload.deletedAnalysesCount ?? 0,
    deletedFoldersCount: payload.deletedFoldersCount ?? 0
  };
}

