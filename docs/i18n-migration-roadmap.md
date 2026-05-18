# DIBAY i18n 전체 완료 — 실행 순서 (마스터 플랜)

> **목적**: 배민·당근·카톡과 동일하게 **키 + ko/en 카탈로그**로 UI를 통일한다. 자동 번역·언어별 페이지 복제는 하지 않는다.  
> **규칙**: [i18n-development-rules.md](./i18n-development-rules.md) · **진행 상태**: [i18n-migration-track-state.md](./i18n-migration-track-state.md)

---

## 완료 정의 (프로젝트 전체)

1. 사용자 대면 UI 문자열이 `useI18n().t("key")` (또는 서버 `translate()` where applicable).
2. 모든 key가 ko·en 카탈로그에 존재 → `npm run check:i18n` 통과.
3. 단계별 스캔 경로에서 `npm run check:i18n-hardcoded -- <paths>` **0건** (또는 합의된 예외 목록만 남음).
4. English / 기기 언어 / 한국어 고정 각각 **스모크** 통과 (내정보 언어 설정 포함).

**성능**: 문구 개수와 무관하게 런타임 부담은 기존과 동일(객체 조회). 단계는 **PR·QA 단위**로 나눈다.

---

## 마스터 순서 (이 순서만 따름)

| 단계 | 이름 | 왜 이 순서인가 |
|------|------|----------------|
| **0** | 인프라 | 언어 정책·Provider·검사 스크립트 — 이미 적용 |
| **1** | 셸·공통 에러 | 모든 탭에서 보이는 실패·로딩·전역 chrome |
| **2** | 하단 탭·레이아웃 | 첫인상·탭 전환 — 카톡/당근/배민 공통 축 |
| **3** | 내정보·설정 | 언어 토글·계정·설정 — 사용자가 언어를 바꾸는 곳 |
| **4** | 거래·마켓 | 당근 축 핫패스 (`/market`, 상세, 글쓰기) |
| **5** | 채팅 허브 (거래·주문) | `components/chats`, 주문 채팅 진입 |
| **6** | 매장·주문 (구매자) | 배민 축 — 스토어·장바구니·주문 |
| **7** | 사장님·비즈 | owner·`my/business` |
| **8** | 커뮤니티 메신저 | 카톡 축 — 방·홈·통화 UI (분량 최대) |
| **9** | Philife·커뮤니티 피드 | 동네 글·모임 (메신저와 도메인 분리) |
| **10** | 가입·온보딩·로그인 | 신규 유저 첫 경로 |
| **11** | 관리자 | `app/admin`, `components/admin` (일부 완료) |
| **12** | lib 공유 문구 | 토스트·검증 메시지·라벨 헬퍼 |
| **13** | CI·마감 | (선택) 단계별 hardcoded 게이트·레거시 `tt` 축소 |

**한 라운드 = 한 단계(또는 단계 내 하위 폴더 1개).** 여러 도메인을 한 PR에 섞지 않는다.

---

## 단계별 스캔 경로 · 카탈로그 · 완료 게이트

### 0 — 인프라 ✅

- `components/i18n/AppLanguageProvider.tsx`, `lib/i18n/*`, `app/layout.tsx`
- `app/api/me/settings`, 프로필 언어, OAuth 쿠키
- `npm run check:i18n` 통과 유지

### 1 — 셸·공통 에러

**경로**

- `app/(main)/error.tsx` (진행 중)
- `app/(main)/**/error.tsx`
- `app/(main)/**/loading.tsx` (문구 있는 것만)
- `app/(auth)/**`, `components/layout/providers/**`

**카탈로그**: `lib/i18n/catalog/common.ts` (`app_error_*`, `common_loading` 등)

**게이트**

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs app/(main)/error.tsx app/(main)/community-messenger/error.tsx app/(main)/post app/(main)/products
```

### 2 — 하단 탭·레이아웃

**경로**

- `components/layout/BottomNav.tsx`, `RegionBar.tsx`, `FloatingAddButton.tsx`, `CommerceCartHeaderLink.tsx`
- `components/navigation/**`
- `lib/main-menu/bottom-nav-config.ts`

**카탈로그**: `navigation.ts`, `common.ts`

**게이트**: English에서 5탭·헤더 액션 라벨 스모크 + 위 경로 hardcoded 0 목표

### 3 — 내정보·설정

**경로**

- `components/my/**`, `components/mypage/**`
- `app/(main)/mypage/**`, `app/(main)/my/**`

**카탈로그**: `my.ts` (+ 필요 시 `lib/i18n/catalog/mypage-hub.ts` 분리)

**게이트**

```bash
node scripts/check-hardcoded-korean.mjs app/(main)/mypage app/(main)/my components/mypage components/my
```

### 4 — 거래·마켓

**경로**

- `app/(main)/market/**`, `post/**`, `write/**`, `products/**`
- `components/home/**`, `components/trade/**`, `components/write/trade/**`
- `components/search/**` (거래 검색)

**카탈로그**: `common.ts`, `navigation.ts`, (신규) `trade.ts` 또는 json 확장

### 5 — 채팅 허브 (거래·스토어 주문)

**경로**

- `components/chats/**`
- `app/(main)/chats/**`
- 주문 채팅 진입 컴포넌트 (`MemberOrder*`, `StoreOrderMessenger*`)

**카탈로그**: `common.ts`, `notifications.ts`, store-order 전용 키

### 6 — 매장·주문 (구매자)

**경로**

- `app/(main)/stores/**` (owner 제외)
- `components/stores/**` (owner 제외)
- `app/(main)/orders/**`, `components/member-orders/**`

### 7 — 사장님·비즈

**경로**

- `app/(main)/stores/owner/**`, `components/stores/owner/**`
- `app/(main)/my/business/**`, `components/business/**`

### 8 — 커뮤니티 메신저

**경로**

- `app/(main)/community-messenger/**`
- `components/community-messenger/**`
- `lib/community-messenger/**` (사용자 노출 문자열만)

**주의**: Realtime·성능 계약 파일은 문구만 건드리고 로직은 `messenger-realtime-policy.md` 준수.

### 9 — Philife·커뮤니티

**경로**

- `app/(main)/philife/**`, `community/**`
- `components/philife/**`, `components/community/**`, `components/meetings/**`

### 10 — 가입·온보딩

**경로**

- `app/(auth)/**`, `app/(main)/onboarding/**`, `components/auth/**`, `components/signup/**`

### 11 — 관리자

**경로**

- `app/admin/**`, `components/admin/**`

**참고**: Admin은 이미 `useI18n` 다수 — **남은 하드코딩만** 정리.

### 12 — lib 공유

**경로**

- `lib/**` 중 UI로 노출되는 `throw new Error("한글")`, 토스트, 라벨 맵
- `services/**` 사용자 메시지 (해당 시)

**제외**: 순수 서버 로그·주석·테스트 fixture

### 13 — CI·마감 (선택)

- PR template에 `check:i18n` 필수
- `check:i18n-hardcoded`를 전체 repo에 점진 적용 (초기엔 실패 허용 → 단계마다 0으로 수렴)

---

## 매 단계 작업 절차 (반복)

1. 해당 경로만 `check-hardcoded` 로 후보 목록 확인.
2. 기존 key 재사용 (`common_*`, `mypage_*`, `nav_*`) 우선.
3. `t("domain_…")` + catalog ko/en 동시 추가.
4. `npm run check:i18n`
5. 단계 게이트 hardcoded 재실행.
6. English + system + ko 스모크 (해당 화면만).
7. [i18n-migration-track-state.md](./i18n-migration-track-state.md) 에 단계 `[x]` 및 날짜 기록.

---

## Cursor / 에이전트에 요청할 때

- **「i18n 단계 3 — 내정보」** → 위 표 3번 경로만
- **「i18n Phase 4 거래 마켓만」** → 4번만
- **전체 한 번에** → 거부하고 단계 번호 지정 권장

규칙 파일: `.cursor/rules/dibay-i18n-migration.mdc`

---

## 현재 백로그 규모 (참고)

- 전체 `check:i18n-hardcoded`: **수천 건** (레거시 합계)
- 단계별로 **0에 수렴**시키는 것이 목표이며, 한 번에 0일 필요는 없음
