# A. 운영 캡처 4결함 근본 원인 감사 (읽기 전용)

기준: origin/main = 49318dd1a (#124 merge). 로컬 HEAD 13388f73c 와 CSS 차이 0 (`git diff --stat 13388f73c 49318dd1a -- '*.css'` 출력 없음).
레포 루트 커밋 = e23b9c0b5 (2026-10-16, 이전 이력 없음 → "언제 깨졌나"는 루트 이후만 추적 가능).
CSS 캐스케이드는 `@tailwindcss/postcss` 로 실제 컴파일해 확인 (스크래치 `cssbuild/`, 레포 미변경):
- 49318dd1a: 레이어 순서 `properties > theme > base > components > utilities`
- 48f443ddd(#123 merge)·46335b6ae~1(#123 이전): `properties > components > theme > base > utilities` (뒤집힘)

---

## 1. `/home` 헤더 가운데 "내용을 불러올 수 없습니다."

경로 추적:
- `/home` 페이지는 `CommunityHomeSurface` 를 그대로 렌더 — `app/(main)/home/page.tsx:7-9`.
- 그러나 크롬(헤더) 판정 SSOT 는 `/home` 을 모른다:
  - `resolveMainTabKeepAliveHub` 는 `/`·`/philife`·`/community` 만 community 허브 — `lib/layout/resolve-main-surface.ts:83`. `/home` → null.
  - 그래서 `RegionBar` 의 MAIN HUB 분기(`components/layout/RegionBar.tsx:84-93`)를 타지 않고 서브페이지 분기로 감.
  - `resolveMainTier1Subpage("/home")` 는 어떤 분기에도 안 걸려 최종 폴백 `{ backHref: "/philife", titleText: "", showHubQuickActions: true }` — `lib/layout/resolve-main-tier1.ts:596-597`.
- `RegionBar` 에서 `titleText ""` → `resolveTier1BarLabel` 이 undefined (`lib/layout/resolve-tier1-bar-label.ts:10-11`) → `stringTitle` 없음 → `safeT("common_content_unavailable", …)` (`components/layout/RegionBar.tsx:145-162`).
- 카탈로그 값이 정상 존재: `common_content_unavailable: "내용을 불러올 수 없습니다."` (`lib/i18n/catalog/common.ts:21`). 즉 **누락 키가 아니다** — "제목 미등록 라우트"를 사용자에게 보이는 문구로 노출하는 계약(`RegionBar.tsx:150-153` 주석)이 그대로 작동한 것.
- 뒤로 화살표 = `DEFAULT.showBack`/`backHref:"/philife"`, 종 = `showHubQuickActions:true` → `MyHubHeaderActions` (`RegionBar.tsx:165`).
- 테스트도 이를 숨김: `/home` 을 `EXTRAS_REQUIRED`(페이지가 extras 로 제목 공급) 로 분류 — `lib/layout/__tests__/dibay-chrome-title-coverage.test.ts:22,142`. 하지만 `CommunityHomeSurface` 는 tier1 extras 를 설정하지 않음 (`grep MainTier1Extras components/community/CommunityHomeSurface.tsx` 0건). 그래서 0-missing 게이트를 통과하면서 운영에선 빈 제목.

언제/누가:
- `app/(main)/home/page.tsx` 는 루트 커밋 e23b9c0b5 (2026-10-16) 부터 존재, 이후 변경 없음. `resolve-main-surface.ts`·`resolve-main-tier1.ts`·`RegionBar.tsx`·`common.ts` 는 e23b9c0b5..49318dd1a 사이 변경 0 (`git diff --stat` 결과 `MainAppProviderTree.tsx` 만, 내용은 Android In-App Update 호스트 추가 — 2e159893f).
- **mypage 작업(#120~#124) 원인 아님.** 루트 시점부터 잠재 결함.
- 앱 내부에서 `/home` 으로 가는 링크는 없음(`scripts/measure-font-performance.mjs:6` 외 0건) → Owner 가 URL 직접 입력/외부 링크로 진입한 경우에만 노출. 진입 경로는 확인 필요.

---

## 2. `/mypage/offers?tab=sent` 빈 상태 — 초록 버튼 글자 안 보임

요소:
- `components/offers/MyOffersView.tsx:162` — `<Link href="/market" className="sam-btn sam-btn--primary sam-btn--sm inline-flex items-center justify-center">` (`Sam.btn.primaryCombo`=`sam-btn sam-btn--primary` `lib/ui/sam-component-classes.ts:43`, `sm`=`sam-btn--sm` :52). `<a>` 로 렌더. 텍스트색 유틸 없음.
- 부모: `MyStateView` → `SellerHubEmptyState` (`components/mypage/ds/MyStateView.tsx:217`, `components/mypage/seller/SellerHubEmptyState.tsx:16-19`) — 색 지정 없음 → 상속 시 body `color: var(--sam-text-primary)` (`app/globals.css:153`).
- 이 CTA 도입 커밋: c6fde89ee (#121, mypage R4·R5).

이 요소의 color 후보 규칙 (컴파일 결과 기준):
| 레이어 | 규칙 | 값 |
|---|---|---|
| base (preflight) | `a { color: inherit }` | 부모색(본문 짙은 색) |
| components | `.sam-btn--primary { color: var(--sam-text-on-primary) }` (`app/samarket-components.css:233-236`) | 크림 `--dibay-cream` (`app/design-tokens.css:130`) |
| unlayered | `.ui-doc-root a`(`app/globals.css:300`), `.delivery-ui[data-stores-home-header] …` | 이 요소엔 해당 없음 |
`store-order-list-tokens.css`·messenger CSS 는 `@layer`·`a`/`sam-btn` 색 규칙 없음 (grep 0건).

판정:
- **49318dd1a(#124) 빌드**: 레이어 `base < components` → `.sam-btn--primary` 가 이김 → 글자 크림 보장. 다른 우선 규칙 없음.
- **#123(48f443ddd) 빌드**: 레이어는 뒤집혀 있었지만 레이어 밖 백업 `:is(a, button).sam-btn.sam-btn--primary { color; background }` 가 있어(#124 가 제거, `git show 13388f73c -- app/samarket-components.css`) 이 Link 도 커버 → 크림.
- **#123 이전 빌드**: `components < base` → `a{color:inherit}` 승 → 짙은 글자 on 초록 = 캡처와 일치.
- 결론: **소스 기준 49318dd1a 에서는 이 결함이 재현되지 않는다. 캡처는 #123 이전 빌드(또는 캐시된 이전 CSS)일 가능성이 높다.** 운영이 실제로 어떤 SHA 를 서빙했는지는 확인 필요 (Production 배포 NOT_PROVEN). Next 프로덕션 CSS 최소화 단계가 맨 앞 `@layer` 선언을 유지하는지도 확인 필요 (postcss 컴파일 결과에서는 2·3번째 줄에 유지됨).
- 근본 원인(소유): 레이어 역전은 globals.css 의 import 순서(`app/globals.css:10-36`, Tailwind 이전에 `@layer components` 선언 파일 import) — 루트부터 존재. mypage 작업은 이 패턴의 인스턴스(Link CTA)를 추가했을 뿐.

같은 패턴(초록 배경 + 글자색이 sam-btn 클래스에만 의존 + `<a>/<Link>`) 범위 — 다줄 정규식 근사 32줄/약 20파일(일부 오탐 가능):
`app/(main)/mypage/points/page.tsx:309`, `components/addresses/DeliveryRoutableAddressGate.tsx:114`, `components/business/owner/OwnerProductsHubClient.tsx:343`, `components/favorites/FavoriteProductsView.tsx:243`, `components/favorites/FavoriteStoresView.tsx:173`, `components/gift-certificate/MessengerGiftOfferFlow.tsx:216`, `components/gift-certificate/OwnedGiftInstanceDetailView.tsx:145`, `components/mypage/MyStoreInquiriesView.tsx:153`, `components/mypage/MyStoreOrderDetailView.tsx:554`, `components/mypage/MyStoreOrdersView.tsx:1120`, `components/mypage/community/MypageCommunityPostsList.tsx:198`, `components/mypage/profile/MypageSelfProfileView.tsx:44`, `components/mypage/reviews/MyWrittenReviewsView.tsx:290`, `components/mypage/sales/SalesHistoryCard.tsx:188`, `components/recent-viewed/RecentViewedList.tsx:187,210`, `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx:507`(오탐 여부 확인 필요) + `SellerHubEmptyActionLink`(`components/mypage/seller/SellerHubEmptyState.tsx:45-62`) 사용처 12곳. `<button>` 도 preflight `button{background-color:transparent;color:inherit}` 영향이므로 #123 이전에는 sam-btn 전부가 영향권. 모두 #124 레이어 순서로 일괄 해소 (개별 수정 불필요).

---

## 3. `/stores/owner/apply` — 회색빛 제출 버튼 · 고객센터 FAB 겹침 (store 도메인, mypage 아님)

폼·버튼:
- 페이지 `app/(main)/stores/owner/apply/page.tsx` → `BusinessApplyForm` (`components/business/BusinessApplyForm.tsx`).
- 제출 버튼 `:581-590` `type="submit" disabled={submitDisabled}` 클래스 `OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS` = `… bg-signature text-white … disabled:opacity-50` (`lib/business/owner-admin-footer-actions.ts:37,43`).
- 비활성 조건 `:365-369` — `disabled || !computedStoreSlug.trim() || !addressDefault?.id || !values.applicantNickname.trim()`. 필수값(슬러그·기본 주소·신청자 닉네임) 미충족이면 비활성 → 초록에 opacity 50% = 회녹색. **의도된 비활성 상태**이며 디자인 토큰 비활성색(`--sam-primary-disabled`, `app/design-tokens.css` 다크 블록 등)이 아니라 opacity 처리. 비활성 사유를 화면에 안내하는지 여부는 확인 필요 (특히 기본 주소 없음).
- 캡처 시점에 어떤 조건이 미충족이었는지는 확인 필요.

고객센터 FAB:
- 셸 전역 `SupportFabHostLazy` (`components/layout/ConditionalAppShell.tsx:99-100,490`) → `components/support/SupportFabHost.tsx`.
- 표시는 opt-in: 페이지가 컨텍스트를 publish 해야 보임 (`lib/support/support-context.ts:114-118`). 입점 신청 페이지가 **명시적으로 켬**: `<OwnerSupportContextBridge enabled category="STORE_APPROVAL" sourceSurface="owner_store_apply">` (`app/(main)/stores/owner/apply/page.tsx:275-279`). 즉 "숨김 규칙에서 빠진 것"이 아니라 켜도록 설계됨.
- 위치: apply 경로는 `StoresOwnerApplyShell` 사용(`app/(main)/stores/owner/StoresOwnerLayoutClient.tsx:30,47-49`)이라 owner compact shell 플래그 없음 → `bottom-[calc(var(--safe-bottom)+16px)]` (`SupportFabHost.tsx:64-68`, 하단탭 없음 `lib/main-menu/delivery-bottom-nav-layout.ts:74`), z `z-[1255]` (`lib/main-menu/bottom-nav-config.ts:250`).
- 하단 고정 바: `fixed … z-[54] … bottom-0` (`lib/business/owner-admin-footer-actions.ts:12,49-54`, `BusinessApplyForm.tsx:556-563`).
- **근본 원인**: FAB 하단 오프셋이 "고정 폼 하단 바(data-form-keyboard-footer)" 높이를 모른다 — 하단탭/owner 셸 두 경우만 계산(`SupportFabHost.tsx:62-68`). 그래서 safe+16px 위치에 z 1255 로 제출 버튼 위를 덮음. 같은 고정 푸터를 쓰는 다른 화면(`OwnerStoreBasicInfoForm.tsx:1146` 등)은 owner 셸 안이라 `--owner-fab-bottom` 경로 — 겹침 여부 확인 필요.
- 이력: 관련 파일 모두 루트 e23b9c0b5 이후 변경 없음 → **mypage 작업 원인 아님.**

---

## 4. `/mypage?edit=profile` 프로필 수정 시트 — 기본 아바타 표시

데이터 원천 (동일):
- 시트: 열 때 `fetchMeProfileFresh` (`/api/me/profile?mode=full&fresh=1`, `lib/profile/fetch-me-profile-deduped.ts:188-213`) → `setAvatarUrl(p.avatar_url)` (`components/mypage/profile-settings/EditPublicProfileSheet.tsx:84-98`). 같은 값으로 홈 projection 도 갱신(`:33-41`).
- 홈 카드: `projection.avatarUrl` = `profile.avatar_url` (`lib/mypage/mypage-home-store.ts:87,106`).
→ 두 화면 모두 **같은 `profiles.avatar_url` 문자열**. 필드 차이 아님.

렌더 경로 (다름):
- 홈: `SamarketThumbnail` = 네이티브 `<img src={resolveCanonicalImageUrl(thumb)}>` 직접 로드 (`components/mypage/home/MypageProfileSummary.tsx:99-107`, `components/common/SamarketThumbnail.tsx:68-79,139`).
- 시트: `ProfileAvatarEditor` → `ProfileImageField variant="hero"` → `SamarketUserAvatar` (`components/my/edit/ui/ProfileAvatarEditor.tsx:12`, `components/my/edit/ProfileImageField.tsx:155`) = **`next/image <Image>`** (`/_next/image` 최적화 경유) (`components/profile/SamarketUserAvatar.tsx:45-52`). `onError` → `imageFailed` → `SamarketDefaultAvatarFace`(기본 얼굴) (`:28-35,54`).
- 따라서 홈은 성공·시트는 기본 얼굴 ⇒ 같은 URL 이 **직접 로드는 되고 `/_next/image` 경유는 실패**한 것으로 추정. 후보: (a) avatar 호스트/경로가 `images.remotePatterns` 밖 (`next.config.ts:85-107` — supabase 는 `/storage/v1/object/public/**`·`render/image/public/**` 만 허용; 서명 URL·커스텀 도메인·기타 SNS 호스트면 400), (b) Vercel 이미지 최적화 오류/한도. 실제 `avatar_url` 호스트는 운영 DB 조회 필요 → **확인 필요** (이번 감사는 DB 미조회).
- 그 밖: 시트 로딩 중 스켈레톤, 로드 실패 시 오류 뷰 (`EditPublicProfileSheet.tsx:242-249`).
- 이력: `SamarketUserAvatar`·`next.config` 이미지 설정은 루트 이후 변경 여부 미추적, 시트에 `ProfileAvatarEditor` 를 쓰는 구성은 mypage 작업(#104 7bfe53d09, #121 c6fde89ee)에서 확정. 기존 `/my` 편집과 같은 컴포넌트 공유이므로 **mypage 작업이 직접 원인은 아니나 노출 경로는 mypage** — 확인 필요.

시트 명세 (현 소스):
- 필드: 사진(탭 → 액션시트: 앨범/카메라/기본으로; 선택 즉시 업로드+저장 `ProfileImageField.tsx:82-137,196-205`), 버튼 라벨 "사진에서 선택" = `profile_edit_photo_pick` (`lib/i18n/catalog/settings-ui.ts:332`, `ProfileImageField.tsx:186-193`), 닉네임(`maxLength` 20, 실시간 검증 `EditPublicProfileSheet.tsx:262-279`), "나의 상태" = `profile_edit_status_label`(`settings-ui.ts:217`) bio `AutoGrowTextarea` n/60 (`:282-301`), 동네 읽기 전용 + 주소 관리 링크 (`:303-327`).
- 저장: `canSave = dirty && 닉네임 오류 없음 && bio 길이 OK` (`lib/profile/profile-edit-form-helpers.ts:128-141`). 미변경이면 비활성 + `disabled:opacity-45` → 회색빛 (`EditPublicProfileSheet.tsx:212-218`) — **의도된 동작**. 저장 후 서버 재조회로 검증(`:167-190`), 충돌 시 최신값 재적용(`:153-161`).
- 닫기: X·바깥·드래그·뒤로 → dirty 면 미저장 확인 시트 (`:121-128,342-353`), 동네 링크도 동일 (`:315-320`).
- 닉네임 입력 테두리 없음: 클래스 `sam-input` (`:43`, `app/samarket-components.css:367-368` border border-sam-border). #123 이전 레이어 역전 시 preflight `*{border:0 solid}`·input `background:transparent`(base)가 이김 → 테두리 없음. #124 소스 기준 해소. #123 백업은 버튼만 커버했으므로 #123 빌드에서도 입력 테두리는 없었음.
- 키보드: `MypageBottomSheetShell` → `DibayUsableAreaSheet` (`components/mypage/profile-settings/MypageBottomSheetShell.tsx:8,75`) 가용 영역 계약에 위임 — 세부 동작 확인 필요.

---

## 요약

| 결함 | 근본 원인(file:line) | 소유 도메인 | mypage 작업 원인? | 근본 수정 방향 | 영향 범위 |
|---|---|---|---|---|---|
| 1 /home 제목 "내용을 불러올 수 없습니다." | `/home` 이 크롬 SSOT 미등록: `lib/layout/resolve-main-surface.ts:83`(허브 판정)·`lib/layout/resolve-main-tier1.ts:597`(빈 titleText 폴백) → `components/layout/RegionBar.tsx:145-162`. 키 누락 아님(`lib/i18n/catalog/common.ts:21`) | 공통 셸/레이아웃(커뮤니티 홈 별칭) | 아니오 (루트 e23b9c0b5 부터) | `/home` 을 `/`·`/philife` 와 같은 community 허브로 SSOT(`resolveMainSurface`·`resolveMainTabKeepAliveHub`·`resolveMainTier1Subpage` null)에 등록, 커버리지 테스트의 `EXTRAS_REQUIRED` 분류 교정 | `/home` 직접 진입 시만 |
| 2 오퍼 빈 상태 버튼 글자 안 보임 | CSS 레이어 역전(`app/globals.css:10-36` import 순서) → preflight `a{color:inherit}` 가 `.sam-btn--primary`(`app/samarket-components.css:233-236`) 이김. 소스 49318dd1a 에선 `app/globals.css:7` 로 해소 | 공통 UI 토큰/CSS | 인스턴스 추가만(c6fde89ee). 근본은 아님 | 이미 #124 로 소스 해소 → 운영 서빙 SHA·CSS 캐시 확인만 필요 (추가 코드 수정 불필요 추정) | `<a>`/`<button>` sam-btn 전체 (~20파일 Link + 모든 button) |
| 3 입점 신청 회색 버튼·FAB 겹침 | 회색=필수값 미충족 비활성 `components/business/BusinessApplyForm.tsx:365-369` + `disabled:opacity-50`(`lib/business/owner-admin-footer-actions.ts:37`); 겹침=FAB 오프셋이 고정 폼 푸터 미인지 `components/support/SupportFabHost.tsx:62-72` (z 1255 > 푸터 z 54) | store(매장 입점) | 아니오 | FAB 호스트가 `data-form-keyboard-footer` 고정 바 높이를 clearance 로 반영(또는 그런 화면에서 FAB 를 바 위로 올림) — 페이지별 땜질 금지. 비활성 사유 안내 여부 별도 확인 | 고정 하단 바 + FAB opt-in 화면 (owner 셸 밖) |
| 4 프로필 시트 기본 아바타 | 같은 `avatar_url` 인데 시트만 `next/image`(`components/profile/SamarketUserAvatar.tsx:45-54`) 경유 → 실패 시 기본 얼굴; 홈은 `<img>` 직접(`components/common/SamarketThumbnail.tsx:139`). 실패 사유(remotePatterns `next.config.ts:85-107` 밖 호스트 vs 최적화 오류)는 확인 필요 | 공통 프로필 아바타 컴포넌트 (노출은 mypage) | 직접 원인 아님(공유 컴포넌트), 확인 필요 | 아바타 렌더를 홈과 같은 단일 경로(SamarketThumbnail/동일 URL 해석)로 통일하거나 허용 호스트 정합 — 운영 `avatar_url` 호스트 조회 후 확정 | SamarketUserAvatar 사용처(`ChatMessageList`, `MyAccountContent`, 메신저 통화/헤더 등 ≥10) |

부가: 시트의 저장 버튼 회색(미변경 비활성)·"사진에서 선택" 라벨은 설계대로. 닉네임 입력 테두리 없음은 결함 2 와 같은 레이어 역전 원인(#124 소스 해소).
