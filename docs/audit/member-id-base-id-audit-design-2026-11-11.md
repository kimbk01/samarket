# 회원 아이디 · 친구 찾기 · QR 친구 추가 — 최종 설계안 v3 (2026-11-11)

v1·v2(같은 날)를 대체한다. 감사·설계만 — 코드·DB 변경 없음. 운영 DB `ckdosyydvgzqwpbwuhon` 는 읽기 전용 SELECT 만 실행. 시안: Artifact 「DIBAY 회원 아이디·QR 설계」 · `docs/design/member-id-qr-mockup-2026-11-11.html`.

## 0. Owner 지시 (원문)

1. 「자동 부여 되는 아이디는 동일한 해당 회원의 기본 아이디로 상대방이 친구 추가나 다른 동일한 기능이 되는 부분이다」 · 「1회 변경 가능」
2. 「5자리숫자 +간단 영어 3개 형식으로 하자」 → 「부여받는 아이디부분을 규칙은 너의 권장안을 따르고 자 한다 정확한 부분을 임시나추측으로 하지 말고」
3. 「4자리 이상 일치하면 검색 되는 형태로 하고」
4. 「친구 추가 프로 부분에 자동 qr 코드를 만들러 상대방 스캔후 친구가 되는 시스켐을 텔레그램 위챗등을 철저히 분석 해서」 · 「정확한 프로필 형태의 시안」
5. 「기본아이디 표시 아이디가 2개가 나오면,, 오류로 보인다 … 1회변경시 회원 아이디를 숨겨 지는 형식 … 이부분을 서버에서 관리. 어드민에사는 변경도 가능 하지면 변경 가능권을 주는 형식 … 어드민에서는 모든 부분이 모닡일 가능」
6. 「아이디를 변경 하지 않으면 기본아이디로 상대방이 찾을수 있게 하고, 단 숫자 5자리가 동일 할때만 나오는,, 그리고 변경시 기본아이디는 단지 회원관리를 위한 디비로 만 남고, 변경 아이디만 보여주고」 → 「그래 진행 해줘」

## 1. 정정 (작업자 잘못 먼저)

1. **v2 설계·시안이 아이디 2개를 함께 보여 줌** — Owner 지시 5로 철회. v3 는 회원 화면에 아이디 1개만.
2. **v2 의 D5 「가입 미완료 회원이 검색에 나옴 = FAIL」 은 근거 없는 판정이었다.** 가입 미완료를 검색에서 빼라는 계약·지시가 없고, 가입 완료 판정(`getOnboardingStatus`: 동의 버전·전화 인증·주소 등)은 DB 한 줄 조건으로 옮길 수 없다. → **결함 목록에서 뺀다. 이번 설계에서 바꾸지 않는다.** 탈퇴 회원 노출(D5)만 결함으로 유지.
3. **D1(바꾸면 기본 아이디로 못 찾음)** — v1·v2 에서 FAIL 로 보고. Owner 지시 6(바꾸면 기본 아이디는 DB 에만, 검색 안 됨)으로 **의도된 동작**이 됨 → 결함에서 빼고 설계 변경으로 기록.

## 2. 감사 결과 (v3 기준)

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| D2 | 기본 아이디가 서버 규칙으로 관리되지 않음 — `dibay_id_initial` 이 있으나 변경 금지·중복 검사·어드민 표시 규칙 없음, 회원 응답에도 내려감 | **FAIL** | `lib/auth/profile-row-to-client-profile.ts:25` (회원 응답 포함), 변경 금지 트리거·유일 인덱스 없음 |
| D4 | 새 자동 아이디(`dibay123456`)를 프로필 완성 판정이 직접 정한 아이디로 봄 | **FAIL** | `lib/profile/profile-completed.ts:3`. 운영 1건 (이 경로로 저장됐는지는 확인 못 함) |
| D5 | 친구 검색에 탈퇴 회원 포함 | **FAIL** | `user-public-id-search.ts:162-169` 조건 없음, 운영 탈퇴 2명 아이디 보유. 화면 노출 NOT_PROVEN |
| D6 | 검색이 60행 가져와 앱에서 거름 → 규칙이 늘면 결과 잘림 | **FAIL** | `.limit(60)` 후 필터 |
| D7 | 「QR · 초대」 탭에 QR 없음, 초대 링크에 회원 정보 없음 | **FAIL** | `MessengerFriendAddSheet.tsx:249-276`, `CommunityMessengerHome.tsx:1292-1295` |
| D8 | 공개 프로필 `/u/[username]` 은 `username` 으로만 찾음 | **FAIL** | `app/(main)/u/[username]/page.tsx:36-40` |
| D9 | 아이디 중복 확인·확정·자동 발급 API 요청 횟수 제한 없음 | **FAIL** | `app/api/me/dibay-id/{reserve,confirm,assign-auto}` |
| D10 | 「아이디로 나를 찾기」 서버 설정 없음 | 미구현 | `lib/community-messenger/preferences.ts` localStorage 뿐 |
| D11 | iOS 카메라 권한 문구 = 「영상 통화를 위해」 — QR 스캔(PC 로그인에서 이미 사용) 목적 누락 | **FAIL** (네이티브) | `ios/App/App/Info.plist:66-67` |
| D12 | 앱 링크 없음 — 휴대폰 카메라로 QR 찍으면 웹이 열림, Android `dibay://` 는 정해진 host 만 | 미구현 (네이티브) | `App.entitlements`, `AndroidManifest.xml:66-101` |
| D13 | **관리자가 바꾼 5명: DB 는 본인 1회 변경 허용, 앱 판정은 불허** — 서버·앱 판정 불일치 | **FAIL** (코드) | DB `confirm_dibay_id` 는 `locked=false` 면 변경 허용, 앱 `canChangeOnce` 는 `dibay_id_auto_assigned === true` 필요(`dibay-public-id-ssot.ts` `evaluatePublicIdProfileView`). 운영 5명 `auto=false, changed_once=false, locked=false`. 화면 NOT_PROVEN |

운영 현황 (2026-11-11 조회): 회원 142 (탈퇴 2).

| 아이디 상태 | 수 |
|---|---|
| 자동 옛 형식 `dibay_` + 16진수 6 · 안 바꿈 | 54 |
| 자동 `dibay` + 숫자 6 · 안 바꿈 | 21 |
| 본인이 1회 바꿈 | 1 |
| 관리자가 바꿈 (본인 변경권 미사용) | 5 |
| 직접 정한 아이디만 (기본 아이디 기록 없음) | 61 |
| 새 형식 `^[0-9]{5}[a-z]{3}$` 사용 중 | 0 |
| `dibay_id_initial` 중복 · 다른 회원 현재 아이디와 겹침 | 0 · 0 |

## 3. 확정 규칙

### 3.1 아이디 상태 (서버 판정 단일화)

DB 칸 의미:
- `dibay_id` = **회원 아이디** (화면에 보이는 유일한 아이디)
- `dibay_id_initial` = **기본 아이디** (처음 발급, 평생 고정, 어드민 전용)
- `dibay_id_changed_once` = 본인 변경권 사용 여부
- `dibay_id_auto_assigned` = 지금 아이디가 시스템 발급 그대로인지

| 상태 | 판정 조건 | 회원 화면 | 친구 찾기 | 본인 변경 |
|---|---|---|---|---|
| S1 새 형식 · 안 바꿈 | `auto_assigned` AND `dibay_id = dibay_id_initial` AND `dibay_id ~ '^[0-9]{5}[a-z]{3}$'` | `@48213sun` | 숫자 5자리 일치 또는 아이디 전체 일치 | 가능 (1회) |
| S2 옛 형식 · 안 바꿈 | `auto_assigned` AND `dibay_id = dibay_id_initial` AND 옛 형식 | `@dibay482913` | 아이디 전체 일치만 | 가능 (1회) |
| S3 바뀐 아이디 | 위 둘이 아님 (본인 변경·관리자 변경·직접 정함) | `@minji.kim` | 4자 이상 부분 일치 | `changed_once = false` 면 가능 |

- 앱은 이 판정을 하지 않는다. 서버가 `dibay_id` 하나와 `can_change_once` 만 내려준다 → D13 해결.
- 기본 아이디(`dibay_id_initial`)는 회원 대상 API 응답에서 뺀다 (`profile-row-to-client-profile.ts`, `fetch-profile-row-safe.ts` 회원 경로). 어드민 API 만 포함 → D2 해결.

### 3.2 자동 아이디 형식 (신규 발급)

- 형식: **숫자 5자리 + 영어 3글자 단어**, 정규식 `^[0-9]{5}[a-z]{3}$`, 8자. 예 `48213sun`.
  - 기존 아이디 규칙 `^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$`(4~20자) 안에 든다 (`48213sun`·`00000ace` 검사 통과).
- 숫자: `00000`~`99999` 균등 무작위 (`floor(random()*100000)`, 앞자리 0 유지). 숫자 조합은 거르지 않는다.
- 단어: 아래 **78개** 중 균등 무작위. 조합 수 = 78 × 100,000 = **7,800,000**.

```
ace ant arc art awe bag bat bay bee bud bun bus cab cap car cat cub cup day den
dew emu fan fun gem gum gym ham hat hen hue hug hut jam jar jay jet jug key map
mat nap net new nut pad pan pea pen pet pup ram ray red rug run rye sap saw sea
sky spa sub sum sun tag tan tea tub tug van vet wax way web yak yam yes
```

- 단어 선정 규칙 (스크립트로 확인: 78개 모두 영문 소문자 3글자, 중복 0, i·l·o 0):
  1. i·l·o 가 들어간 단어 제외 — 숫자 1·0 과 붙어 헷갈림 (예: elk, fox, dog, cow, jog, pig, kit, zip, big, fig).
  2. 술 (keg, pub, rum, bar), 종교 (zen, nun, ark), 폭력 (axe, gun, war, jab), 부정적 뜻 (bad, sad, mad, fat, rat, bug), 성·민감 (sex, gay, ass, bra), 돈 (tax, pay), 기타 부정 연상 (gas, tar, wet) 제외.
  3. 낯선 단어 (ewe, gnu), 다른 뜻이 나쁜 단어 (mug = 강도질), 숫자 단어 (ten) 제외.
- 단어표는 DB 표 `dibay_id_wordlist(word text PK CHECK (word ~ '^[a-z]{3}$' AND word !~ '[ilo]'), enabled bool default true)`. 위 78개를 마이그레이션에 넣는다. 관리 화면 없음 — 바꿀 때는 마이그레이션으로.
- 충돌: 후보의 키가 다른 회원의 `dibay_id_key`·기본 아이디 키·확정 `username` 키와 같으면 다시 뽑는다. 최대 48회, 넘으면 `assign_collision_exhausted` 오류 (지금 회원 142명 기준 한 번 충돌할 확률 약 0.002%).
- 시스템 전용: `^[0-9]{5}[a-z]{3}$` 모양은 회원·관리자가 직접 지정 불가 (`dibay_id_reserved_pattern`). 기존 `dibay` 접두 금지도 유지.
- 기존 `dibay…` 아이디 75명은 **바꾸지 않는다**.
- 적용 지점: DB 함수 `assign_auto_dibay_id` 하나 (가입·OAuth·네이티브·관리자 생성 모두 이 함수 호출).

### 3.3 친구 찾기 (회원 검색)

입력 정리: 앞뒤 공백 제거 → 앞의 `@` 제거 → 소문자. 비교 키 = 정리한 입력에서 `.`·`_` 제거.

| 대상 | 나오는 조건 |
|---|---|
| S1 (새 형식, 안 바꿈) | 입력이 숫자 5자리이고 그 회원 아이디 앞 5자리와 같을 때 (`48213` → 48213sun, 48213bee …), 또는 입력이 아이디 전체와 같을 때 (`48213sun`). `4821`·`sun`·`8213s`·`48213su` 로는 안 나옴 |
| S2 (옛 형식, 안 바꿈) | 입력 키가 아이디 키와 같을 때만 (`dibay482913`, `dibay_0d9d04`·`dibay0d9d04`) |
| S3 (바뀐 아이디) | 입력 키가 4자 이상이고 아이디 키에 포함될 때 |
| 기본 아이디 (`dibay_id_initial`, S3 회원) | **검색 안 됨** |
| 닉네임 | 지금 규칙 그대로 (2자 이상 포함 일치, S1·S2 회원은 닉네임으로 안 나옴) |

- 정렬: ① 아이디 전체 일치 ② S1 숫자 5자리 일치·S3 앞부분 일치 ③ S3 포함 일치 ④ 닉네임 일치. 같은 순위는 아이디 가나다순. 최대 20명.
- 빼는 회원: 나 자신, 탈퇴(`deleted_at IS NOT NULL` 또는 `status = 'deleted'`), 서로 차단, 「아이디로 나를 찾기」 끈 회원(아이디 일치만 빠짐 — 닉네임 일치도 빠짐).
- 구현: DB 함수 `cm_search_members(p_viewer uuid, p_query text, p_limit int)` 하나가 조건·정렬·차단·설정을 처리해 결과를 돌려준다 (service_role 전용). 인덱스: `dibay_id_key` pg_trgm GIN (S3 부분 일치), `left(dibay_id,5)` btree (S1). → D5·D6 해결.
- 요청 제한: 지금 1분 60회 유지 + **회원당 하루 500회** (숫자 5자리 00000~99999 를 돌려 회원 목록을 긁는 것 방지). 아이디 API 3개(reserve·confirm·assign-auto)에 1분 10회 → D9 해결.
- 어드민 회원 검색(`lib/admin-users/admin-member-list-query.ts` `buildProfileTextSearchOr`)에 `dibay_id_initial` 포함 — 어드민은 기본 아이디로도 회원을 찾는다.

### 3.4 아이디 변경

| 누가 | 무엇을 | 조건 · 기록 |
|---|---|---|
| 회원 | 회원 아이디 1회 변경 | `changed_once = false` 일 때. 변경 후 `changed_once = true`, `locked = true`, `auto_assigned = false`. 확인 시트 문구: 「바꾸면 지금 아이디로는 더 이상 찾을 수 없어요. 바꾼 아이디는 다시 바꿀 수 없어요」 |
| 어드민 | 회원 아이디 변경 | 사유 필수(현행). `auto_assigned = false`. 회원 변경권은 건드리지 않음(현행) |
| 어드민 | **변경권 다시 주기** (신규 `admin_grant_dibay_id_change`) | `changed_once = true` 인 회원만. `changed_once = false`, `locked = false`. 사유 필수, `audit_logs` 에 `admin_member_dibay_id_change_grant` 기록 |
| 누구도 | 기본 아이디 변경 | 불가 — 값이 생긴 뒤 `dibay_id_initial` UPDATE 를 거부하는 트리거 |

- 중복 검사 `dibay_id_candidate_error`: 후보 키를 다른 회원의 `dibay_id_key`·**기본 아이디 키**·확정 `username` 키와 대조 → 바뀐 기본 아이디도 다른 회원이 못 가져감.
- 기본 아이디 키 유일 인덱스 (운영 중복 0건 확인).

### 3.5 기존 회원 처리 (운영 적용 시 1회, 전 행 백업 표 포함)

| 대상 | 처리 |
|---|---|
| 자동 아이디 안 바꾼 75명 | 그대로 (`dibay_id_initial` 이미 있음) |
| 바꾼 6명 | 그대로 — 기본 아이디는 DB 에만, 검색 안 됨 |
| 직접 정한 아이디만 있는 61명 | `dibay_id_initial = dibay_id` (기본 아이디 기록을 지금 아이디로 채움 — 새 아이디 발급 안 함) |
| 관리자가 바꾼 5명 | 그대로 — 본인 변경권 1회 남음 (3.1 서버 판정으로 앱에도 표시됨) |

### 3.6 QR 친구 추가 (v2 와 같음)

- QR 내용: `https://dibay.app/f/<토큰>`, 토큰 = 무작위 16바이트 base64url 22자. 아이디를 담지 않음 → 아이디를 바꿔도 QR 유지.
- 표 `member_friend_qr(user_id PK, token UNIQUE, created_at, regenerated_at, scan_count)` · RLS service_role 전용.
- 「QR 다시 만들기」 = 새 토큰, 옛 QR 즉시 무효 (라인 방식).
- 스캔 → 프로필 미리보기(사진·닉네임·@회원 아이디) → [친구 추가] → **바로 친구**. RPC `cm_add_friend_via_qr(p_viewer, p_token)`: 토큰 유효·주인 활성·본인 아님·`allow_qr_add`·서로 차단 아님 확인 → 이미 친구면 성공 그대로 → 양쪽 `user_social_relations friend` + `community_friend_requests(status accepted, source 'qr')` 한 트랜잭션, 둘 사이 대기 요청 정리, 같은 쌍 잠금. 이전 거절 사이도 허용(QR 을 보여 준 것이 동의). QR 주인에게 알림 「OO님이 QR로 친구가 되었어요」.
- 실패는 한 문구: 「이 QR로는 친구를 추가할 수 없어요」 (이유를 밝히지 않음).
- 스캔 경로: 앱 안 카메라(PC 로그인 스캐너 `PcLoginScanContent` 를 공용 부품으로 분리), 갤러리 이미지(jsQR), 휴대폰 카메라 → 웹 `/f/<토큰>` (사진·닉네임, [앱에서 열기] [앱 설치], 웹 로그인 시 [친구 추가]).
- 「내 QR」 위치: 마이페이지 내 프로필, 메신저 친구 탭 내 프로필 줄, 친구 추가 시트 「QR」 탭.
- `community_friend_requests.source` 추가: `id_search`·`qr`·`contacts`·`profile`.

### 3.7 친구 찾기 설정

표 `member_discovery_settings(user_id PK, allow_id_search bool default true, allow_qr_add bool default true, updated_at)` — 연락처 동기화 설정 표(`messenger_contact_settings`, 연락처 동의자만 행)와 분리.
- 「아이디로 나를 찾을 수 있게 하기」 끄면 친구 찾기에서 빠짐, QR 은 영향 없음.
- 「QR로 친구 추가 허용」 끄면 QR 스캔해도 친구 안 됨.

### 3.8 화면 (시안 A~J)

- A 내 프로필: 사진 · 닉네임 · `@회원 아이디` 1개 · 상태 배지(「1회 변경 가능」 — S1·S2 와 변경권 남은 S3 만) · [내 QR] [프로필 공유] [프로필 편집].
- B 내 QR · C 스캔 · D 스캔 결과 · I 웹 페이지: 3.6.
- E 친구 추가 · 아이디: 안내 「아이디 4자 이상 또는 숫자 5자리를 입력하세요」.
- F 친구 프로필: `@회원 아이디` 1개, 친구가 된 경로 배지(「QR로 추가」).
- G 아이디 변경: 3.4 문구. 기본 아이디는 표시하지 않음.
- H 친구 찾기 설정: 3.7.
- J 어드민 회원 상세 · 아이디: 회원 아이디, 기본 아이디, 상태(S1/S2/S3), 본인 변경권, 변경 이력(시각 PHT·실행자·전후·사유), [아이디 변경] [변경권 다시 주기].
- 공개 프로필 `/u/<회원 아이디>`: `dibay_id` 로 열림 (D8). 기본 아이디 주소로는 안 열림(S3).

## 4. 변경 목록

DB (마이그레이션 1개 — 운영 적용 Owner 승인):
- 표: `dibay_id_wordlist`(78행), `member_friend_qr`, `member_discovery_settings`, `profiles_dibay_id_initial_backup_<날짜>`.
- 칸·인덱스: `profiles.dibay_id_initial_key`(생성 컬럼) + 유일 인덱스, `dibay_id_key` trigram GIN, `left(dibay_id,5)` 인덱스, `community_friend_requests.source`.
- 트리거: `dibay_id_initial` 변경 거부.
- 함수: `assign_auto_dibay_id`(새 형식), `dibay_id_candidate_error`(기본 아이디 키 대조·새 형식 예약), `confirm_dibay_id`(변경권 판정 = `changed_once`), `admin_set_dibay_id`(새 형식 예약), 신규 `admin_grant_dibay_id_change`, 신규 `cm_search_members`, 신규 `cm_add_friend_via_qr`, 신규 `member_public_id_state`(상태·변경권 단일 판정).
- 데이터: 3.5.

웹:
- `lib/auth/dibay-id-policy.ts`, `lib/auth/dibay-public-id-ssot.ts` (상태 판정을 서버 값으로), `lib/profile/profile-completed.ts`(D4), `lib/auth/profile-row-to-client-profile.ts`·`lib/profile/fetch-profile-row-safe.ts`(기본 아이디 회원 응답 제외), `lib/auth/post-login-profile-policy.ts`, `lib/auth/refresh-oauth-nickname-if-legacy.ts`.
- 검색: `lib/community-messenger/user-public-id-search.ts`(DB 함수 호출), `lib/community-messenger/social-relations.ts` `resolveUserByPublicId`(같은 규칙), `app/api/community-messenger/users/route.ts`(하루 한도).
- 아이디 API 한도: `app/api/me/dibay-id/{reserve,confirm,assign-auto}/route.ts`.
- 화면: `components/my/edit/ProfileDibayIdSection.tsx`, `components/mypage/myinfo/RequiredInfoList.tsx`, `components/mypage/profile/MypageSelfProfileView.tsx`, `components/community-messenger/MessengerFriendAddSheet.tsx`·`MessengerHomeInlineFriendSearch.tsx`(안내 문구), `components/community-messenger/MessengerFriendProfileSheet.tsx`, `app/(main)/u/[username]/page.tsx`.
- 어드민: `components/admin/users/AdminMemberMasterHeader.tsx`·`AdminMemberDibayIdDialog.tsx`(기본 아이디·상태·변경권·이력·변경권 다시 주기), `app/api/admin/users/[id]/route.ts`, `lib/admin-users/admin-member-list-query.ts`.
- QR: 신규 `app/f/[token]`, `app/api/community-messenger/friend-qr/{me,regenerate,resolve,add}`, 스캐너 공용 부품, `lib/platform/deep-link-routes.ts`(`dibay://friend/<토큰>`), 알림 문구.
- 문구: i18n 카탈로그 ko·en 키로만.
- 시험: 옛 형식 고정 시험 수정 (`dibay-id-policy-v2`, `profile-completed`, `user-public-id-search*`, `dibay-auto-assign-policy`, `dibay-public-id-ssot` 외 16진수 fixture 파일), 검색 규칙 표 3.3 의 각 행 시험.

네이티브 (Owner 일괄 빌드 때): iOS 카메라 문구 「영상 통화와 QR 코드 스캔을 위해」(D11), Android `dibay://friend` intent filter, 앱 링크(iOS associated-domains, Android App Links, `.well-known` 2개)(D12).

## 5. 단계 · 검증

| 단계 | 내용 | 구분 |
|---|---|---|
| 1 | 4장 DB 전체 (QR·설정 표 포함) | DB — 운영 적용 Owner 승인 |
| 2 | 아이디·검색·변경·어드민 웹 (시안 A·E·F·G·H·J) | 웹 PR 1개 |
| 3 | QR 웹 (시안 B·C·D·I) | 웹 PR 1개 |
| 4 | 네이티브 3건 | 네이티브 |

- 순서: 1 → 2 → 3. 웹이 DB 보다 먼저 나가면 없는 함수 호출로 검색 실패.
- 3단계는 지금 설치된 앱에서 동작 (앱 안 스캔 = PC 로그인과 같은 카메라 경로). 4단계 전까지 휴대폰 카메라로 찍으면 웹 페이지가 열리고, Android 에서 [앱에서 열기]는 동작하지 않음.
- 통화·알림 발송 계약·거래와 무관. 알림은 기존 친구 요청 알림 경로 재사용.
- 실기 검증 (Owner 계정·휴대폰, 각 항목 Production SHA·PHT 기록):
  1. 신규 가입 → `숫자5+영어3` 발급, 내 프로필에 아이디 1개
  2. 다른 계정에서 숫자 5자리로 검색 → 나옴, 4자리·영어만 → 안 나옴
  3. 1회 변경 → 새 아이디만 보임, 옛 아이디 전체 입력 → 안 나옴, 새 아이디 4자 → 나옴
  4. 옛 형식 회원 아이디 전체 입력 → 나옴, 일부 → 안 나옴
  5. 탈퇴 회원 검색 안 나옴
  6. 어드민: 기본 아이디로 회원 검색, 변경권 다시 주기 → 회원 화면에 변경 버튼
  7. 내 QR → 다른 폰 앱 스캔 → 바로 친구·알림, 갤러리 스캔, QR 다시 만들기 후 옛 QR 거부, QR 추가 끄기
  8. 휴대폰 카메라 → 웹 `/f`

## 6. 남은 위험

- 숫자 5자리 검색은 같은 숫자의 회원(최대 78명)이 함께 나옴 — 단어로 구분.
- 하루 500회 한도는 숫자 5자리 전체(100,000개) 긁기를 200일 이상으로 늦출 뿐 완전히 막지는 못함.
- 「바로 친구」 QR 은 QR 이미지가 퍼지면 원치 않는 친구가 생김 — 「QR 다시 만들기」·「QR로 친구 추가 허용」 끄기·차단으로 대응.
- 앱 화면 재현은 하지 않음 (NOT_PROVEN).

## 7. 구현 기록

### 1단계 DB (2026-11-11) — `supabase/migrations/20271111160000_member_id_v3_state_search_qr.sql`

- 운영 함수 정의(`confirm_dibay_id`·`admin_set_dibay_id`·`dibay_id_candidate_error`·`cm_accept_friend_request`)를 2026-11-11 조회본 그대로 옮기고 표시한 줄만 바꿈.
- 상태·변경 가능 여부는 **생성 컬럼** `profiles.dibay_id_state`(`none`·`auto`·`auto_legacy`·`custom`)·`profiles.dibay_id_can_change` 로 DB 한 곳에서 판정 → 2단계 화면·CTA 는 이 두 값만 쓴다 (UI·CTA SSOT, Owner 2026-11-11).
- `assign_auto_dibay_id`: 회원 아이디가 이미 있으면 다시 발급하지 않음 (기본 아이디 변경 금지 트리거와 충돌 방지).
- `cm_search_members`: 아이디 비교는 `dibay_id_key` 만. 기존 검색이 쓰던 「확정 username」 일치는 쓰지 않음 (`dibay_id` 가 회원 아이디 단일 정의, 운영 `dibay_id` 없는 회원 0).
- 설계 §4 의 검색 인덱스(trigram·앞 5자리) 2개는 **넣지 않음** — 판정이 CASE 식 안에 있어 인덱스를 쓰지 않고, 회원 142행. 회원 수가 늘면 검색 함수를 갈래별 조회로 나누면서 함께 추가.
- 운영 읽기 전용 시뮬레이션(같은 식의 SELECT, 2026-11-11): 상태 `auto_legacy` 75 (변경 가능) · `custom` 67 (변경 가능 8 = 관리자 변경 5 + 잠기지 않은 직접 아이디 3, 불가 59) · 채운 뒤 기본 아이디 키 중복 0. 검색: `@Dibay930512` 1 · `9305` 0 · `dibay_0d9d04`(바뀐 회원 기본 아이디) 0 · `dibay_778d44` 0 · `hoon` 1 · `jjch` 1 · `ab` 0.
- **운영 DB 적용 완료** (Owner 「운영 DB 적용」 2026-11-11, `schema_migrations 20271111160000`, 한 트랜잭션, 오류 없음). 적용 후 읽기 전용 확인:
  - 백업 142행 · 단어표 78 · 새 함수 8개 · 상태 `auto_legacy` 75(변경 가능) / `custom` 59(불가) / `custom` 8(가능) — 시뮬레이션과 같음
  - 기본 아이디 비어 있는 회원 0 · 채운 회원 61 · 기존 기본 아이디 바뀐 회원 0 · 아이디·username·자동/변경/잠금 칸 바뀐 회원 0
  - 새 함수·표 모두 anon·authenticated 권한 없음 (service_role 전용)
  - `cm_search_members`: `@Dibay930512` exact 1 · `9305` 0 · `dibay_0d9d04` 0 · `dibay_778d44` 0 · `hoon` prefix 1 · `jjch` prefix 1 · `48213` 0 (새 형식 회원 아직 없음)
  - `member_friend_qr_resolve` 잘못된·없는 토큰 → `qr_invalid` · 토큰 길이 22
  - 쓰기 함수(발급·변경·변경권·QR 추가·QR 생성)는 운영에서 실행하지 않음 — 2·3단계 실기에서 확인 (NOT_PROVEN)

## 8. 후속 항목 (설계 완료 후 처리 — Owner 2026-11-11 「중간 결함·범위 밖은 설계안 완료 이후」)

| # | 내용 | 근거 |
|---|---|---|
| F1 | `assign_auto_dibay_id` 가 발급 때 `username` 을 새 아이디로 덮어씀 — 관리자 생성 회원의 로그인 별칭이면 로그인 아이디가 바뀔 수 있음 (기존 동작, v3 에서 그대로 둠) | 2026-11-08 데이터 정리 H 는 username 을 비어 있을 때만 채웠음 |

### 2단계 웹 (2026-11-11) — 아이디·친구 찾기·변경·어드민, UI·CTA 단일 계약

- **UI·CTA 단일 계약** `lib/auth/member-public-id-ui-contract.ts` (`resolveMemberPublicIdUi`): 회원 아이디 1개·「1회 변경 가능」 배지·친구가 찾는 방법 안내·[아이디 변경] CTA·변경 확인 문구를 한 곳에서. 사용처: 프로필 편집·아이디 변경 시트·필수 정보(`ProfileDibayIdSection`), 내정보 필수 카드(`RequiredInfoList`), 내 프로필(`MypageSelfProfileView`).
- **상태·변경권**: `dibay-public-id-ssot` 가 DB `dibay_id_state`·`dibay_id_can_change` 를 쓴다 (조회하지 않은 행만 같은 식으로 계산). D13 해소 — 관리자가 바꾼 회원도 앱에 [아이디 변경].
- 자동 아이디 모양 `^[0-9]{5}[a-z]{3}$` 추가 (`dibay-id-policy`) — 회원 입력 거부·프로필 완성 판정(D4)·OAuth 별명 판정에 반영.
- 회원 응답에서 기본 아이디(`dibay_id_initial`) 제거, 상태·변경권 추가 (`profile-row-to-client-profile`·`fetch-profile-row-safe`).
- **친구 찾기**: `user-public-id-search` → DB `cm_search_members` 한 번 호출 (D5·D6). `resolveUserByPublicId` 도 같은 함수의 exact 만 (D5 — 탈퇴·차단·검색 끔 제외, 바뀐 기본 아이디 안 찾음). 친구 추가 시트에 규칙 안내 「아이디 4자 이상 또는 숫자 5자리」.
- **요청 제한**: 친구 검색 하루 500회 추가. 아이디 API — 확정·자동 발급 1분 10회, **중복 확인 1분 30회** (설계 §3.3 의 10회에서 바꿈: 입력이 멈출 때마다 400ms 뒤 자동 확인이 불려 10회면 정상 입력에도 막힘) (D9).
- **공개 프로필** `/u/[아이디]`: `dibay_id` 로 먼저 찾고, 예전 `username` 링크는 그다음 (D8). 바뀐 회원의 기본 아이디로는 열리지 않음.
- **친구 찾기 설정** (시안 H): `GET/PATCH /api/me/discovery-settings`, 채팅 설정 화면 아래 `MemberDiscoverySettingsSection` (토글 저장은 `MyToggle` 계약).
- **어드민** (시안 J): `AdminMemberIdPanel` — 회원 아이디·기본 아이디·상태·본인 변경권·변경 이력(관리자 변경·변경권 다시 주기 = audit_logs, 회원 본인 변경 = 마지막 `dibay_id_changed_at` 1건)·[변경권 다시 주기](사유 필수). API `GET/POST /api/admin/users/[id]/member-id`. 어드민 회원 검색에 기본 아이디 포함.
  - 시안 J 의 「시스템 발급」 줄은 넣지 않음 — 직접 정한 아이디 61명의 기본 아이디는 발급이 아니라 2026-11-11 채움이라 발급 시각이 없음.
- 내정보 홈 필수 행(`mypage-home-required-items`)은 기존 문구 키를 쓰되 판정은 같은 SSOT — 「미잠금·자동 아님」 회원이 「확정 필요」 대신 「1회 변경 가능」(DB 와 같음).
- 검증 (로컬): `typecheck:build`·`typecheck:test` 0 오류 · `test:ci` 전체 통과 (1546+1545 파일) · 변경 파일 eslint 오류 0 · `check:i18n-quality` 통과. 실기기·운영 화면 NOT_PROVEN.

### 3단계 QR 친구 추가 웹 (2026-11-11)

- **설계 정정 (작업자 잘못)**: 설계안 §3.6 의 QR 주소 `https://dibay.app/f/…` 는 코드로 확인하지 않은 주소였다. 실제 운영 주소 상수 `DIBAY_PRODUCTION_SITE_ORIGIN` = `https://samarket.vercel.app` → QR 주소는 `https://samarket.vercel.app/f/<토큰>`.
- 계약 `lib/community-messenger/friend-qr/friend-qr-contract.ts`: 주소·앱 링크(`dibay://friend/<토큰>`)·홈 경로(`/community-messenger?friendQr=`)·읽기(운영 주소·지금 주소·앱 링크만)·실패 문구 하나(본인 QR 만 따로).
- 서버 `friend-qr.server.ts` + API `/api/community-messenger/friend-qr/{me,regenerate,resolve,add}` — DB 함수 4개만 호출. 추가 API 는 친구 요청과 같은 가입·필수 항목 확인, 요청 제한(내 QR·미리보기 60/분, 다시 만들기 10/분, 추가 20/분).
- 알림: QR 주인에게 「OO님이 QR로 친구가 되었어요」 — 기존 알림 종류 `friend_accepted`(소리·설정·분류 등록 그대로) + `via: "qr"`, 문구만 새 키.
- 화면: 친구 추가 시트 「QR」 탭 = [내 QR | QR 스캔] (D7 — 회원 정보 없는 초대 링크 제거), 결과 시트 `FriendQrResultHost`(메신저 홈 1곳, 앱 안 스캔·갤러리·`?friendQr=` 공용), 내 QR 시트 진입 = 마이페이지 내 프로필·메신저 친구 탭 내 프로필 줄.
- 스캐너: PC 로그인 스캐너의 카메라·jsQR 부분을 공용 `lib/qr/use-qr-camera-scanner.ts` 로 분리, PC 로그인도 같은 부품 사용 (동작 같음: 250ms 간격, 다른 QR 이면 1초 뒤 재시도, 읽으면 카메라 끔). 갤러리 사진은 `decodeQrFromImageFile`.
- 웹 `/f/<토큰>` (시안 I): 사진·이름만, [앱에서 열기](`dibay://friend/…`) · [웹에서 계속](로그인 → 메신저 결과 시트). 비로그인 열람 허용(`guest-browse-access-policy`). **[앱 설치] 버튼은 넣지 않음** — iOS 스토어 주소가 코드에 없고 Play 등록 공개 여부를 확인하지 못함.
- 딥링크 `dibay://friend/<토큰>` → 홈 결과 시트 (`deep-link-routes.ts`, 통화·채팅 경로 무변경). iOS 는 지금 앱에서 동작, Android 는 4단계(intent filter) 후.
- Android `DibayAppRouteGuard` 허용 목록에 `f` 추가 — 웹 경로 동기화 시험(LINK-02) 계약. 앱 재빌드 전까지 동작 변화 없음.
- 검증 (로컬): typecheck 2종 0 오류 · vitest 두 묶음 전체 통과 · 변경 파일 eslint 오류 0 · i18n 품질 통과. 실기기·운영 NOT_PROVEN.

### 4단계 네이티브 (2026-11-11) — 코드만, 빌드는 Owner 일괄

- iOS 카메라 권한 문구: 「영상 통화와 QR 코드 스캔을 위해 카메라 접근이 필요합니다.」 (Info.plist · ko/en InfoPlist.strings) — D11.
- Android `dibay://friend/<토큰>` intent filter → 메신저 결과 시트 (JS 해석은 3단계 `deep-link-routes`).
- 앱 링크 (D12):
  - Android: `https://samarket.vercel.app/f/…` intent filter `autoVerify="true"` + `public/.well-known/assetlinks.json` (패키지 `com.dibay.app`, 지문 = 릴리스 APK 서명 `CN=DIBAY Play Upload` SHA-256 `5F:4D:B9:4E:…:90:5E`, `apksigner` 로 2026-11-11 읽음).
  - iOS: `App.entitlements` `applinks:samarket.vercel.app` + `public/.well-known/apple-app-site-association` (appID `ATB959PF9V.com.dibay.ph` — Xcode 프로젝트의 팀·번들 ID), `next.config.js` 로 JSON 응답, 비로그인 열람 허용.
  - 앱 안: `FriendQrAppLinkListener` (https 친구 QR 주소만, 꺼진 앱은 `getLaunchUrl`) — `PushRouteListener`(통화 경로 포함)·`AppDelegate`(이미 유니버설 링크 전달) 무변경.
- **Owner 조치 필요 (작업자가 할 수 없음)**:
  1. Google Play 로 설치한 앱은 Play 앱 서명 키로 서명된다 — 그 SHA-256 은 Play Console(앱 무결성 → 앱 서명)에만 있다. 받으면 `assetlinks.json` 에 한 줄 추가해야 Play 설치 앱에서 앱 링크가 바로 열린다 (그 전에는 브라우저 → 웹 `/f` 페이지).
  2. Apple Developer 의 App ID `com.dibay.ph` 에 Associated Domains 기능을 켜고 프로비저닝 프로필을 다시 받아야 iOS 빌드가 서명된다.
- 빌드 번호는 설치·배포용 빌드를 만들 때 1회 증가 (`npm run native:prepare`) — 이번 커밋에서 올리지 않음.
- 검증 (로컬): typecheck 2종 0 오류 · vitest 두 묶음 전체 통과 · XML·plist 형식 OK · eslint 오류 0. 실기기 NOT_PROVEN (빌드 전).

### 후속 F1 (2026-11-11) — 어드민 「로그인 아이디」 표시

- 확인: 자동 아이디 발급이 `username` 을 덮어써도 **로그인은 영향 없음** — `resolvePasswordLoginIdentifier` 가 관리자 발급 로그인 주소(`<id>@manual.local` = `auth_login_email`, Auth 이메일과 일치 확인)를 username 보다 먼저 찾는다. 운영(2026-11-11): 관리자 생성 회원 40명 중 Auth 이메일 ≠ `auth_login_email` 0명.
- 결함: 어드민 회원 머리글·개요·인증 패널이 「로그인 아이디」를 `username` 으로 표시 — 운영 관리자 생성 회원 19명은 실제 로그인 아이디와 `username` 이 다름(자동 아이디로 바뀜), SNS 회원은 로그인 아이디가 없는데 `username` 이 표시됨.
- 수정: 상세 API 에 `manual_login_id`(발급 로그인 주소 앞부분) 추가, 세 화면 모두 그 값만 표시. 발급 로그인 아이디가 없으면 표시 안 함.
- 자동 발급의 `username` 덮어쓰기 자체는 바꾸지 않음 — 로그인·표시 어디에도 영향이 남지 않음.

### PR #145 리뷰 (Cursor Bugbot) 반영

- 내 QR: QR 그림 만들기 실패 시 오류 화면·버튼 비활성 (`535581afe`).
- 앱 링크: 꺼진 앱이 열린 주소(`getLaunchUrl`)를 프로세스당 1회만 처리 — 다시 마운트될 때 결과 시트가 다시 열리던 결함.

## 9. 재감사 (2026-11-11 밤) — 오류·중복·누락·누수와 수정

병합된 #145·#147 을 설계안과 대조 (독립 감사 에이전트 + 코드·운영 DB 읽기 전용 확인). 모두 작업자 구현에서 생긴 문제.

| # | 분류 | 내용 | 수정 |
|---|---|---|---|
| E1 | 오류 | 중복 확인이 기본 아이디를 안 봄 → 「사용 가능」 후 확정 실패 | `reserveDibayIdForUser` = DB `dibay_id_candidate_error` (확정과 같은 함수) |
| E2 | 오류 | 변경권 다시 주기 대상이 설계보다 넓음 (잠긴 직접 아이디 58명 포함) | DB·어드민 버튼 모두 `changed_once = true` 만 (`change_right_not_used`) |
| E3 | 오류 | QR 기록 `source` 가 다시 연 요청에 남음 | `cm_send_friend_request(p_source)` 가 다시 열 때 갱신 |
| E4 | 오류 | 아이디 검색을 꺼도 「찾을 수 있어요」 안내 | 단일 계약에 검색 설정 입력, 꺼짐이면 `member_id_hint_search_off` |
| E5 | 오류 | 앱 링크 시작 주소를 처리 전에 「처리됨」 표시 | 실제로 처리할 때만 표시 |
| E6 | 오류 | 20271111160000 머리말의 `cm_accept_friend_request` 문구 | 문구 정정 |
| E7 | 오류 | 생성 컬럼과 `confirm_dibay_id` 허용 조건 불일치 (운영 해당 0명) | `confirm_dibay_id` 가 `dibay_id_can_change` 로 판정 |
| L1 | 누수 | QR API 가 차단·QR 꺼짐 이유를 코드로 노출 | 밖으로는 `qr_unusable` 하나 (본인 QR `qr_self` 만 따로) |
| L2 | 누수 | 웹 `/f` 이름 없으면 아이디 표시 | 아이디 대신 「DIBAY 회원」 |
| L3 | 누수(자원) | 카메라 영상 연결 미해제·영상 칸 없을 때 스트림 유지 | 끌 때 `srcObject = null`, 영상 칸 없으면 즉시 끔 |
| L4 | 누수 | 회원이 자기 행 기본 아이디를 REST 로 읽을 수 있음 (타인 행은 RLS 차단, 운영 확인) | **변경 안 함** — 본인 데이터·화면 비노출, 칼럼 권한 재구성 회귀 위험이 더 큼 |
| N1·N2 | 누락 | 친구가 된 경로 4종 중 QR 만 · 시안 F 「QR로 추가」 배지 | 친구 요청 호출처(아이디 검색·연락처·채팅방=profile)가 경로 전달, 친구 프로필이 경로 조회해 배지 |
| N3 | 누락 | 시안 A [프로필 공유]·아이디 [복사] | 추가 |
| N4 | 누락 | 시안 H 「내 QR 다시 만들기」 줄 | 추가 |
| N5 | 누락 | 공개 프로필 API 는 username 으로만 | `/u` 페이지·API 2개 공용 `findProfileByMemberId` (회원 아이디 먼저) |
| N6 | 누락 | 어드민 이력의 회원 본인 변경 「전」 값 | `confirm_dibay_id` 가 `member_dibay_id_change` 감사 기록 (앞으로의 변경부터) |
| N7 | 누락 | 하루 500회 검색 제한 | **FAIL 확인**: 운영 환경변수 51개 중 `UPSTASH_*`·`KV_*` 없음 → 요청 제한이 서버 인스턴스마다 따로 셈. 후속(아래) |
| D1 | 중복 | 자동 아이디 정규식 5곳 | DB `dibay_is_system_auto_id()` 하나를 assign·confirm·admin_set 이 사용, TS 목록은 계약 시험으로 대조 |
| D2 | 중복 | 상태·변경권 TS 대체 계산 | 운영 실제 사례 5종으로 DB 결과와 같은지 시험 |
| D3 | 중복 | 단일 계약 우회 화면 | 아이디 편집 분기·필수 정보 카드·내정보 홈 필수 행이 계약 사용 (친구 탭 내 프로필 줄은 서비스의 `resolvePublicIdAtDisplay` 를 그대로 받아 표시만 — 변경 없음) |
| D4 | 중복 | 확정 직후 화면이 상태 값을 직접 씀 | 쓰지 않고 서버 프로필 다시 받기(그동안 불러오는 중 화면) |
| D5 | 중복 | 쓰지 않는 옛 검색 함수·상수 | `resolveExactLookupPublicId`·`matchesPublicIdExactly`·`isPublicIdSearchEligible`·`buildProfileUserSearchOrFilter`·검색 숫자 상수 제거 |

감사 지적 중 제외: 「스캔 뒤 카메라 재시작 안 됨」 — 스캔 성공 시 친구 추가 시트가 닫혀 다시 열 때 새로 마운트됨(코드 확인), 실제 영향 없음.

DB: `supabase/migrations/20271111170000_member_id_v3_audit_fixes.sql` — 운영 적용은 Owner 승인. **웹 병합 전에 적용해야 한다** (웹이 `cm_send_friend_request` 에 `p_source` 를 넘긴다 — DB 적용 전이면 친구 요청 실패).

### 후속 (설계 완료 후 처리 목록)

| # | 내용 |
|---|---|
| F2 | 모임 초대 후보 검색(`app/api/community/meetings/[meetingId]/invite-candidates/route.ts:60`)이 `username` 을 직접 부분 검색 — 회원 아이디 규칙·검색 끔·탈퇴 제외를 거치지 않음 (범위 밖, 보고만) |
| F3 | 요청 제한 저장소 — 운영에 Redis(Upstash/KV) 환경변수 없음 → 앱 전체 요청 제한이 인스턴스별. 친구 검색 하루 500회 포함. Vercel·Redis 설정은 Owner 승인 사항 |
