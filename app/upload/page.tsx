// File: app/upload/page.tsx
// Role: route dédiée au parcours "upload -> contexte entreprise -> analyse".
import { UploadPageView } from "@/components/upload/UploadPageView";

export default function UploadPage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <UploadPageView />
    </main>
  );
}
