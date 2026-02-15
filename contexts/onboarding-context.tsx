"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useAppKitAccount } from '@reown/appkit/react';
import { useRouter, usePathname } from 'next/navigation';

export type OnboardingStep = 
  | 'WELCOME' 
  | 'AUTH' 
  | 'DEPLOY' 
  | 'TOUR' 
  | 'ALLOCATE' 
  | 'INITIALIZE'
  | 'COMPLETE';

interface OnboardingContextType {
  step: OnboardingStep;
  isOpen: boolean;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: OnboardingStep) => void;
  open: () => void;
  close: () => void;
  dismiss: () => void;
  deployVault: () => Promise<void>;
  isDeploying: boolean;
  deployError: string | null;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<OnboardingStep>('WELCOME');
  const [isOpen, setIsOpen] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Load state from local storage on mount
  useEffect(() => {
    const savedStep = localStorage.getItem('stellalpha_onboarding_step');
    const isCompleted = localStorage.getItem('stellalpha_onboarding_completed');
    const isDismissed = localStorage.getItem('stellalpha_onboarding_dismissed');
    
    // Only open if not completed AND not dismissed
    if (!isCompleted && !isDismissed) {
       // If not completed, open wizard
       // But only if we are on the home page or demo-vault page to avoid annoying users on other pages?
       // Requirement: "when a user lands in any page of the app with 0 trader state"
       setIsOpen(true);
       if (savedStep) {
         setStep(savedStep as OnboardingStep);
       }
    }
  }, []);

  // Check for vault existence AND trader states to auto-skip
  useEffect(() => {
    const checkVaultAndTraders = async () => {
      // Don't run this check if already completed or dismissed to save resources
      if (localStorage.getItem('stellalpha_onboarding_completed') || localStorage.getItem('stellalpha_onboarding_dismissed')) {
          return;
      }

      if (isAuthenticated && user?.wallet) {
        try {
          const res = await fetch(`/api/demo-vault?wallet=${user.wallet}`);
          const data = await res.json();
          
          if (data.exists) {
            setHasVault(true);
            
            // Check if user already has trader states (active user)
            if (data.traderStates && data.traderStates.length > 0) {
                // User is already using the product -> Mark as complete and close
                localStorage.setItem('stellalpha_onboarding_completed', 'true');
                setIsOpen(false);
                return;
            }

            // If vault exists but no traders, skip to TOUR or ALLOCATE
            if (step === 'WELCOME' || step === 'AUTH' || step === 'DEPLOY') {
               setStep('TOUR');
            }
          }
        } catch (e) {
          console.error("Failed to check vault", e);
        }
      }
    };
    
    checkVaultAndTraders();
  }, [isAuthenticated, user, step]); // Re-check when auth changes

  // Auto-advance from AUTH to DEPLOY when authenticated
  useEffect(() => {
    if (step === 'AUTH' && isConnected && isAuthenticated) {
        setStep('DEPLOY');
    }
  }, [step, isConnected, isAuthenticated]);

  // Wrapper to persist step changes
  const setStepWithPersistence = (newStep: OnboardingStep) => {
    setStep(newStep);
    localStorage.setItem('stellalpha_onboarding_step', newStep);
    
    // If completed, mark as such
    if (newStep === 'COMPLETE') {
      localStorage.setItem('stellalpha_onboarding_completed', 'true');
    }
  };

  const deployVault = async () => {
    if (!user?.wallet) return;
    setIsDeploying(true);
    setDeployError(null);
    try {
      const response = await fetch('/api/demo-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: user.wallet })
      });
      const data = await response.json();
      if (data.error) {
        setDeployError(data.error);
        throw new Error(data.error);
      } else {
        setHasVault(true);
        // Do not auto-advance to TOUR. Let DeployStep show success UI.
      }
    } catch (e: any) {
        setDeployError(e.message || 'Failed to deploy vault');
        throw e;
    } finally {
      setIsDeploying(false);
    }
  };

  const nextStep = () => {
    const steps: OnboardingStep[] = ['WELCOME', 'AUTH', 'DEPLOY', 'TOUR', 'ALLOCATE', 'INITIALIZE', 'COMPLETE'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      const next = steps[currentIndex + 1];
      setStepWithPersistence(next);
    } else {
      close();
      localStorage.setItem('stellalpha_onboarding_completed', 'true');
    }
  };

  const prevStep = () => {
    const steps: OnboardingStep[] = ['WELCOME', 'AUTH', 'DEPLOY', 'TOUR', 'ALLOCATE', 'INITIALIZE', 'COMPLETE'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      const prev = steps[currentIndex - 1];
      setStepWithPersistence(prev);
    }
  };

  const open = () => {
      // Clear dismissal if user manually opens it (optional, but good UX)
      localStorage.removeItem('stellalpha_onboarding_dismissed');
      setIsOpen(true);
  };
  
  const close = () => {
      setIsOpen(false);
  };

  const dismiss = () => {
      setIsOpen(false);
      localStorage.setItem('stellalpha_onboarding_dismissed', 'true');
  };

  return (
    <OnboardingContext.Provider value={{ 
      step, 
      isOpen, 
      nextStep, 
      prevStep, 
      setStep: setStepWithPersistence, 
      open, 
      close,
      dismiss,
      deployVault,
      isDeploying,
      deployError
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
