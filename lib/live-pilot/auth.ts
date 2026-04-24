import { getOperatorAccess } from '@/lib/operator-auth';
import type { LivePilotPublicConfig } from '@/lib/live-pilot/config';

export interface LivePilotAccessDenied {
  ok: false;
  status: 401 | 403;
  error: string;
}

export interface LivePilotOperatorAccess {
  ok: true;
  operatorWallet: string;
  config: LivePilotPublicConfig;
}

export async function getLivePilotOperatorAccess(): Promise<LivePilotAccessDenied | LivePilotOperatorAccess> {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      error:
        access.error === 'Authenticated wallet is not in the operator allowlist'
          ? 'Authenticated wallet is not in the live-pilot operator allowlist'
          : access.error,
    };
  }

  return access;
}
