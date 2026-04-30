// Helper d'authentification serveur pour les routes API qui utilisent Firebase Admin
// (lesquelles bypassent les Firestore rules — la vérification du token est obligatoire).
//
// Pattern : le client envoie l'ID token Firebase via header Authorization: Bearer <token>.

import type { NextRequest } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

// Vérifie le token et retourne le uid. Lève AuthenticationError sinon.
export async function requireAuthenticatedUser(request: NextRequest): Promise<string> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    throw new AuthenticationError("Authentification manquante (header Authorization: Bearer).");
  }
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new AuthenticationError("Token Firebase invalide ou expiré.");
  }
}
