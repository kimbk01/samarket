import type { SimulatedDeliveryOrder } from "./types";

const KEY = "kasama_sim_delivery_orders_v1";

function readAll(): Record<string, SimulatedDeliveryOrder> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, SimulatedDeliveryOrder>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export function persistSimulatedOrder(order: SimulatedDeliveryOrder): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[order.id] = order;
  sessionStorage.setItem(KEY, JSON.stringify(all));
}

export function loadSimulatedOrder(id: string): SimulatedDeliveryOrder | null {
  const all = readAll();
  return all[id.trim()] ?? null;
}
