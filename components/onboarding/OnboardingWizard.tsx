"use client";

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useOnboarding } from '@/contexts/onboarding-context';
import { WelcomeStep } from './steps/WelcomeStep';
import { AuthStep } from './steps/AuthStep';
import { DeployStep } from './steps/DeployStep';
import { TourStep } from './steps/TourStep';
import { CompleteStep } from './steps/CompleteStep';
import { OnboardingTopBar } from './OnboardingTopBar';

export function OnboardingWizard() {
  const { isOpen, step } = useOnboarding();
  const pathname = usePathname();
  const router = useRouter();

  // Ensure we are on the right page for the Tour step
  // Removed aggressive redirect loop to prevent blocking navigation
  // The TourStep component itself checks pathname before rendering



  if (!isOpen) return null;

  return (
    <>
      <OnboardingTopBar />
      {(() => {
        switch (step) {
          case 'WELCOME':
            return <WelcomeStep />;
          case 'AUTH':
            return <AuthStep />;
          case 'DEPLOY':
            return <DeployStep />;
          case 'TOUR':
             // Only render the TourStep overlay if we are actually on the star-traders page
            if (pathname === '/star-traders') return <TourStep />;
            return null;
          case 'ALLOCATE':
          case 'INITIALIZE':
            return null; 
          case 'COMPLETE':
            return <CompleteStep />;
          default:
            return null;
        }
      })()}
    </>
  );
}
