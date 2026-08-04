import type { SupabaseClient } from "@supabase/supabase-js";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";

export type ResolveCommonAuthDestinationInput = {
  userId: string;
  next?: string | null;
  /** Injected for tests — production uses getOnboardingStatus */
  status?: OnboardingStatus | null;
};

export type ResolveCommonAuthDestinationResult = {
  destination: string;
  status: OnboardingStatus | null;
};

/**
 * Common Onboarding + Destination Resolution — single owner.
 * Hard gate remains consent/terms via resolvePostLoginRoute.
 */
export async function resolveCommonAuthDestination(
  sb: SupabaseClient,
  input: ResolveCommonAuthDestinationInput,
): Promise<ResolveCommonAuthDestinationResult> {
  const status =
    input.status !== undefined
      ? input.status
      : await getOnboardingStatus(sb, input.userId);

  const destination = resolvePostLoginRoute({
    hasSession: true,
    status,
    next: input.next ?? null,
  });

  return { destination, status };
}
