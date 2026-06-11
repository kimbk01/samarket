import type { Profile } from "@/lib/types/profile";
import { isDibayIdComplete } from "@/lib/auth/dibay-signup-status";

/** 클라이언트 프로필 캐시 기준 DIBAY 가입(@id 확정) 완료 여부 */
export function isClientSignupComplete(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  if (user.onboarding_completed_at) return true;
  return isDibayIdComplete({
    id: user.id,
    dibay_id: user.dibay_id,
    dibay_id_locked: user.dibay_id_locked,
    username: user.username,
    username_confirmed: user.dibay_id_locked === true ? true : undefined,
    onboarding_completed_at: user.onboarding_completed_at,
  });
}
