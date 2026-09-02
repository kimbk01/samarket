/**
 * Platform Popup — public barrel (CUT 1–5).
 */

export * from "@/lib/platform-popup/types";
export * from "@/lib/platform-popup/surfaces";
export * from "@/lib/platform-popup/resolve-dibay-surface";
export * from "@/lib/platform-popup/suppression";
export * from "@/lib/platform-popup/cta";
export * from "@/lib/platform-popup/critical-ui-context";
export * from "@/lib/platform-popup/campaign-lifecycle";
export * from "@/lib/platform-popup/resolve-popup-ad";
export * from "@/lib/platform-popup/events";
export * from "@/lib/platform-popup/creative-contract";
export * from "@/lib/platform-popup/admin-transitions";
export * from "@/lib/platform-popup/popup-runtime-context";
export * from "@/lib/platform-popup/popup-host-machine";
export * from "@/lib/platform-popup/popup-stale-guard";
export * from "@/lib/platform-popup/popup-app-session";
export * from "@/lib/platform-popup/popup-impression-boundary";
export * from "@/lib/platform-popup/admin-campaign-authority";
export * from "@/lib/platform-popup/admin-campaign-loader";
export * from "@/lib/platform-popup/admin-campaign-writer";
export * from "@/lib/platform-popup/popup-presentation-types";
export * from "@/lib/platform-popup/popup-geometry-tokens";
export * from "@/lib/platform-popup/record-popup-event-client";
export * from "@/lib/platform-popup/owner-request-types";
export * from "@/lib/platform-popup/owner-request-lifecycle";
export * from "@/lib/platform-popup/platform-popup-owner-routes";
// Server-only CUT 5 modules (loader/writer/approve) — import directly from file paths,
// never from this barrel (keeps GlobalPopupHost / client graph free of BC/push).
