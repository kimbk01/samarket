# SAMarket Cleanup Inventory

현재 코드베이스를 개발에 영향 없도록 유지하면서, 개발 종료 시점에 삭제 또는 치환할 대상을 분류한 목록이다.

## 1차 안전 정리 완료

- `app/api/chat/unread-breakdown/route.ts`
- `lib/chats/order-chat-unread-breakdown-fetch.ts`
- `components/community/CommunityFeedClient.tsx`
- `components/admin/reports/AdminModerationActionPanel.tsx`
- `.next/` 개발 캐시 정리

## production

현재 유지 대상. 운영 기능 또는 핵심 기능 경로라서 삭제 대상이 아니다.

- `app/`
- `components/`
- `lib/`
- `next.config.js`
- `proxy.ts`

주의: 위 경로 안에도 `dev-only`, `test-only`, `mock-backed`, `deprecated` 파일이 일부 섞여 있다. 그 파일은 아래 분류를 따른다.

## test-only

테스트 계정/테스트 로그인 표면. production 에서는 항상 숨겨져야 하며, 실제 인증 전환이 끝나면 삭제 후보가 된다.

- `app/api/test-login/route.ts`
- `app/api/test-logout/route.ts`
- `components/auth/TestLoginBar.tsx`
- `components/my/MyTestLoginSection.tsx`
- `components/mock-auth/MockAuthProvider.tsx`
- `lib/config/test-users-surface.ts`
- `lib/auth/test-auth-store.ts`
- `lib/mock-auth/`
- `app/login/page.tsx`
  이 파일은 production 유지 대상이지만 테스트 로그인 UI 분기만 최종 제거 후보다.
- `components/my/MyAccountContent.tsx`
  테스트 회원가입 링크 분기만 최종 제거 후보다.

## dev-only

로컬 또는 스테이징 보조 표면. 운영 노출 금지.

- `lib/config/deploy-surface.ts`
- `lib/neighborhood/dev-sample-data.ts`
- `components/home-feed/HomeFeedViewExperimental.tsx`
- `components/stores/browse/MockStoreDetailView.tsx`
- `lib/stores/delivery-mock/`
- `lib/stores/browse-mock/`

## mock-backed

이름은 mock/sample 이지만 현재 화면이나 API 흐름이 아직 의존할 수 있다. 대체 전까지 삭제 금지.

- `lib/ads/mock-ad-data.ts`
- `lib/store-owner/mockOrders.ts`
- `lib/member-orders/mockMemberOrders.ts`
- `lib/reviews/mock-reviews.ts`
- `lib/points/mock-point-ledger.ts`
- `lib/points/mock-point-charge-requests.ts`
- `lib/point-policies/mock-point-event-policies.ts`
- `lib/point-policies/mock-point-probability-rules.ts`
- `lib/admin-users/mock-admin-users.ts`
- `lib/admin-reports/mock-admin-reports.ts`
- `lib/admin-reviews/mock-admin-trust-summaries.ts`
- `lib/admin-chats/mock-admin-chat-rooms.ts`
- `lib/admin-chats/mock-admin-chat-messages.ts`
- `lib/admin-dashboard/mock-dashboard-activity.ts`
- `lib/admin-dashboard/mock-dashboard-summaries.ts`
- `lib/recommendation-experiments/mock-experiment-metrics.ts`
- `lib/recommendation/mock-recommendation-analytics-summary.ts`
- `lib/personalized-feed/mock-user-behavior-profiles.ts`
- `lib/personalized-feed/mock-recent-views.ts`
- `lib/exposure/mock-exposure-candidates.ts`
- `lib/launch-readiness/mock-launch-readiness-summary.ts`
- `lib/launch-week/mock-launch-week-summary.ts`
- `lib/dev-sprints/mock-dev-sprint-summary.ts`
- `lib/ops-*/mock-*`

## deprecated

대체 구현이 있거나 신규 코드에서 더 이상 쓰지 않아야 하는 대상. 참조 0 확인 후 삭제한다.

- `@deprecated` 주석이 달린 파일 전반
- 관리자 예전 제재 패널류
- 실험용 화면/컴포넌트 중 현재 라우트 미사용 파일

## 최종 삭제 배치 후보

개발 종료 시점에 아래 순서로 처리한다.

1. `test-only` 제거
2. `dev-only` 제거
3. `mock-backed` 중 실제 API/DB로 대체 완료된 파일 제거
4. `deprecated` 제거

## 체크리스트

- `rg "mock-|test-|demo|@deprecated"` 로 최종 재검색
- `rg "isTestUsersSurfaceEnabled|allowTestUsersSurface|allowMockChatMessageFallback"` 로 게이트 해제 범위 확인
- import 0, route 0, dynamic import 0 확인
- staging 에서 기능 확인 후 삭제
