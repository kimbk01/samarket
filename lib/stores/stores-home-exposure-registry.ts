/**
 * CUT3 — per-feed local exposure registry (not a global singleton).
 * Role-aware: HOME 전체 storeId 1회 금지가 아니라 surface role별 exposure 추적.
 */
export type StoresHomeExposureRole =
  | "slot0_product"
  | "slot1_primary"
  | "horizontal_discovery"
  | "final_row";

const HORIZONTAL_ROLES: readonly StoresHomeExposureRole[] = [
  "slot0_product",
  "slot1_primary",
  "horizontal_discovery",
];

export class StoresHomeExposureRegistry {
  private readonly storeRoles = new Map<string, Set<StoresHomeExposureRole>>();
  private readonly productIds = new Set<string>();
  /** horizontal surface 노출 순서 — adjacent repeat 방지 */
  private readonly horizontalExposureOrder: string[] = [];

  hasRole(storeId: string, role: StoresHomeExposureRole): boolean {
    const id = String(storeId ?? "").trim();
    if (!id) return false;
    return this.storeRoles.get(id)?.has(role) ?? false;
  }

  wasExposedInRoles(storeId: string, roles: readonly StoresHomeExposureRole[]): boolean {
    const id = String(storeId ?? "").trim();
    if (!id) return false;
    const set = this.storeRoles.get(id);
    if (!set) return false;
    return roles.some((r) => set.has(r));
  }

  isInSlot0(storeId: string): boolean {
    return this.hasRole(storeId, "slot0_product");
  }

  registerStore(storeId: string, role: StoresHomeExposureRole): void {
    const id = String(storeId ?? "").trim();
    if (!id) return;
    const roles = this.storeRoles.get(id) ?? new Set<StoresHomeExposureRole>();
    roles.add(role);
    this.storeRoles.set(id, roles);
    if (HORIZONTAL_ROLES.includes(role)) {
      this.horizontalExposureOrder.push(id);
    }
  }

  registerProduct(productId: string): void {
    const id = String(productId ?? "").trim();
    if (!id) return;
    this.productIds.add(id);
  }

  hasProduct(productId: string): boolean {
    const id = String(productId ?? "").trim();
    return id.length > 0 && this.productIds.has(id);
  }

  wasRecentlyExposedHorizontally(storeId: string, window = 1): boolean {
    const id = String(storeId ?? "").trim();
    if (!id || this.horizontalExposureOrder.length === 0) return false;
    const tail = this.horizontalExposureOrder.slice(-window);
    return tail.includes(id);
  }

  get lastHorizontalStoreId(): string | null {
    return this.horizontalExposureOrder.at(-1) ?? null;
  }
}
