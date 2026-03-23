import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams?: Promise<{ oobCode?: string | string[]; mode?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = (await searchParams) ?? {};

  // Le token Firebase arrive via l'URL (oobCode) sur le handler custom.
  const oobCode = Array.isArray(params.oobCode) ? params.oobCode[0] ?? "" : params.oobCode ?? "";

  return (
    <main className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-10">
      <ResetPasswordForm oobCode={oobCode} />
    </main>
  );
}
