// File: lib/config/routes.ts
// Role: source unique des routes de l'app. Modifier ici, pas dans les composants.
// Convention : les routes publiques (visiteur non authentifié) en haut, puis
// les routes par rôle (company_owner / firm_member), puis les routes API.

export const ROUTES = {
  // ─── Public ────────────────────────────────────────────────────────────
  HOME: "/",
  ONBOARDING: "/onboarding",
  LOGIN: "/login",
  /** Le repo utilise /register comme route de signup. /signup est un alias
   *  documenté ici pour cohérence sémantique mais n'est PAS une route active. */
  SIGNUP: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",

  // ─── Entreprise (company_owner) ────────────────────────────────────────
  SYNTHESE: "/synthese",
  ANALYSIS: "/analysis",
  DASHBOARD: "/synthese", // alias historique — on redirige sur synthèse
  DOCUMENTS: "/documents",
  ETATS_FINANCIERS: "/etats-financiers",
  ASSISTANT_IA: "/assistant-ia",
  SETTINGS: "/settings",
  ACCOUNT: "/account",

  // ─── Cabinet (firm_member) ─────────────────────────────────────────────
  CABINET_SETUP: "/cabinet/setup",
  CABINET_CONNECT: "/cabinet/onboarding/connect",
  CABINET_PICKER: "/cabinet/onboarding/picker",
  CABINET_PORTFOLIO: "/cabinet/portefeuille",
  CABINET_DOSSIER: (companyId: string) => `/cabinet/dossier/${companyId}`,
  CABINET_ADD_COMPANY: "/cabinet/entreprises/ajouter",
  CABINET_ADD_COMPANY_MANUAL: "/cabinet/entreprises/ajouter/manuel",

  // ─── Invitation dirigeant ──────────────────────────────────────────────
  INVITE_ACCEPT: (token: string) => `/invite/${token}`,

  // ─── API ───────────────────────────────────────────────────────────────
  API_MOCK_OAUTH: "/api/mock/oauth-firm-simulate",
  API_OAUTH_AUTHORIZE: "/api/integrations/pennylane/firm/authorize-url",
  API_OAUTH_CALLBACK: "/api/integrations/pennylane/firm/callback",
  API_CABINET_FIRM_CREATE: "/api/cabinet/firm/create",
  API_CABINET_PORTEFEUILLE: "/api/cabinet/portefeuille",
  API_CABINET_INVITE: "/api/cabinet/invite",
  API_INVITE_ACCEPT: "/api/invite/accept",
} as const;
