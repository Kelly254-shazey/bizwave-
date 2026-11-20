import { envConfig } from '../config/env.config';

// Explicit, reversible product preview access. This never grants RBAC permissions
// or bypasses tenant/branch checks; it only suspends these subscription gates.
const OPEN_PORTAL_FEATURES = ['predict_basic', 'predict_advanced', 'ai_assistant', 'connect_core'];

export function effectivePortalFeatures(planFeatures: string[]): string[] {
  return envConfig.featureGatingEnabled
    ? planFeatures
    : [...new Set([...planFeatures, ...OPEN_PORTAL_FEATURES])];
}
