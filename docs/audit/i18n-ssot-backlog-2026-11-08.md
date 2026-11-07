# 언어 SSOT — 진행 중 발견 목록 (계획 완료 후 감사·승인)

> Owner 2026-11-08: 「초기 승인된 계약 부분을 우선 완료하고, 중간에 발생되는 문제·남은 위험은 계획된 부분을 완료한 후 감사 후 승인되는 순서로 진행」.
> 이 목록은 **기록만** 한다. 계획 단계(S0~S9) 안에서 계약을 지키려면 반드시 같이 바꿔야 하는 것만 해당 단계에서 처리하고 「처리 단계」에 적는다.

| # | 발견 시점 | 내용 | 근거 | 처리 |
|---|---|---|---|---|
| L1 | S1 착수 | `AppLanguageProvider` 가 자기가 보낸 `samarket-language-changed` 이벤트를 다시 받아 `{preference: resolved}` 로 적용 → 기기 언어가 「명시 선택」으로 저장됨 | `AppLanguageProvider.tsx` `onLanguageChanged` | **S1 에서 처리** — D1 계약(자동 감지값 저장 금지)을 지키려면 같은 코드 교체가 필요 |
| L2 | S1 착수 | `DEFAULT_APP_LANGUAGE = "ko"` 가 약 35개 서버 함수의 매개변수 기본값으로 쓰임(언어를 안 넘긴 호출은 한국어) | `grep DEFAULT_APP_LANGUAGE lib` | 보류 — 호출부가 언어를 넘기도록 하는 일은 S6(카탈로그 밖 문구 이관) 범위. 계획 완료 후 감사 |
| L3 | S1 착수 | 알림 언어가 설정 없을 때 `profiles.preferred_language` 사용(SSOT §2 와 다름) | `lib/notifications/notification-user-language.ts` | 보류 — 「기기 따름 사용자 푸시 언어 기준」 Owner 결정 필요(설계 §6-②) |
| L4 | S1 착수 | `/api/me/settings` PATCH 가 설정 행이 없을 때 언어 없이 저장하면 `preferred_language = null` 로 upsert (열은 NOT NULL) | `app/api/me/settings/route.ts` nextRow | **S1 에서 처리** — D5(새 행 언어 = 기기 따름 `""`)와 같은 줄 |
