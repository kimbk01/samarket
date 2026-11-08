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
| L9 | S5 | 중복 키 239개는 화면 값(뒤 카탈로그가 덮어쓴 값)을 남겼다. 그중 어드민 메뉴 4키는 기존 테스트가 화면에 나오지 않던 값을 기대하고 있었음 — `admin_menu_community_reports` 기대 「일반 신고」↔화면 「신고 처리함」, `admin_menu_community_point_policies` 「커뮤니티 포인트 정책」↔「포인트 정책」, `admin_menu_community_section_promo_point` 「홍보 / 포인트」↔「포인트·충전」, `admin_menu_menu_trade` 「주제 (거래)」↔「카테고리」. 테스트는 화면 값으로 바꿈 | `docs/audit/i18n-s5-duplicate-values-2026-11-08.md` | **Owner 결정 필요** — 이전 설계(ARO-IA-001 T13·거래 Admin v2 T0) 문구로 되돌릴지 |
| L10 | S5 | S0 검사·S5 1차 미사용 판정이 `contexts/` 등 최상위 폴더와 따옴표 없는 속성 접근(`adminMessages.ko.x`)을 놓침 — 타입 검사로 발견, 저장소 전체·단어 기준으로 다시 판정(삭제 2,109 → 1,571). 검사 수집 폴더도 보강 | S5 작업 중 typecheck 실패 | **S5 에서 처리** |
| L11 | S6 | 카탈로그 밖 문구 자동 정리가 통화 코드 23파일(`components/**/call*`·`call-v3`·`call-v4`·수신 배너·`lib/community-messenger/call*`·`lib/call/**`)도 건드림 — 화면 동작은 같지만 **통화 규정(통화에 닿는 모든 코드 = 계획·Owner 승인·단독 커밋)** 에 따라 전부 되돌림. 이 파일들의 대체 문구·언어 삼항은 남아 있음 | S6 eslint 검토 중 발견 | 보류 — 통화 단독 계획·승인 후(S8 과 함께) |
| L12 | S6 | 어드민 UI 래칫 `mutatingQuietCta` 가 버튼 글자를 소스 한국어로만 판정 — `t("키")` 버튼은 원래부터 못 봄. 카탈로그 문구까지 보면 숨어 있던 위반 10건(7파일) 드러남 | S6 래칫 조정 중 측정 | 기록 — 어드민 UI 표준 범위, 계획 완료 후 감사 |
| L13 | S6 | 한국어 전용 수량 접미사 「건」(영어 없음) 4곳 — 카탈로그 값은 빈 값 불가라 그대로 둠. `{n}건`/`{n}` 같은 수량 키로 옮겨야 함 | S6 check:i18n | S6 2단계 |
