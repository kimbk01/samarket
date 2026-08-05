/**
 * Common Auth Completion Pipeline — Slice 2-1 public surface.
 * Provider cutover is Slice 2-2+; do not dual-import legacy completion beside this for the same request.
 */

export {
  COMMON_AUTH_COMPLETION_OWNERS,
  COMMON_AUTH_COMPLETION_STAGE,
  INTERACTION_READY_POLICY,
  type CommonAuthCompletionStage,
  type CommonProviderAuthResult,
  type InteractionReadyPolicy,
} from "@/lib/auth/completion/types";

export {
  ensureAuthProfileForLogin,
  type EnsureAuthProfileForLoginOptions,
  type EnsureAuthProfileForLoginResult,
} from "@/lib/auth/completion/ensure-auth-profile-for-login.server";

export {
  resolveCommonAuthDestination,
  type ResolveCommonAuthDestinationInput,
  type ResolveCommonAuthDestinationResult,
} from "@/lib/auth/completion/resolve-common-auth-destination.server";

export {
  buildNativeAuthCompletionHandoff,
  type NativeAuthCompletionHandoff,
  type NativeExchangeHandoffSource,
} from "@/lib/auth/completion/build-native-auth-completion-handoff.client";
