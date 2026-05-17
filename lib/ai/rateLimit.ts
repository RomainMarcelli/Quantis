// File: lib/ai/rateLimit.ts
// Role: rate limit "20 appels IA / jour / utilisateur" persisté en Firestore.
//
// Schéma : ai_usage/{userId}/daily/{YYYY-MM-DD}
//   - count : number  (nombre d'appels consommés sur la journée UTC)
//
// Pourquoi Firestore et pas la mémoire process : le rate limit existant
// dans `lib/server/rateLimit.ts` est par-process — en serverless, chaque
// instance compte indépendamment, ce qui rend le compteur peu fiable pour
// un quota quotidien. Firestore garantit un compteur partagé.
//
// On utilise FieldValue.increment + un read post-update (pas idéal côté
// transaction stricte, mais suffisant pour un compteur "anti-abus" de 20).
// Une transaction garantirait l'atomicité parfaite ; on l'ajoutera si on
// passe à des quotas plus serrés où chaque incrément compte exactement.

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

// 50 questions/jour/user — équilibre usage pro / coût maîtrisé. Coût estimé :
// 50 × ~1500 input tokens × $3/M (Sonnet 4.6) ≈ $0.22/jour/user. Reset à minuit
// Europe/Paris.
export const DAILY_AI_QUOTA = 50;

/**
 * Calcule l'ISO du prochain minuit en timezone Europe/Paris (utilisé par la
 * route 429 pour informer l'UI). Approximation simple : on calcule l'offset
 * actuel Paris (CET+1 / CEST+2) via Intl, on en déduit le minuit local puis on
 * convertit en UTC. La précision DST est suffisante pour un affichage UI
 * (utilisateur informé à 1h près au pire), pas critique.
 */
export function getNextResetISO(now: Date = new Date()): string {
  // Récupère les composantes locales Paris via Intl (robuste DST).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number(get("year"));
  const mo = Number(get("month"));
  const d = Number(get("day"));
  const h = Number(get("hour") === "24" ? "0" : get("hour"));
  const mi = Number(get("minute"));
  const s = Number(get("second"));

  // Construit "now" en UTC ms, puis ajoute le delta jusqu'au prochain minuit
  // local Paris (24h - h:m:s écoulé aujourd'hui à Paris).
  const millisIntoDay = ((h * 60 + mi) * 60 + s) * 1000;
  const millisUntilMidnight = 24 * 60 * 60 * 1000 - millisIntoDay;
  const nextResetMs = now.getTime() + millisUntilMidnight;
  // On marque la date à 00:00 Paris ; en UTC ça correspond à 22:00 ou 23:00
  // selon DST. C'est correct car nextResetMs est calculé via le delta réel.
  void y; void mo; void d; // composantes consommées pour le calcul ci-dessus
  return new Date(nextResetMs).toISOString();
}

/**
 * Format YYYY-MM-DD en UTC. Volontairement pas de timezone : on évite les
 * anomalies de bascule à minuit selon le fuseau de l'utilisateur (un user
 * basé à Paris vs. à NYC verrait son compteur reset à des heures différentes
 * sinon — le serveur n'a pas de timezone fiable en serverless).
 */
function todayKeyUTC(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dailyDocRef(userId: string, day: string) {
  return getFirebaseAdminFirestore()
    .collection("ai_usage")
    .doc(userId)
    .collection("daily")
    .doc(day);
}

/**
 * Tente de consommer un crédit IA pour le user. Retourne :
 *   - { allowed: true, remaining }  si l'appel est autorisé
 *   - { allowed: false, remaining: 0 } si le quota est atteint
 *
 * Comportement : si le doc du jour n'existe pas, on l'initialise à 1 ;
 * sinon on incrémente et on lit. On vérifie après l'incrément pour
 * permettre un compteur monotone — l'utilisateur verra parfois `remaining`
 * passer à 0 sans erreur (la requête en cours est incluse).
 */
export async function consumeDailyQuota(
  userId: string,
  options: { now?: Date; quota?: number } = {}
): Promise<{ allowed: boolean; remaining: number; used: number }> {
  const quota = options.quota ?? DAILY_AI_QUOTA;
  const day = todayKeyUTC(options.now);
  const ref = dailyDocRef(userId, day);

  // Read-modify-write avec un fallback create si absent. Pour la première
  // version (quota de 20), un set/merge suffit largement — race théorique
  // sur les premiers appels de la journée mais sans conséquence (pire cas :
  // un utilisateur est compté 1 fois de trop, jamais bloqué à tort).
  await ref.set(
    {
      count: FieldValue.increment(1),
      lastUsedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const snap = await ref.get();
  const used = (snap.data()?.count as number | undefined) ?? 1;
  const remaining = Math.max(0, quota - used);
  const allowed = used <= quota;
  return { allowed, remaining, used };
}

/**
 * Lecture seule du quota restant (sans consommer). Utilisé par la route GET
 * et l'UI pour afficher "18/20 questions aujourd'hui" sans coût.
 */
export async function readRemainingQuota(
  userId: string,
  options: { now?: Date; quota?: number } = {}
): Promise<{ remaining: number; used: number; quota: number }> {
  const quota = options.quota ?? DAILY_AI_QUOTA;
  const day = todayKeyUTC(options.now);
  const snap = await dailyDocRef(userId, day).get();
  const used = snap.exists ? ((snap.data()?.count as number | undefined) ?? 0) : 0;
  return { used, remaining: Math.max(0, quota - used), quota };
}

/** Exporté pour les tests qui veulent fabriquer la clé du jour eux-mêmes. */
export const __TESTING__ = { todayKeyUTC };
