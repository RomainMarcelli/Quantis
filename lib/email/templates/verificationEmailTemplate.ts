type VerificationEmailTemplateInput = {
  firstName: string;
  verificationUrl: string;
};

export function buildVerificationEmailTemplate({
  firstName,
  verificationUrl
}: VerificationEmailTemplateInput): { subject: string; html: string; text: string } {
  const subject = "Activez votre compte Quantis";
  const safeFirstName = firstName?.trim() || "Bonjour";

  const html = `
  <!doctype html>
  <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${subject}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f5f7;">
        <tr>
          <td align="center">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:28px 32px 8px 32px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#6b7280;">Quantis</td>
              </tr>
              <tr>
                <td style="padding:0 32px 0 32px;font-size:30px;line-height:1.22;font-weight:700;color:#1a1a1a;">
                  Activez votre <span style="color:#d4af37;">compte securise</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 0 32px;font-size:15px;line-height:1.65;color:#4b5563;">
                  ${safeFirstName}, votre espace Quantis est presque pret. Cliquez sur le bouton ci-dessous pour verifier votre email et finaliser l'activation.
                </td>
              </tr>
              <tr>
                <td style="padding:22px 32px 0 32px;">
                  <a href="${verificationUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 20px;font-weight:600;font-size:14px;">
                    Verifier mon email
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 0 32px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;">
                    <tr>
                      <td style="padding:12px 14px;font-size:13px;line-height:1.5;color:#374151;">
                        Pensez a verifier votre dossier spam/courrier indesirable si vous ne voyez pas l'email dans votre boite principale.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px 20px 32px;font-size:13px;line-height:1.6;color:#6b7280;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur:<br />
                  <a href="${verificationUrl}" style="color:#1a1a1a;word-break:break-all;">${verificationUrl}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 32px 24px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                  Quantis - Financial Intelligence for SMEs
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  const text = `${safeFirstName}, activez votre compte Quantis via ce lien: ${verificationUrl}\n\nSi vous ne trouvez pas l'email, verifiez aussi votre dossier spam.`;

  return {
    subject,
    html,
    text
  };
}
