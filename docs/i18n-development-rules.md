# DIBAY i18n 개발 규칙

**전체 완료 순서**: [i18n-migration-roadmap.md](./i18n-migration-roadmap.md) · **진행 체크**: [i18n-migration-track-state.md](./i18n-migration-track-state.md)

## 지원 언어

- 앱 UI: **한국어(`ko`) · English(`en`)** 만 지원한다.
- `tl`, `ja`, `zh-CN` 등 **신규 UI 언어를 추가하지 않는다.**

## UI 문구 작성

1. 신규·수정 UI 문구는 **`t("message_key")`** 를 사용한다 (`useI18n()`).
2. 같은 키를 **`lib/i18n/catalog/*` 또는 `messages/ko.json` / `messages/en.json`** 에 **ko·en 둘 다** 추가한다.
3. **`tt("한국어 문장")`은 신규 기능에서 사용하지 않는다.** (기존 한국어 역검색 호환용만 유지)
4. **JSX·props에 한글 문자열을 직접 넣지 않는다.** (예: `>저장<`, `placeholder="검색"`)

## 언어 설정(사용자) — source of truth

- **앱 UI 언어**: `user_settings.preferred_language` + `AppLanguageProvider` (`useI18n().t` / `tt`)
- **`profiles.preferred_language`는 앱 UI에 사용하지 않는다** (DB NOT NULL 호환용 레거시 컬럼만)
- 내정보 언어 UI: **한국어 · English** 두 가지만 (기기 언어는 **선택 옵션이 아님**)
- 저장 모델: `ko` | `en` | `null` (`null` = 기기/브라우저 따름). 레거시 DB 문자열 `system`은 읽을 때 `null`과 동일
- **DB 임시 호환**: `user_settings.preferred_language` NOT NULL 컬럼은 기기 따름을 빈 문자열 `""`로 저장. **마이그레이션 목표는 SQL `NULL`**
- 도메인(community / trade / delivery / messenger / myinfo / admin)은 **`useI18n`만** 사용. cookie·local·`getBrowserLanguage` 직접 호출 금지
- React 밖 유틸(`cmUi` 등)은 `lib/i18n/runtime-app-language.ts` (Provider가 동기화)

## 기능 추가 후 검사

```bash
npm run check:i18n
npm run check:i18n-hardcoded
# 단계별만: node scripts/check-hardcoded-korean.mjs app/(main)/mypage components/mypage
```

- `check:i18n`: ko/en 카탈로그 키 누락 시 exit 1
- `check:i18n-hardcoded`: `app` / `components` / `lib` 에서 흔한 하드코딩 패턴 탐지 (카탈로그·messages 제외)

개발 중 `translate()` 는 **en/ko 키 누락 시 `console.warn`** (`[i18n-missing-en]`, `[i18n-missing-ko]`, production 제외).

## UI key 노출 방지 (전역)

- **`useI18n().t`** 는 `lib/i18n/safe-translate.ts` 의 **`safeTranslate`** 를 사용한다 — 빈 값·`key` 와 동일·snake_case 토큰·미치환 `{var}` 는 화면에 노출하지 않는다.
- 언어별 fallback: `safeT(key, { fallbackKo: "…", fallbackEn: "…" })`
- 서버·역검색·로그: `translate()` (raw) 유지
- 검사: `npm run check:i18n` — ko/en 대칭, 빈 값, 값=key, 도메인별 리포트

## 공통 키 예시

| Key | 용도 |
|-----|------|
| `common_save` | 저장 |
| `common_cancel` | 취소 |
| `mypage_use_device_language` | 기기 언어 사용 |
| `navigation_myinfo` | 내정보 / My Info |

하단 탭 등은 기존 `nav_bottom_*` 와 `navigation_*` 병행 키를 사용할 수 있다.
