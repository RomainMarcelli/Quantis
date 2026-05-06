"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { firebaseAuthGateway } from "@/services/auth";
import { isAdmin } from "@/lib/auth/isAdmin";

export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "allowed">("loading");

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
        return;
      }

      if (!isAdmin(nextUser.email)) {
        router.replace("/403");
        return;
      }

      setStatus("allowed");
    });

    return unsubscribe;
  }, [router, pathname]);

  if (status !== "allowed") return null;
  return <>{children}</>;
}
