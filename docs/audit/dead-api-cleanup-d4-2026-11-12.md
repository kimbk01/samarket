# 죽은 API 정리 D4 결과 (2026-11-12)

- 감사 문서: `docs/audit/dead-code-cleanup-audit-2026-11-12.md` §5 · 브랜치 `chore/dead-api-cleanup-d4` · 기준 origin/main 9aa207a84
- 판정 근거: 서브에이전트 3개가 URL 헬퍼·네이티브(Android·iOS)·웹훅·cron 까지 추적 → 최신 main 에서 호출 문자열 0 재확인

## 삭제 57개 라우트 · 2,946줄

| URL | 분류 | 근거 |
|---|---|---|
| `/api/admin/community-messenger-home-cutover-gate` | 호출 0 | fetch 없음(lib·테스트만) |
| `/api/admin/community-messenger/friend-requests/[id]` | 호출 0 | UI 는 비관리자 friend-requests 만 호출 |
| `/api/admin/community-messenger/reports/[id]/action` | 호출 0 | 관리자 UI 는 /api/admin/reports/[id]/action 사용 |
| `/api/admin/community-messenger/rooms/[id]/ghost` | 호출 0 | 계약 테스트가 「더 이상 호출 안 함」 단언 |
| `/api/admin/community/point-ledger` | 호출 0 | UI 는 /api/admin/community/points 사용 |
| `/api/admin/delivery/bottom-nav` | 재수출 별칭·호출 0 | /api/admin/stores/bottom-nav 재수출, 페이지는 redirect |
| `/api/admin/notification-settings/upload-sound` | 호출 0 | UI 는 notification-sound-ssot/upload 사용 |
| `/api/admin/notification-sound-ssot/preview-resolver` | 호출 0 | 감사 테스트 목록에만 있음 |
| `/api/admin/philife-reports` | 재수출 별칭·호출 0 | community-reports 재수출, 호출 0 |
| `/api/admin/philife-reports/[id]` | 재수출 별칭·호출 0 | community-reports/[id] 재수출, 호출 0 |
| `/api/admin/philife/sections` | 재수출 별칭·호출 0 | community/sections 재수출, 호출 0 |
| `/api/admin/philife/sections/[id]` | 재수출 별칭·호출 0 | 재수출, 호출 0 |
| `/api/admin/philife/settings` | 재수출 별칭·호출 0 | community/settings 재수출, 호출 0 |
| `/api/admin/philife/topics` | 재수출 별칭·호출 0 | 재수출, 호출 0 |
| `/api/admin/philife/topics/[id]` | 재수출 별칭·호출 0 | 재수출, 호출 0 |
| `/api/admin/trade-ad-products/[id]` | 호출 0 | 타입 import 만 |
| `/api/app/notification-sound-config` | 호출 0 | 테스트가 「더 이상 fetch 안 함」 단언 |
| `/api/app/order-match-alert-sound` | 호출 0 | fetch 없음 |
| `/api/admin/delivery-ads/business-cash/charge-requests/[id]` | 이미 410 | 410 |
| `/api/admin/gift-certificates/conversions/[id]/approve` | 이미 410 | 410 |
| `/api/admin/startup-config/upload-image` | 이미 410 | 410 |
| `/api/admin/store-settlements` | 이미 410 | 410 |
| `/api/admin/store-settlements/[settlementId]` | 이미 410 | 410 |
| `/api/admin/trade-post-ads/[id]` | 이미 410 | 410 legacy_read_only |
| `/api/categories/trade-expand-ids` | 호출 0 | 호출 0 |
| `/api/chat/rooms/[roomId]/job-contact` | 호출 0 | 호출 0 |
| `/api/community-messenger/blocked` | 호출 0 | 차단은 /api/me/relations/blocked 사용 |
| `/api/community-messenger/group-rooms/[roomId]/messages` | 호출 0 | 방 전송은 rooms/[id]/messages 사용 |
| `/api/delivery/search` | 재수출 별칭·호출 0 | /api/stores/search 재수출, 호출 0 |
| `/api/feed/candidates` | 호출 0 | 호출 0 |
| `/api/feed/home-policies` | 호출 0 | 호출 0 |
| `/api/feed/personalized-policies` | 호출 0 | 호출 0 |
| `/api/me/addresses/[id]/set-default` | 호출 0 | 정책 표에만, UI 는 PATCH /api/me/addresses/[id] |
| `/api/me/delivery-ads/performance` | 호출 0 | UI 는 /api/me/delivery-ads/[campaignId]/performance |
| `/api/me/points/promotion-orders/[id]` | 호출 0 | 목록 루트만 호출 |
| `/api/me/store-owner-hub-badge/store-attention` | 호출 0 | 루트 배지 URL 만 호출 |
| `/api/me/store-owner-hub-badge/unreads` | 호출 0 | 루트 배지 URL 만 호출 |
| `/api/me/stores/[storeId]/gift-certificates/cash-outs` | 이미 410 | 410 |
| `/api/me/stores/[storeId]/gift-certificates/conversions` | 이미 410 | POST 410, GET 호출 0 |
| `/api/me/stores/[storeId]/gift-certificates/revenue` | 이미 410 | 410 |
| `/api/me/stores/[storeId]/orders/[orderId]/delivery` | 호출 0 | 호출 0 |
| `/api/me/stores/[storeId]/orders/[orderId]/review` | 호출 0 | UI 는 reviews/[rid]/reply 사용 |
| `/api/me/stores/[storeId]/platform-inquiries` | 이미 410 | POST 410, GET 호출 0 |
| `/api/me/stores/[storeId]/point-charges` | 이미 410 | 410 |
| `/api/me/stores/[storeId]/points` | 이미 410 | 410 |
| `/api/my/purchases/[chatId]` | 호출 0 | 루트 /api/my/purchases 만 호출 |
| `/api/posts/[postId]/related` | 호출 0 | RSC 로 대체, fetch 0 |
| `/api/posts/[postId]/trade-ads/apply` | 이미 410 | 410 AD-P0-3 |
| `/api/posts/[postId]/trade-ads/products` | 호출 0 | 호출 0 |
| `/api/stores/[slug]/inquiries` | 호출 0 | 매장 문의는 /api/me/stores/[id]/inquiries |
| `/api/system/messenger-monitoring-summary` | 호출 0 | 개발 전용(운영 404), 문서에만 |
| `/api/system/supabase-connectivity` | 호출 0 | 개발 진단, 호출 0 |
| `/api/system/supabase-project` | 호출 0 | 개발 진단, 호출 0 |
| `/api/test-logout` | 호출 0 | 호출 0 (test-login 쌍) |
| `/api/trade/product-chat/[roomId]/submit-review` | 이미 410 | 410, 호출 0 |
| `/api/users/by-username/[username]/community-posts` | 호출 0 | 호출 0 |
| `/api/users/by-username/[username]/public-profile` | 호출 0 | 제품은 /api/users/[id]/public-profile |

## 감사 목록에 있었지만 남긴 것

| URL | 이유 |
|---|---|
| `/api/admin/store-point-charges/[id]` · `/api/admin/store-points/[storeId]/adjust` | 어드민 권한 hard-lock(`admin-real-operation-cut-a-authority-hard-lock` + verify 스크립트)이 410 묘비로 고정 — 잠금 변경은 별도 승인 |
| `/api/admin/store-orders/[orderId]/approve-refund·cancel-request·mark-paid` | `admin-legacy-order-write-gate.ts` 차단 목록 + `verify-store-order-recovery-integrity` 가 고정 |
| `/api/admin/notification-settings` | 알림 소리 SSOT 계약 스크립트가 읽음 (하위 `upload-sound` 는 삭제) |
| `/api/chat/rooms/[roomId]/trade-status` | `trade-bridge-exit-conditions.ts` 가 모듈 경로로 참조 |
| `/api/me/store-coupons/claim·claimable·checkout-quote` | 무료 쿠폰 QA 스위트(scripts/qa/free-coupon-*) 가 실제로 호출 — 죽은 코드가 아니라 시험 도구 |
| `/api/admin/notification-campaigns/[campaignId]/test-send` · `/api/community-messenger/rooms/[roomId]/room-snapshot-diagnostics-e2e` | 알림 QA·E2E 진단 도구가 호출 |
| `/api/community/neighborhood-feed` 등 `/api/community/*` 4개 | 실제 핸들러 — philife 주소가 재수출해서 사용 중 |
| 통화 `calls/[sessionId]/*`·`calls/stub-message` | 통화 변경 규정 → D5 |
| `/api/auth/oauth/callback` | 외부 콘솔 redirect URI 등록 여부 NOT_PROVEN |
| `/api/trade/product-chat/[roomId]/buyer-confirm` | **결함** — 410 인데 화면이 호출 (보고만) |

## 같이 고친 것
- `lib/auth/member-consent-mutation-policy.ts`: 삭제 라우트 2줄 (set-default · orders/[orderId]/delivery)
- `lib/auth/__fixtures__/member-p0-mutation-classification.csv`: 삭제 라우트 12행 → `member-p0-r3-fail-closed` 수치 18→17, 294→283
- `services/trade/trade-detail.service.ts`: 지운 `/related` API 주석 정정
- `lib/i18n/quality/i18n-quality-baseline.json`: 지운 라우트 항목 제거 (`check:i18n-quality:baseline`)
- 계약 시험 20개: 지운 라우트를 읽던 단언·항목만 제거 (살아 있는 라우트 단언 유지, 시험 파일 삭제 0)

## 남은 위험
- 저장소 밖 호출자(외부 스크립트·북마크·구 앱)가 있었다면 410/200 → 404 로 바뀜. 저장소·네이티브 코드 안에는 호출 0 확인. 운영 로그 기준 호출 여부는 NOT_PROVEN.
