import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  adminCreateMemberAddressHasSelection,
  buildUserAddressSeedPayload,
  profileGeoFromAdminAddress,
  type AdminCreateMemberAddressInput,
} from "@/lib/admin-users/admin-create-member-address";
import { createUserAddress } from "@/lib/addresses/user-address-service";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { REGIONS } from "@/lib/products/form-options";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import { profilePhoneStorageFieldsFromDb09 } from "@/lib/profile/resolve-profile-phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateMemberApiField =
  | "username"
  | "password"
  | "nickname"
  | "name"
  | "email"
  | "contactPhone"
  | "address"
  | "addressDetail"
  | "accountType";

function jsonFieldError(
  field: CreateMemberApiField,
  errorKey: string,
  status: number,
  legacyMessage?: string
) {
  return NextResponse.json(
    {
      ok: false,
      field,
      errorKey,
      error: legacyMessage ?? errorKey,
    },
    { status }
  );
}

function mapProfileCreateError(message: string): { field: CreateMemberApiField; errorKey: string } | null {
  const lower = message.toLowerCase();
  if (
    lower.includes("profiles_nickname_lower_unique_idx") ||
    lower.includes("duplicate key") ||
    (lower.includes("unique") && lower.includes("nickname"))
  ) {
    return { field: "nickname", errorKey: "admin_users_err_nickname_taken" };
  }
  return null;
}

function parseAddressPayload(raw: unknown): AdminCreateMemberAddressInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = o.latitude != null ? Number(o.latitude) : null;
  const lng = o.longitude != null ? Number(o.longitude) : null;
  return {
    placeId: String(o.placeId ?? "").trim(),
    latitude: lat != null && Number.isFinite(lat) ? lat : null,
    longitude: lng != null && Number.isFinite(lng) ? lng : null,
    formattedAddress: String(o.formattedAddress ?? "").trim(),
    roadAddress: String(o.roadAddress ?? "").trim(),
    fullAddress: String(o.fullAddress ?? "").trim(),
    streetAddress: String(o.streetAddress ?? "").trim(),
    unitFloorRoom: String(o.unitFloorRoom ?? "").trim(),
    buildingName: String(o.buildingName ?? "").trim(),
    barangay: String(o.barangay ?? "").trim(),
    cityMunicipality: String(o.cityMunicipality ?? "").trim(),
    province: String(o.province ?? "").trim(),
    neighborhoodName: String(o.neighborhoodName ?? "").trim(),
    deliveryNote: String(o.deliveryNote ?? "").trim(),
  };
}

/**
 * 관리자 회원 수동 생성
 * - 일반 회원과 동일하게 Supabase `auth.users` + `public.profiles`(동일 PK = auth uid).
 * - `signInWithPassword`·RLS·`auth.uid()` 는 자가 가입 회원과 같은 경로로 동작.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireServiceKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

  let body: {
    username?: string;
    password?: string;
    nickname?: string;
    email?: string;
    name?: string;
    accountType?: string;
    contactPhone?: string;
    contactAddress?: string;
    regionCode?: string;
    cityCode?: string;
    addressStreetLine?: string;
    addressDetail?: string;
    addressPayload?: Record<string, unknown> & { seedNickname?: string };
  };
  try {
    body = await req.json();
  } catch {
    return jsonFieldError("email", "admin_users_err_bad_request", 400);
  }

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const nickname = String(body.nickname ?? "").trim();
  const emailRaw = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const accountTypeRaw = String(body.accountType ?? "development_member").trim().toLowerCase();
  if (accountTypeRaw === "admin") {
    return jsonFieldError(
      "accountType",
      "use_staff_api_for_admin_create",
      403,
      "관리자 생성은 Staff API를 사용해 주세요."
    );
  }
  const memberType = "normal";
  const contactPhoneRaw = String(body.contactPhone ?? "").trim();
  const contactAddressRaw = String(body.contactAddress ?? "").trim();
  const regionIdLegacy = String(body.regionCode ?? "").trim();
  const cityIdLegacy = String(body.cityCode ?? "").trim();
  const streetIn = String(body.addressStreetLine ?? "").trim().slice(0, 500);
  const detailIn = String(body.addressDetail ?? "").trim().slice(0, 500);
  const addressFromBody = parseAddressPayload(body.addressPayload);
  const seedNickname = String(body.addressPayload?.seedNickname ?? "home").trim() || "home";

  const phNorm = normalizeOptionalPhMobileDb(contactPhoneRaw);
  if (!phNorm.ok) {
    return jsonFieldError("contactPhone", "phone_rule", 400);
  }
  if (contactAddressRaw.length > 2000) {
    return jsonFieldError("address", "admin_users_err_address_too_long", 400);
  }

  if (!username || username.length < 2 || username.length > 64) {
    return jsonFieldError("username", "admin_users_err_username_length", 400);
  }
  if (!password || password.length < 4) {
    return jsonFieldError("password", "admin_users_err_password_min", 400);
  }
  if (!nickname || nickname.length > 20) {
    return jsonFieldError("nickname", "admin_users_err_nickname_length", 400);
  }
  if (!name || name.length > 50) {
    return jsonFieldError("name", "admin_users_err_name_length", 400);
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return jsonFieldError("email", "admin_users_err_email_invalid", 400);
  }
  if (!["development_member", "operations_member"].includes(accountTypeRaw)) {
    return jsonFieldError("accountType", "admin_users_err_account_type_invalid", 400);
  }

  if (addressFromBody && adminCreateMemberAddressHasSelection(addressFromBody)) {
    if (!addressFromBody.unitFloorRoom.trim()) {
      return jsonFieldError("addressDetail", "addr_ui_detail_required_err", 400);
    }
  } else if (addressFromBody && addressFromBody.placeId.trim()) {
    return jsonFieldError("address", "addr_ui_pick_search_result", 400);
  }

  const contactPhone = phNorm.value;
  const phoneFields = profilePhoneStorageFieldsFromDb09(contactPhone);
  const email = emailRaw;
  const nowIso = new Date().toISOString();

  let regionId = regionIdLegacy;
  let cityId = cityIdLegacy;
  let profileGeo: ReturnType<typeof profileGeoFromAdminAddress> | null = null;

  if (addressFromBody && adminCreateMemberAddressHasSelection(addressFromBody)) {
    profileGeo = profileGeoFromAdminAddress(addressFromBody);
    const inferred = profileGeo.region_code?.includes("|")
      ? profileGeo.region_code.split("|", 2)
      : null;
    if (inferred?.[0]) regionId = inferred[0];
    if (inferred?.[1]) cityId = inferred[1];
  }

  const region_code =
    profileGeo?.region_code ?? encodeProfileAppLocationStorage(regionId, cityId);
  const region_name =
    profileGeo?.region_name ?? buildProfileRegionNameForStorage(regionId, cityId);
  const address_street_line = profileGeo?.address_street_line ?? (streetIn || null);
  const address_detail = profileGeo?.address_detail ?? (detailIn || null);
  const latitude = profileGeo?.latitude ?? null;
  const longitude = profileGeo?.longitude ?? null;
  const full_address = profileGeo?.full_address ?? null;

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });
  const { data: nicknameRows } = await supabase
    .from("profiles")
    .select("id")
    .ilike("nickname", nickname)
    .limit(1);
  if (Array.isArray(nicknameRows) && nicknameRows.length > 0) {
    return jsonFieldError("nickname", "admin_users_err_nickname_taken", 409);
  }
  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nickname,
      full_name: name,
      username,
      login_id: username,
      provider: "admin_manual",
      auth_provider: "admin_manual",
      manual_account_type: accountTypeRaw,
    },
  });

  const id = created.user?.id;
  if (authError || !id) {
    return NextResponse.json(
      { ok: false, error: authError?.message || "실제 회원 생성에 실패했습니다.", field: "form" },
      { status: 500 }
    );
  }

  const requiredConsent = await resolveRequiredConsentVersions();

  const profileRow: Record<string, unknown> = {
    id,
    email,
    auth_login_email: email,
    display_name: nickname,
    username,
    nickname,
    realname: name,
    role: "user",
    ["is_admin"]: false,
    member_type: memberType,
    member_status: "active",
    verified_member_at: nowIso,
    manual_account_type: accountTypeRaw,
    is_special_member: false,
    phone: phoneFields.phone,
    phone_country_code: phoneFields.phone_country_code,
    phone_number: phoneFields.phone_number,
    phone_verified: true,
    phone_verification_status: "verified",
    phone_verified_at: nowIso,
    phone_verification_method: "admin_manual",
    status: "verified_user",
    preferred_country: "PH",
    provider: "admin_manual",
    auth_provider: "admin_manual",
    created_by_admin: admin.userId,
    last_login_at: nowIso,
    region_code,
    region_name,
    address_street_line,
    address_detail,
    latitude,
    longitude,
    full_address,
    terms_accepted_at: nowIso,
    privacy_accepted_at: nowIso,
    terms_version: requiredConsent.termsVersion,
    privacy_version: requiredConsent.privacyVersion,
  };
  const { error: profileError } = await (supabase as any).from("profiles").upsert(profileRow);
  if (profileError) {
    await supabase.auth.admin.deleteUser(id);
    const mapped = mapProfileCreateError(profileError.message);
    if (mapped) {
      return jsonFieldError(mapped.field, mapped.errorKey, 500, profileError.message);
    }
    return NextResponse.json({ ok: false, error: profileError.message, field: "form" }, { status: 500 });
  }

  const shouldSeedAddress =
    (addressFromBody && adminCreateMemberAddressHasSelection(addressFromBody)) ||
    (regionId && cityId);

  if (shouldSeedAddress) {
    try {
      const regionMeta = REGIONS.find((r) => r.id === regionId);
      const cityMeta = regionMeta?.cities.find((c) => c.id === cityId);
      const provinceLabel = addressFromBody?.province || regionMeta?.name || null;
      const cityLabel = addressFromBody?.cityMunicipality || cityMeta?.name || null;

      if (addressFromBody && adminCreateMemberAddressHasSelection(addressFromBody)) {
        const payload = buildUserAddressSeedPayload(addressFromBody, {
          recipientName: name || nickname,
          phoneNumber: phoneFields.phone_number,
          regionId,
          cityId,
        });
        payload.nickname = seedNickname;
        await createUserAddress(supabase as any, id, payload);
      } else if (regionId && cityId) {
        const streetParts = [streetIn, detailIn].filter(Boolean).join(", ").trim();
        const contactLine = contactAddressRaw.trim();
        const localityLine =
          provinceLabel && cityLabel ? `${provinceLabel} ${cityLabel}`.trim() : (region_name ?? "").trim();
        const fullAddress =
          [contactLine, streetParts, localityLine].filter((s) => s.length > 0).join(" · ").trim() ||
          localityLine ||
          "Philippines";

        await createUserAddress(supabase as any, id, {
          labelType: "home",
          nickname: seedNickname,
          recipientName: name || nickname,
          phoneNumber: phoneFields.phone_number,
          countryCode: "PH",
          countryName: "Philippines",
          province: provinceLabel,
          cityMunicipality: cityLabel,
          streetAddress: streetIn || null,
          unitFloorRoom: detailIn || null,
          fullAddress,
          appRegionId: regionId,
          appCityId: cityId,
          useForLife: true,
          useForTrade: true,
          useForDelivery: true,
          isDefaultMaster: true,
          isDefaultLife: true,
          isDefaultTrade: true,
          isDefaultDelivery: true,
        });
      }
    } catch (seedErr) {
      console.error("[admin/users/create] representative address seed failed", seedErr);
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id,
      username,
      nickname,
      name,
      email,
      role: "user",
      memberType,
      accountType: accountTypeRaw,
      phoneVerified: true,
    },
  });
}
