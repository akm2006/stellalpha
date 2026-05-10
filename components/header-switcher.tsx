"use client";

import { usePathname } from "next/navigation";
import ModernHeader from "./modern-header";

export function HeaderSwitcher() {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  if (isLandingPage) {
    return null;
  }

  return <ModernHeader />;
}
