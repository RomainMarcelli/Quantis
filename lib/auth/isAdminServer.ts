export function isAdminServer(email: string | null | undefined): boolean {
  if (!email) return false;

  const adminEmailsCsv = process.env.ADMIN_EMAILS ?? "";
  const adminEmails = adminEmailsCsv
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) return false;

  return adminEmails.includes(email.trim().toLowerCase());
}
