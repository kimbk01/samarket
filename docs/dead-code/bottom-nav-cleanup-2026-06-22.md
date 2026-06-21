# Bottom Nav Dead Code Cleanup — 2026-06-22

## 삭제 파일

- `components/delivery/navigation/DeliveryBottomNav.tsx`
- `components/delivery/navigation/DeliveryBottomNavItem.tsx`
- `components/delivery/navigation/useDeliveryBottomNavVisibility.ts`
- `lib/delivery/should-hide-stores-delivery-bottom-nav.ts`

## 삭제 근거

- 메인 앱 하단 네비는 `components/layout/BottomNav.tsx` 단일 통합 경로를 사용한다.
- 삭제 대상은 과거 배달 전용 하단 네비 런타임 컴포넌트와 전용 visibility hook이다.
- `rg` 확인 결과 실제 route/runtime/admin 화면에서 `DeliveryBottomNav` 컴포넌트 import가 없었다.
- `shouldHideStoresDeliveryBottomNav`는 export만 있고 import가 없었다.

## 유지한 경로

- `lib/delivery/load-delivery-bottom-nav-items-server.ts`
  - admin delivery bottom nav 설정에서 item type과 server loader를 계속 사용한다.
- `components/stores/owner/OwnerMobileBottomNav.tsx`
  - 매장 오너 운영 센터 전용 nav이며 메인 5탭과 별도이다.
- `components/business/admin/BusinessAdminShell.tsx`
  - 오너 admin shell 및 owner mobile nav 마운트 경로를 유지한다.

## 대체 경로

- 사용자 대면 메인 하단 네비: `components/layout/BottomNav.tsx`
- 표시/숨김 정책: `lib/navigation/bottom-nav-route-policy.ts`
- 배달 탭 구성: `lib/main-menu/delivery-bottom-nav-layout.ts`

## 회귀 방지

- `lib/navigation/__tests__/bottom-nav-route-policy.test.ts`
  - 메인 5탭 표시 route와 채팅방/통화/작성 surface 숨김을 고정한다.
- 검증용 검색:
  - `rg "BottomNavLazy|ssr: false|hideBottomNavShell|DeliveryBottomNav|should-hide-stores-delivery-bottom-nav"`
