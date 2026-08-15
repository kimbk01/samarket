import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

/** RSC·서버 — `/api/me/address-defaults` 와 동일 스냅샷(마이페이지 첫 페인트용). */
export async function loadAddressDefaultsSnapshotServer(
  userId: string
): Promise<AddressDefaultsSnapshot | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const sb = tryGetSupabaseForStores();
  if (!sb) return null;
  try {
    const defaults = await getUserAddressDefaults(sb, uid);
    return {
      ok: true,
      status: 200,
      defaults: {
        master: defaults.master,
        life: null,
        trade: null,
        delivery: null,
      },
      neighborhoodFromLife: null,
    };
  } catch {
    return null;
  }
}
