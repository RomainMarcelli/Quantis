// File: services/securityAuditClient.ts
// Role: envoie des événements d'audit sécurité depuis le frontend vers l'API serveur dédiée.
import { firebaseAuth } from "@/lib/firebase";

type ClientSecurityAuditInput = {
  eventType: string;
  statusCode?: number;
  userId?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
  includeAuthToken?: boolean;
};

export async function logClientSecurityEvent(input: ClientSecurityAuditInput): Promise<void> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json"
    };

    // On ajoute le token Firebase quand disponible pour rattacher l'événement à l'utilisateur réel.
    if (input.includeAuthToken !== false && firebaseAuth.currentUser) {
      const idToken = await firebaseAuth.currentUser.getIdToken();
      headers.Authorization = `Bearer ${idToken}`;
    }

    await fetch("/api/security/audit", {
      method: "POST",
      headers,
      // keepalive aide à expédier le log même pendant des redirections/navigation rapides.
      keepalive: true,
      body: JSON.stringify({
        eventType: input.eventType,
        statusCode: input.statusCode,
        userId: input.userId ?? null,
        message: input.message,
        metadata: input.metadata ?? {}
      })
    });
  } catch {
    // Fail-open volontaire: le logging ne doit jamais impacter l'UX.
  }
}
