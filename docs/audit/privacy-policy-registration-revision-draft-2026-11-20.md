# 개인정보처리방침 개정안 — 가입 시 전화번호·대표 주소 필수 (2026-11-20)

근거: 가입 완료 = 동의 + 전화 인증 + 대표 주소 (PR #538 운영 반영 `41c5b28`) · 설계 `auth-entry-phone-address-consent-design-2026-11-20.md` C-4 · Owner 「오너 결정 사항은 권장안을 따른다」.
게시 방법: **관리자 → 약관·정책(Legal CMS)에서 새 문서로 게시** (게시본은 수정 불가 — `docs/legal-consent-revision-policy.md`). 작업자는 관리자 로그인을 하지 않으므로 Owner(또는 관리자)가 게시한다.

| 항목 | 값 |
|---|---|
| 종류 | 개인정보처리방침 (`privacy`) — ko·en 각 1건 |
| 새 버전 | `2026-11-20-registration` |
| 개정 유형 | **재동의(`reconsent`)** — 필수 수집 항목 변경(`docs/legal-consent-revision-policy.md` §40: 필수 동의 항목·수집 목적 변경은 `reconsent` 기본) |
| 시행일 | 게시 즉시 |
| 결과 | 동의를 마친 회원 133명(11-20 조회)이 다음 진입 때 재동의 화면(기존 흐름). 신규 가입자는 새 버전에 동의 |
| 본문 | 현재 게시본 `2026-11-07-contact` 전체를 그대로 복사하고 아래 2줄만 바꾼다 |

## ko — 「2. 처리하는 개인정보 항목 › (2) 프로필·회원 정보」

현재:
```
- 전화번호 및 휴대폰 인증 관련 정보(인증이 필요한 기능 이용 시)
- 지역·주소 정보(프로필·주소록에 등록하는 경우), 지도 좌표(주소·위치 설정 시)
```
개정:
```
- 전화번호 및 휴대폰 인증 관련 정보(회원 가입 시 필수 — 필리핀·한국 번호 문자 인증, 인증번호 발송을 위해 문자 발송 업체에 전화번호 전달)
- 대표 주소(회원 가입 시 필수)와 지도 좌표, 그 밖에 주소록에 추가로 등록하는 주소
```

## en — "2. … (2) Profile / membership"

현재:
```
- Phone number and phone-verification data when required
- Region/address (when saved to profile/address book) and map coordinates when set
```
개정:
```
- Phone number and phone-verification data (required to sign up — SMS verification for Philippine and Korean numbers; your number is sent to our SMS provider to deliver the code)
- Main address (required to sign up) with map coordinates, plus any other addresses you add to your address book
```

## 확인
- 게시 후 운영 조회: `app_legal_documents` 에 `privacy`·ko/en·`2026-11-20-registration`·`published`·`reconsent` 2건.
- 앱: 기존 회원 진입 시 「약관 재동의」 화면 → 동의 후 원래 화면 (실기 NOT_PROVEN).
- 이 문안은 법률 검토를 거치지 않은 작업자 초안이다.
