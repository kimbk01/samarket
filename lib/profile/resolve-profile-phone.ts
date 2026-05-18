import {
  PH_LOCAL_MOBILE_DB_RE,
  PH_LOCAL_MOBILE_LENGTH,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";

export type ProfilePhoneRowSlice = {
  phone?: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
};

/**
 * `profiles` 행에서 앱·주문·표시용 DB 형식(`09` + 9자리) 연락처를 복원한다.
 * - `phone` 이 비어 있고 `phone_number` 만 채워진 레거시·관리자 수동 생성 행을 커버한다.
 */
export function resolveProfilePhoneDb09(row: ProfilePhoneRowSlice): string | null {
  const fromPhone = parsePhMobileInput(String(row.phone ?? "").trim());
  if (fromPhone.length === PH_LOCAL_MOBILE_LENGTH && PH_LOCAL_MOBILE_DB_RE.test(fromPhone)) {
    return fromPhone;
  }

  const numRaw = String(row.phone_number ?? "").trim();
  if (!numRaw) {
    return fromPhone.length > 0 ? fromPhone : null;
  }

  const fromNumOnly = parsePhMobileInput(numRaw);
  if (fromNumOnly.length === PH_LOCAL_MOBILE_LENGTH && PH_LOCAL_MOBILE_DB_RE.test(fromNumOnly)) {
    return fromNumOnly;
  }

  const cc = String(row.phone_country_code ?? "+63").trim() || "+63";
  const ccDigits = cc.replace(/[^\d+]/g, "");
  const national = numRaw.replace(/^\+/, "").replace(/^0+/, "");
  const stitched = parsePhMobileInput(`${ccDigits}${national}`);
  if (stitched.length === PH_LOCAL_MOBILE_LENGTH && PH_LOCAL_MOBILE_DB_RE.test(stitched)) {
    return stitched;
  }

  const norm = normalizePhMobileDb(numRaw);
  return norm;
}

/** DB `09…` 한 건 → `profiles` 저장용 `phone` / `phone_country_code` / `phone_number` */
export function profilePhoneStorageFieldsFromDb09(db09: string | null | undefined): {
  phone: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
} {
  const norm = db09 ? normalizePhMobileDb(db09) : null;
  if (!norm) {
    return { phone: null, phone_country_code: null, phone_number: null };
  }
  return {
    phone: norm,
    phone_country_code: "+63",
    phone_number: norm.slice(1),
  };
}

/** 읽기 파이프라인·API 응답용 — `phone` 필드를 항상 복원된 값으로 맞춘다. */
export function hydrateProfileRowPhone<T extends ProfilePhoneRowSlice>(row: T): T {
  const resolved = resolveProfilePhoneDb09(row);
  if (!resolved) return row;
  const fields = profilePhoneStorageFieldsFromDb09(resolved);
  return {
    ...row,
    phone: fields.phone,
    phone_country_code: row.phone_country_code ?? fields.phone_country_code,
    phone_number: row.phone_number ?? fields.phone_number,
  };
}
