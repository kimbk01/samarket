# 언어 SSOT — 진행 중 발견 목록 (계획 완료 후 감사·승인)

> Owner 2026-11-08: 「초기 승인된 계약 부분을 우선 완료하고, 중간에 발생되는 문제·남은 위험은 계획된 부분을 완료한 후 감사 후 승인되는 순서로 진행」.
> 이 목록은 **기록만** 한다. 계획 단계(S0~S9) 안에서 계약을 지키려면 반드시 같이 바꿔야 하는 것만 해당 단계에서 처리하고 「처리 단계」에 적는다.

| # | 발견 시점 | 내용 | 근거 | 처리 |
|---|---|---|---|---|
| L1 | S1 착수 | `AppLanguageProvider` 가 자기가 보낸 `samarket-language-changed` 이벤트를 다시 받아 `{preference: resolved}` 로 적용 → 기기 언어가 「명시 선택」으로 저장됨 | `AppLanguageProvider.tsx` `onLanguageChanged` | **S1 에서 처리** — D1 계약(자동 감지값 저장 금지)을 지키려면 같은 코드 교체가 필요 |
| L2 | S1 착수 | `DEFAULT_APP_LANGUAGE = "ko"` 가 약 35개 서버 함수의 매개변수 기본값으로 쓰임(언어를 안 넘긴 호출은 한국어) | `grep DEFAULT_APP_LANGUAGE lib` | 보류 — 호출부가 언어를 넘기도록 하는 일은 S6(카탈로그 밖 문구 이관) 범위. 계획 완료 후 감사 |
| L3 | S1 착수 | 알림 언어가 설정 없을 때 `profiles.preferred_language` 사용(SSOT §2 와 다름) | `lib/notifications/notification-user-language.ts` | 보류 — 「기기 따름 사용자 푸시 언어 기준」 Owner 결정 필요(설계 §6-②) |
| L4 | S1 착수 | `/api/me/settings` PATCH 가 설정 행이 없을 때 언어 없이 저장하면 `preferred_language = null` 로 upsert (열은 NOT NULL) | `app/api/me/settings/route.ts` nextRow | **S1 에서 처리** — D5(새 행 언어 = 기기 따름 `""`)와 같은 줄 |
| L5 | S3 | 통화 화면 문구 4키에서 개발자용 설정 안내(Agora 키·`npm run dev:https`)가 화면에서 빠짐 — 로그로 옮기려면 통화 코드(`lib/community-messenger/media-errors.ts` 등) 변경 필요 | S3 커밋 `0bc12110a` | 보류 — 통화 규정상 별도 계획·Owner 승인 |
| L6 | S4 | 상품권 영어가 「Gift」 한 단어(Gift mall·My gifts 등)로 쓰인 고객·사장님 키 **100건** — 용어집 정본 「Gift certificate」와 다름. 정본으로 바꾸면 영어가 길어져 길이 기준과 충돌 | S4 정본 영어 누락 측정(`gift-certificate` 100) | **Owner 결정 필요** — 짧은 자리에서 「Gift」 허용 여부 |
| L7 | S4 | 용어집 「정본 영어가 들어 있어야 함」 검사는 오탐이 많아 넣지 않음(매장 화폐 Cash, 「Usable at」처럼 문장을 바꿔 옮긴 것). 금지어 검사만 유지, 관심이웃만 Follow 필수로 보강 | S4 측정 158건 중 실제 결함 9건 | 기록 — 계획 완료 후 감사 |
| L8 | S4 | 하단 탭 ko 「배달」 ↔ en 「Food」 뜻이 다름, 한국어 문구 일부가 「마이페이지」(용어집 내정보) | 390px 화면 확인·카탈로그 | 기록 — 용어집 항목 추가 여부 Owner 결정 |
