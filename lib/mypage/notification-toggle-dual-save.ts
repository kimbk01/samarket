/**
 * 알림 전체 토글처럼 저장소 두 곳(`user_settings` + 도메인 `notification-settings`)을 함께 바꾸는 저장 (최종 설계 S11).
 * 둘 중 하나라도 실패하면 **둘 다** 원래 값으로 되돌린다(성공한 쪽은 되돌림 저장을 한 번 더 보낸다).
 * 반환 = 최종 성공 여부(실패면 화면은 원위치 + 토스트).
 */
export async function saveDualNotificationToggle(input: {
  next: boolean;
  prev: boolean;
  saveUser: (value: boolean) => Promise<boolean>;
  saveDomain: (value: boolean) => Promise<boolean>;
}): Promise<boolean> {
  const safe = async (fn: (v: boolean) => Promise<boolean>, v: boolean) => {
    try {
      return await fn(v);
    } catch {
      return false;
    }
  };
  const [userOk, domainOk] = await Promise.all([safe(input.saveUser, input.next), safe(input.saveDomain, input.next)]);
  if (userOk && domainOk) return true;
  const reverts: Promise<boolean>[] = [];
  if (userOk) reverts.push(safe(input.saveUser, input.prev));
  if (domainOk) reverts.push(safe(input.saveDomain, input.prev));
  await Promise.all(reverts);
  return false;
}
