"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export function AuthSessionWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleAuthExpired = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      if (!PUBLIC_PATHS.has(pathname || "/")) {
        router.replace("/login");
      }
    };

    window.addEventListener("timeora:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("timeora:auth-expired", handleAuthExpired);
  }, [router, pathname]);

  return null;
}
