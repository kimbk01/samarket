# B4 Auth — proxy 가입 완료 재사용 · lifecycle 세대 공유

**Owner:** surge 근본 수정 순서 A1→B1→B2→B3→C→**B4** (설계 `cursor-root-cause-and-fundamental-fix-2026-11-18.md` §7).  
**Auth HARD LOCK:** Reopen §4 trigger **4** (보안·운영 — Production Supabase 요청 폭증으로 인스턴스 로컬 5초 lifecycle 캐시가 차단 반영·부하 계약을 동시에 깨뜨림). Owner 가 Phase B4 를 승인.  
**금지:** TTL만 늘리기.

## Contract delta (의미 불변)

| 판정 | 이전 | 이후 |
|---|---|---|
| 가입 완료 HTML 게이트 | 네비게이션마다 profiles(+동의 버전) | **완료만** proxy 신원 캐시와 같은 수명으로 기억. 미완료는 매번 확인. prefetch RSC 는 게이트 생략(실제 이동 때 확인). |
| API 읽기 lifecycle (P2-6) | 인스턴스 메모리 5초 | 로컬 5초 유지 + **Upstash에 status/deleted_at/epoch 공유**(벽시계 TTL 없음). 모더레이션 무효화 시 Redis 키 삭제 → 타 인스턴스는 즉시 DB 재조회. Redis 없으면 현행 로컬만. |
| PRODUCT_WRITE | bypassCache DB | **불변** |

Session / Destination / Completion / Profile writer 의미 변경 없음.

## Files

- `lib/auth/proxy-auth-session-cache.ts` — signupComplete 플래그
- `lib/auth/proxy-signup-gate.ts` · `proxy.ts` — 완료 기억 · prefetch skip
- `lib/auth/member-lifecycle-authority-shared.ts` — Redis get/set/del
- `lib/auth/member-lifecycle-authority-cache.ts` · `resolve-member-lifecycle-authority.ts` · `invalidate-member-auth-caches.ts`
- `docs/auth-hard-lock.md` Amendment

## 롤백

공유 Redis 키 prefix `sm:mla:` 삭제 + 플래그/호출 제거. 로컬 5초만으로 복귀.
