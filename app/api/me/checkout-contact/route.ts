import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { CheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { resolveProfileLocationAddressOneLine } from "@/lib/profile/profile-location";

export const dynamic = "force-dynamic";

/**
 * 매장 장바구니 등에서 자동 채움용.
 * 정책: 주문자(배달) 주소는 `user_addresses` 기본 배달지·프로필 주소를 우선하고,
 * `test_users.contact_*` 는 그다음(개발·테스트 보조). 매장 영업 주소와 혼동하지 않는다.
 */
export async function GET() {
  const uid = await getRouteUserId();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      contact_phone: null as string | null,
      contact_address: null as string | null,
      default_delivery: null as CheckoutDeliveryPayload | null,
    });
  }

  let contact_phone: string | null = null;
  let contact_address: string | null = null;

  const { data: tu } = await sb
    .from("test_users")
    .select("contact_phone, contact_address")
    .eq("id", uid)
    .maybeSingle();

  const testPhone = tu && typeof tu.contact_phone === "string" ? tu.contact_phone.trim() : "";
  const testAddress = tu && typeof tu.contact_address === "string" ? tu.contact_address.trim() : "";
  if (testPhone) contact_phone = testPhone;

  let default_delivery: CheckoutDeliveryPayload | null = null;
  try {
    const defs = await getUserAddressDefaults(sb, uid);
    if (defs.delivery) {
      default_delivery = toCheckoutDeliveryPayload(defs.delivery);
      const dp = defs.delivery.phoneNumber?.trim() ?? "";
      if (!contact_phone && dp) contact_phone = dp;
    }
  } catch {
    /* user_addresses 미마이그레이션 등 */
  }

  if (!contact_phone) {
    const { data: prof } = await sb.from("profiles").select("phone").eq("id", uid).maybeSingle();
    const ph = typeof prof?.phone === "string" ? prof.phone.trim() : "";
    if (ph) contact_phone = ph;
  }

  const { data: prof2 } = await sb
    .from("profiles")
    .select("region_name, region_code, postal_code, address_street_line, address_detail")
    .eq("id", uid)
    .maybeSingle();
  const fromProfile = resolveProfileLocationAddressOneLine({
    region_code: prof2?.region_code ?? null,
    region_name: prof2?.region_name ?? null,
    postal_code: prof2?.postal_code ?? null,
    address_street_line: prof2?.address_street_line ?? null,
    address_detail: prof2?.address_detail ?? null,
  }).trim();
  if (fromProfile) contact_address = fromProfile;
  if (!contact_address && testAddress) contact_address = testAddress;

  return NextResponse.json({
    ok: true,
    contact_phone,
    contact_address,
    default_delivery,
  });
}
