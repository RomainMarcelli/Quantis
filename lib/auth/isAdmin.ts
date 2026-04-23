export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const adminEmailsCsv = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  const adminEmails = adminEmailsCsv
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) return false;

  return adminEmails.includes(email.trim().toLowerCase());
}
