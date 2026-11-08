# DIBAY i18n 개발 규칙

> **단일 정의는 [i18n-ssot.md](./i18n-ssot.md)** (Owner 2026-11-08). 이 문서와 충돌하면 SSOT 문서가 우선한다. 기능 추가 후 `npm run check:i18n-quality` 를 함께 돌린다.

**전체 완료 순서**: [i18n-migration-roadmap.md](./i18n-migration-roadmap.md) · **진행 체크**: [i18n-migration-track-state.md](./i18n-migration-track-state.md)

## 지원 언어

- 앱 UI: **한국어(`ko`) · English(`en`)** 만 지원한다.
- `tl`, `ja`, `zh-CN` 등 **신규 UI 언어를 추가하지 않는다.**

## UI 문구 작성

1. 신규·수정 UI 문구는 **`t("message_key")`** 를 사용한다 (`useI18n()`).
2. 같은 키를 **`lib/i18n/catalog/*` 한 파일에만** ko·en 둘 다 추가한다. `messages/*.json` 에는 신규 키를 넣지 않는다(S5 에서 카탈로그로 통합).
3. **`tt("한국어 문장")`·`fallbackEn` 문장·인라인 `{ ko, en }`·언어 삼항은 신규 사용 금지** (기존은 SSOT S6 에서 키로 이관).
4. **코드에 한국어 문자열을 직접 넣지 않는다.** JSX·props(`>저장<`, `placeholder="검색"`)뿐 아니라 함수가 돌려주는 문구·서버가 채우는 안내도 키로 만든다 (`user-hangul-literal` 검사).

## 언어 설정(사용자) — source of truth

- **앱 UI 언어**: `user_settings.preferred_language` + `AppLanguageProvider` (`useI18n().t` / `tt`)
- **`profiles.preferred_language`는 앱 UI에 사용하지 않는다** (DB NOT NULL 호환용 레거시 컬럼만)
- 내정보 언어 UI: **한국어 · English** 두 가지만 (기기 언어는 **선택 옵션이 아님**)
- 저장 모델: `ko` | `en` | `null` (`null` = 기기/브라우저 따름). 레거시 DB 문자열 `system`은 읽을 때 `null`과 동일
- 기기 언어 = 기기의 **첫 번째 언어**가 한국어면 `ko`, 그 외 `en` (Owner 2026-11-08 「첫 언어 기준」)
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
- 언어별 대체 문장(`fallbackKo`/`fallbackEn`)은 **신규 금지** — 키를 카탈로그에 ko·en 으로 추가한다 (`docs/i18n-ssot.md` §3).
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
