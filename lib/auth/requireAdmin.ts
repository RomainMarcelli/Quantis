import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import { isAdminServer } from "@/lib/auth/isAdminServer";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

export async function requireAdmin(
  request: Request
): Promise<{ uid: string; email: string }> {
  const bearerToken = extractBearerToken(request.headers.get("authorization"));
  if (!bearerToken) {
    throw new AuthError("Non autorise.", 401);
  }

  let decodedToken: { uid: string; email?: string };
  try {
    decodedToken = await getFirebaseAdminAuth().verifyIdToken(bearerToken);
  } catch {
    throw new AuthError("Non autorise.", 401);
  }

  const email = decodedToken.email ?? null;
  if (!isAdminServer(email)) {
    throw new AuthError("Acces interdit.", 403);
  }

  return { uid: decodedToken.uid, email: email as string };
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
