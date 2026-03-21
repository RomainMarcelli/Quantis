// lib/email/templates/passwordResetEmailTemplate.ts
// Genere le template transactionnel de reinitialisation mot de passe dans la DA Quantis.
type PasswordResetEmailTemplateInput = {
  firstName?: string;
  resetUrl: string;
};

export function buildPasswordResetEmailTemplate({
  firstName,
  resetUrl
}: PasswordResetEmailTemplateInput): { subject: string; html: string; text: string } {
  const subject = "Reinitialisez votre mot de passe Quantis";
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
                <td style="padding:26px 32px 10px 32px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#a1a1aa;">Quantis</td>
              </tr>
              <tr>
                <td style="padding:0 32px 0 32px;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;">
                  Reinitialisez votre <span style="color:#C5A059;">mot de passe</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 0 32px;font-size:15px;line-height:1.65;color:#d4d4d8;">
                  ${safeFirstName}, une demande de reinitialisation a ete effectuee pour votre compte Quantis.
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 0 32px;font-size:14px;line-height:1.6;color:#a1a1aa;">
                  Si c'etait bien vous, cliquez sur le bouton ci-dessous pour definir un nouveau mot de passe.
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px 0 32px;">
                  <a href="${resetUrl}" style="display:inline-block;background:#C5A059;color:#09090b;text-decoration:none;border-radius:12px;padding:13px 20px;font-weight:700;font-size:14px;">
                    Reinitialiser mon mot de passe
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 0 32px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #27272a;border-radius:12px;background:#0b0c10;">
                    <tr>
                      <td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#a1a1aa;">
                        Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email. Votre mot de passe restera inchange.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 24px 32px;font-size:13px;line-height:1.65;color:#a1a1aa;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur:<br />
                  <a href="${resetUrl}" style="color:#f4f4f5;word-break:break-all;">${resetUrl}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 22px 32px;border-top:1px solid #27272a;font-size:12px;color:#71717a;">
                  Quantis - Cockpit financier pour PME
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  const text = `${safeFirstName}, reinitialisez votre mot de passe Quantis via ce lien: ${resetUrl}\n\nSi vous n'etes pas a l'origine de cette demande, ignorez cet email.`;

  return {
    subject,
    html,
    text
  };
}
