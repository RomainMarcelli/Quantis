// File: services/integrations/adapters/myunisoft/mock.ts
// Role: jeu de données mock retourné par le client MyUnisoft quand
// `MYUNISOFT_THIRD_PARTY_SECRET` est absente. Permet aux développeurs
// sans credentials de :
//   - lancer le wizard de connexion sans erreur
//   - voir un dashboard rempli (KPI calculés à partir de ces fixtures)
//   - reproduire les flux d'analyse côté front sans réseau
//
// La forme des entités mockées suit EXACTEMENT le shape attendu par les
// mappers (cf. mappers.ts) — toute évolution du shape API doit être
// reflétée ici pour garder le mock réaliste.
//
// IMPORTANT : ces fixtures doivent rester strictement déterministes (pas
// de Date.now(), Math.random()) pour que les tests qui s'appuient dessus
// soient reproductibles.

import type {
  MyUnisoftAccount,
  MyUnisoftBalanceEntry,
  MyUnisoftEntry,
  MyUnisoftJournal,
} from "@/services/integrations/adapters/myunisoft/mappers";

// ─── Journaux mock ──────────────────────────────────────────────────────

export const MOCK_JOURNALS: MyUnisoftJournal[] = [
  { producerId: 1, name: "Ventes", customerReferenceCode: "VT", type: "sales" },
  { producerId: 2, name: "Achats", customerReferenceCode: "AC", type: "purchases" },
  { producerId: 3, name: "Banque", customerReferenceCode: "BQ", type: "bank" },
  { producerId: 4, name: "Opérations diverses", customerReferenceCode: "OD", type: "general" },
];

// ─── Plan comptable mock ────────────────────────────────────────────────

export const MOCK_ACCOUNTS: MyUnisoftAccount[] = [
  { producerId: 100, number: "101000", name: "Capital social" },
  { producerId: 101, number: "120000", name: "Résultat de l'exercice" },
  { producerId: 200, number: "215000", name: "Installations techniques" },
  { producerId: 300, number: "370000", name: "Stocks de marchandises" },
  { producerId: 400, number: "401000", name: "Fournisseurs" },
  { producerId: 401, number: "411000", name: "Clients" },
  { producerId: 512, number: "512000", name: "Banque" },
  { producerId: 600, number: "607000", name: "Achats de marchandises" },
  { producerId: 601, number: "641000", name: "Salaires" },
  { producerId: 602, number: "645000", name: "Charges sociales" },
  { producerId: 700, number: "707000", name: "Ventes de marchandises" },
];

// ─── Écritures mock — un exercice fiscal ───────────────────────────────

export const MOCK_ENTRIES: MyUnisoftEntry[] = [
  {
    producerId: 1,
    date: "2026-03-15",
    journal: MOCK_JOURNALS[0]!,
    movements: [
      {
        account: { number: "411000", name: "Clients" },
        value: { debit: 12000, credit: 0 },
      },
      {
        account: { number: "707000", name: "Ventes de marchandises" },
        value: { debit: 0, credit: 10000 },
      },
      {
        account: { number: "445710", name: "TVA collectée" },
        value: { debit: 0, credit: 2000 },
      },
    ],
  },
  {
    producerId: 2,
    date: "2026-03-20",
    journal: MOCK_JOURNALS[1]!,
    movements: [
      {
        account: { number: "607000", name: "Achats de marchandises" },
        value: { debit: 5000, credit: 0 },
      },
      {
        account: { number: "445660", name: "TVA déductible" },
        value: { debit: 1000, credit: 0 },
      },
      {
        account: { number: "401000", name: "Fournisseurs" },
        value: { debit: 0, credit: 6000 },
      },
    ],
  },
  {
    producerId: 3,
    date: "2026-03-31",
    journal: MOCK_JOURNALS[3]!,
    movements: [
      {
        account: { number: "641000", name: "Salaires" },
        value: { debit: 8000, credit: 0 },
      },
      {
        account: { number: "645000", name: "Charges sociales" },
        value: { debit: 3500, credit: 0 },
      },
      {
        account: { number: "421000", name: "Personnel - rémunérations dues" },
        value: { debit: 0, credit: 6500 },
      },
      {
        account: { number: "431000", name: "Sécurité sociale" },
        value: { debit: 0, credit: 5000 },
      },
    ],
  },
];

// ─── Balance d'ouverture mock ──────────────────────────────────────────

export const MOCK_BALANCE: MyUnisoftBalanceEntry[] = [
  { account: { number: "101000", name: "Capital social" }, balance: -50000 },
  { account: { number: "215000", name: "Installations techniques" }, balance: 25000 },
  { account: { number: "411000", name: "Clients" }, balance: 18000 },
  { account: { number: "401000", name: "Fournisseurs" }, balance: -12000 },
  { account: { number: "512000", name: "Banque" }, balance: 22000 },
  { account: { number: "707000", name: "Ventes de marchandises" }, balance: -50000 },
  { account: { number: "607000", name: "Achats de marchandises" }, balance: 28000 },
  { account: { number: "641000", name: "Salaires" }, balance: 24000 },
  { account: { number: "645000", name: "Charges sociales" }, balance: 10500 },
];

/**
 * Détecte si on doit utiliser le mock plutôt que la vraie API. Vrai si
 * la clé partenaire est absente (dev local sans credentials).
 */
export function shouldUseMyUnisoftMock(): boolean {
  return !process.env.MYUNISOFT_THIRD_PARTY_SECRET?.trim();
}
