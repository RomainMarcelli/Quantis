// lib/email/templates/verificationEmailTemplate.ts
// Génère le template transactionnel de vérification de compte dans la DA Vyzor.
type VerificationEmailTemplateInput = {
  firstName?: string;
  verificationUrl: string;
};

export function buildVerificationEmailTemplate({
  firstName,
  verificationUrl
}: VerificationEmailTemplateInput): { subject: string; html: string; text: string } {
  const subject = "Confirmez votre compte Vyzor";
  const safeFirstName = firstName?.trim() || "Bonjour";

  const html = `
  <!doctype html>
  <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${subject}</title>
    </head>
    <body style="margin:0;padding:0;background:#09090b;color:#e4e4e7;font-family:Inter,Segoe UI,Arial,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#09090b;">
        <tr>
          <td align="center">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#111218;border:1px solid #27272a;border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:26px 32px 10px 32px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#a1a1aa;">Vyzor</td>
              </tr>
              <tr>
                <td style="padding:0 32px 0 32px;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;">
                  Activez votre <span style="color:#C5A059;">compte sécurisé</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 0 32px;font-size:15px;line-height:1.65;color:#d4d4d8;">
                  ${safeFirstName}, votre espace Vyzor est presque prêt. Confirmez votre adresse email pour finaliser l'activation.
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px 0 32px;">
                  <a href="${verificationUrl}" style="display:inline-block;background:#C5A059;color:#09090b;text-decoration:none;border-radius:12px;padding:13px 20px;font-weight:700;font-size:14px;">
                    Confirmer mon email
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 0 32px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #27272a;border-radius:12px;background:#0b0c10;">
                    <tr>
                      <td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#a1a1aa;">
                        Si vous ne voyez pas l'email dans votre boîte principale, vérifiez aussi votre dossier spam/courrier indésirable.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 24px 32px;font-size:13px;line-height:1.65;color:#a1a1aa;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur:<br />
                  <a href="${verificationUrl}" style="color:#f4f4f5;word-break:break-all;">${verificationUrl}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 22px 32px;border-top:1px solid #27272a;font-size:12px;color:#71717a;">
                  Vyzor - Cockpit financier pour PME
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  const text = `${safeFirstName}, confirmez votre compte Vyzor via ce lien: ${verificationUrl}\n\nSi vous ne trouvez pas l'email, vérifiez aussi votre dossier spam.`;

  return {
    subject,
    html,
    text
  };
}
