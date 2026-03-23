// services/authEmailClient.ts
// Encapsule les appels frontend vers les endpoints d'emails d'authentification.
export async function requestVerificationEmail(params: {
  idToken: string;
  email: string;
  firstName?: string;
}): Promise<void> {
  const response = await fetch("/api/auth/send-verification-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.idToken}`
    },
    body: JSON.stringify({
      email: params.email,
      firstName: params.firstName,
      origin: typeof window !== "undefined" ? window.location.origin : undefined
    })
  });

  if (!response.ok) {
    throw new Error("custom-verification-email-failed");
  }
}

export async function requestPasswordResetEmail(params: {
  email: string;
  firstName?: string;
}): Promise<void> {
  const response = await fetch("/api/auth/send-password-reset-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: params.email,
      firstName: params.firstName,
      origin: typeof window !== "undefined" ? window.location.origin : undefined
    })
  });

  if (!response.ok) {
    const errorBody = (await safeParseErrorBody(response)) ?? {};

    if (response.status === 400) {
      const invalidEmailError = new Error(errorBody.error ?? "Format d'email invalide.");
      (invalidEmailError as Error & { code: string }).code = "auth/invalid-email";
      throw invalidEmailError;
    }

    const genericError = new Error(errorBody.error ?? "Envoi email impossible pour le moment.");
    (genericError as Error & { code: string }).code = "auth/internal-error";
    throw genericError;
  }
}

async function safeParseErrorBody(response: Response): Promise<{ error?: string } | null> {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return null;
  }
}
