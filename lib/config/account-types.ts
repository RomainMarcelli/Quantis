// File: lib/config/account-types.ts
// Role: constantes des types de compte. Tout le code conditionnel d'affichage
// ou de routing par rôle utilise ces valeurs (jamais de chaîne hard-codée).

export const ACCOUNT_TYPES = {
  COMPANY_OWNER: "company_owner",
  FIRM_MEMBER: "firm_member",
} as const;

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

/** Clés localStorage utilisées par le flow pré-auth. */
export const PRE_AUTH_STORAGE_KEYS = {
  accountType: "vyzor_account_type",
  firmName: "vyzor_firm_name",
  firmExpected: "vyzor_firm_expected_dossiers",
  inviteToken: "vyzor_invite_token",
  inviteCompanyId: "vyzor_invite_company_id",
  inviteEmail: "vyzor_invite_email",
} as const;
