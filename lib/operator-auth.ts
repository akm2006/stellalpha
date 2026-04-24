import { getSession } from '@/lib/session';
import { getLivePilotPublicConfig } from '@/lib/live-pilot/config';
import type { LivePilotPublicConfig } from '@/lib/live-pilot/config';

export interface OperatorAccessDenied {
  ok: false;
  status: 401 | 403;
  error: string;
}

export interface OperatorAccessGranted {
  ok: true;
  operatorWallet: string;
  config: LivePilotPublicConfig;
}

export async function getOperatorAccess(): Promise<OperatorAccessDenied | OperatorAccessGranted> {
  const session = await getSession();

  if (!session.isLoggedIn || !session.user?.wallet) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required',
    };
  }

  const config = getLivePilotPublicConfig();
  if (config.operatorWallets.length === 0) {
    return {
      ok: false,
      status: 403,
      error: 'PILOT_OPERATOR_WALLETS is not configured',
    };
  }

  if (!config.operatorWallets.includes(session.user.wallet)) {
    return {
      ok: false,
      status: 403,
      error: 'Authenticated wallet is not in the operator allowlist',
    };
  }

  return {
    ok: true,
    operatorWallet: session.user.wallet,
    config,
  };
}
