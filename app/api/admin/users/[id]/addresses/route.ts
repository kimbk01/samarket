import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_SELECT =
  "id,user_id,label_type,linked_store_id,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,place_id,formatted_address,road_address,detail_address,delivery_note,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,last_used_at,created_at,updated_at";

/** READ ONLY. Do not call listUserAddresses — that writer repairs defaults. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const [{ data: profile, error: profileError }, { data: rows, error: addressError }] = await Promise.all([
    gate.sb
      .from("profiles")
      .select("region_code, region_name, address_street_line, address_detail")
      .eq("id", userId)
      .maybeSingle(),
    gate.sb.from("user_addresses").select(ADDRESS_SELECT).eq("user_id", userId).eq("is_active", true),
  ]);

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message, code: "profile_load_failed" }, { status: 500 });
  }
  if (addressError) {
    return NextResponse.json({ ok: false, error: addressError.message, code: "address_load_failed" }, { status: 500 });
  }

  const prof = (profile ?? {}) as {
    region_code?: string | null;
    region_name?: string | null;
    address_street_line?: string | null;
    address_detail?: string | null;
  };
  const profileLines = resolveProfileLocationAddressLines({
    region_code: prof.region_code,
    region_name: prof.region_name,
    address_street_line: prof.address_street_line,
    address_detail: prof.address_detail,
  });

  const addresses = (rows ?? [])
    .map((row) => rowToUserAddressDTO(row as Record<string, unknown>))
    .filter((dto) => dto.userId);

  return NextResponse.json({
    ok: true,
    profileAddress: {
      regionCode: prof.region_code ?? null,
      regionName: prof.region_name ?? null,
      lines: profileLines,
    },
    addresses,
  });
}
