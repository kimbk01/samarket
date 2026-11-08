import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVerifyPhone } from "@/lib/phone/verify-phone-number";

export type PhoneDuplicateHit = {
  profileId: string;
  matchedOn: "phone" | "phone_number";
  matchedValue: string;
};

/**
 * 다른 계정이 동일 번호를 `profiles.phone`(09/+63) 또는 `phone_number`(9자리) 로 쓰는지 검사.
 */
export async function findPhoneDuplicateOnOtherProfile(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string,
): Promise<PhoneDuplicateHit | null> {
  // 필리핀(09·+63 표기)·한국(+82) 공통 — `verify-phone-number` 단일 정의.
  const resolved = resolveVerifyPhone(inputPhone);
  const phoneVariants = resolved?.lookupVariants ?? [];
  const national = resolved?.storage.phone_number.trim() ?? "";

  const phoneChecks = phoneVariants.map(async (phone) => {
    const { data, error } = await sb
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .neq("id", userId)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0] as { id?: string } | undefined;
    if (row?.id) return { profileId: row.id, matchedOn: "phone" as const, matchedValue: phone };
    return null;
  });

  const nationalCheck =
    national.length > 0
      ? (async () => {
          const { data, error } = await sb
            .from("profiles")
            .select("id")
            .eq("phone_number", national)
            .neq("id", userId)
            .limit(1);
          if (error) throw new Error(error.message);
          const row = data?.[0] as { id?: string } | undefined;
          if (row?.id) {
            return { profileId: row.id, matchedOn: "phone_number" as const, matchedValue: national };
          }
          return null;
        })()
      : Promise.resolve(null);

  const hits = await Promise.all([...phoneChecks, nationalCheck]);
  return hits.find((h): h is PhoneDuplicateHit => h != null) ?? null;
}
