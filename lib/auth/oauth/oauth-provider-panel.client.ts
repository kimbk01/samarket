import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";

export const OAUTH_PROVIDER_PANEL_MS = MAIN_SHELL_ROUTE_TRANSITION_MS;

export type OAuthPanelPhase = "idle" | "entering" | "entered" | "exiting";

export type OAuthPanelStatus = "idle" | "preparing" | "opening" | "awaiting_return";

export function waitOAuthPanelTransitionMs(
  ms: number = OAUTH_PROVIDER_PANEL_MS,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
