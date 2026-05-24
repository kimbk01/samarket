import type { HomeHubDomainDialContext } from "@/lib/delivery/resolve-delivery-domain-dial-item-href";

/** 하단 홈 다이얼 — 현재 레일에서 강조할 칩(`community`·`home`·`stores` 중 하나) */
export type HomeHubDialEmphasizedTabId = "home" | "stores";

export function resolveHomeHubDialEmphasizedTabId(
  dialContext: HomeHubDomainDialContext
): HomeHubDialEmphasizedTabId {
  return dialContext === "trade" ? "home" : "stores";
}
