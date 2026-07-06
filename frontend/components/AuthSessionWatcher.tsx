"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthSessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthExpired = () => {
      router.replace("/login");
    };

    window.addEventListener("timeora:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("timeora:auth-expired", handleAuthExpired);
  }, [router]);

  return null;
}
