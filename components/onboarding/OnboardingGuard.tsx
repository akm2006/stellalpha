"use client";

import React from "react";
import { useOnboarding } from "@/contexts/onboarding-context";
import { usePathname } from "next/navigation";
import PageLoader from "../PageLoader";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isOpen, step } = useOnboarding();
  const pathname = usePathname();

  // Pages that REQUIRE onboarding engagement before loading content
  const isProtectedPage = pathname?.includes('/demo-vault') || pathname?.includes('/star-traders');

  // We show the loader ONLY if:
  // 1. We are on a protected page
  // 2. The onboarding wizard is open
  // 3. The user has NOT started the flow yet (still on WELCOME step)
  if (isProtectedPage && isOpen && step === 'WELCOME') {
    return (
      <div className="relative min-h-screen w-full bg-[#050505]">
        <PageLoader />
      </div>
    );
  }

  return <>{children}</>;
}
