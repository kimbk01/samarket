# 필수 약관 동의 — 기존·신규 회원 처리와 약관 개정 정책

Owner 지시 2026-11-05 「DIBAY 필수 약관 동의 정책 확정 및 기존·신규 회원 처리」. 기존 Legal CMS·동의 이력·가입 화면·동의 게이트 SSOT 를 재사용한다 (새 동의 시스템 없음).

## 1. 판정 SSOT (변경 없음 + 보완 1개)

| 계층 | 위치 |
|---|---|
| 필수 버전 | `required_consent_versions('ko')` → `resolveRequiredConsentVersionsStrict` (CMS 게시 ko 문서) |
| 판정 | `hasStoreTermsConsent` + `hasAgeGateConsent` = `hasRequiredMemberConsents` |
| 쓰기 차단 | `member_write_gate_snapshot` → `resolveMemberConsentAuthority` → 403 `signup_incomplete` |
| 예외 API | `MEMBER_CONSENT_EXEMPT_RULES` (신고·차단·고객지원·로그아웃·탈퇴·자기 콘텐츠 삭제 등) |
| 화면 | `AuthComplianceRedirect`·`DibaySignupGate`·proxy → `/auth/onboarding/terms` (`AuthConsentForm`) |
| 기록 | `PATCH /api/me/legal-consent` → `record_member_required_consent` (서버 시각·서버가 읽은 게시 버전·`member_consent_events`) |

**보완:** 판정이 「현재 버전과 정확히 일치」만 보던 것을 「현재 버전 또는 아직 유효한 버전 목록」으로 넓혔다. 목록은 DB 가 개정 유형으로 계산한다 (§3). 목록이 없으면(마이그레이션 전·RPC 실패 후 대체 경로) 기존과 똑같이 현재 버전만 유효하다.

## 2. 회원별 동의 대상 산정 (운영 2026-11-05 06:0x PHT 읽기 전용 조회)

| 구분 | 인원 | 판정 | 화면 |
|---|---|---|---|
| 전체 `profiles` | 130 | 130명 모두 `member_age_gate_legacy_members` (기존 회원) | |
| 삭제(탈퇴) | 2 | 판정 대상 아님 | |
| 운영 회원 | 128 | | |
| └ 현재 버전 동의 기록 있음 | 112 | 통과 | 팝업 없음 |
| └ 동의 기록 없음 | 16 | 15명 차단 + 1명 관리자 통과 | 15명 동의 화면(약관·개인정보만, 연령 없음) |

- 128 − 112 = 16 은 모두 `terms_accepted_at` 이 없는 회원이다 (상태 `sns_pending` 7 · `verified_user` 9). 이 중 1명은 활성 관리자라 기존 규칙(`privileged_admin`)으로 통과한다.
- 동의 기록이 없는 회원에게 기록을 만들지 않는다. `member_consent_events` 0건, 마케팅 129건(`existing_member_default`)+1건(`settings`) 변경 없음.
- 기존 회원 예외(130명 고정 표)는 **연령 확인만** 면제한다. 약관 동의 판정은 예외 이전부터 있던 규칙 그대로다 — 이번 변경으로 기존 예외를 폐지·확대하지 않았다.

## 3. 약관 개정 — 「재동의 필요」 vs 「공지만」

`app_legal_documents.consent_requirement` (`reconsent` | `notice`, 기존 행 `reconsent`).

- 새 ko 이용약관·개인정보 버전을 **처음 게시할 때 관리자가 반드시 고른다** (기본값 없음 · 미선택 400).
- 유효 버전 = 현재 버전부터 최신순으로 내려가 직전 `reconsent` 버전까지. `reconsent` 를 게시하면 그 버전만, `notice` 를 게시하면 이전 동의가 계속 유효.
- 시행일이 미래인 버전은 시행 전까지 목록에 없다 (기존 선택 규칙과 동일).
- 한 번 게시된 terms·privacy 문서는 종류·언어·버전·제목·본문·시행일·개정 유형을 바꿀 수 없다 (API 409 + DB 트리거). 게시 중단·재게시만 가능. 오탈자도 새 버전(`notice`)으로 게시한다. marketing(선택) 문서는 기존 같은 버전 문구 수정 정책 유지.
- **어떤 변경이 재동의 대상인지는 법적 판단 — Owner 결정.** 관리자 화면 안내: 필수 동의 항목·개인정보 수집·이용 목적·제3자 제공 변경은 `reconsent` 기본.
- `notice` 개정의 회원 공지 방법(공지사항·푸시 등)은 이번 범위 밖 — Owner 결정.

## 4. 화면

- 기존 회원 재동의: 기존 동의 화면(`AuthConsentForm`, 오버레이 셸) — 제목 「약관 재동의」, 필수 버전 표시, 완료 후 원래 화면(`next`)으로 복귀.
- 동의 기록 없는 기존 회원·신규 회원: 같은 화면 — 필수/선택 태그, 전문 보기 시트, 필수 미체크 시 버튼 비활성, 마케팅 기본 OFF(기록 없는 회원만 묻는다).
- **보완:** 동의 화면 하단에 고객센터(문의·신고)·회원탈퇴·로그아웃. 고객센터·탈퇴 화면은 동의 리다이렉트에서 제외(`CONSENT_GATE_ESCAPE_PATH_PREFIXES`). 서버 API 는 원래 예외.

## 5. 배포 순서·호환·롤백

1. DB `20271106120000_legal_document_consent_requirement.sql` (Owner 승인 후) — 기존 행 `reconsent` 라 회원 판정 변화 0.
2. 웹 — DB 전이면 목록이 오지 않아 현재 버전만 유효(기존 동작). 관리자 terms/privacy ko 게시만 503(개정 유형 저장 불가) — 게시는 DB 적용 후.
3. 롤백: 웹 되돌리면 기존 동작. DB 는 함수 20271101020000 정의 복원 → 트리거·컬럼 drop.
