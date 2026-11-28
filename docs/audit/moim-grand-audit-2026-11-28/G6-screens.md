# G6 — 화면 계약 조항별 감사 (시안 U1~U10 · 설계 §9 · UI 토큰 · 디자인 시스템 LOCKED · i18n · 6번 묶음 버튼 규칙)

- 코드 기준: `/Users/bkkim/projects/samarket-wt-moim-address` HEAD `04ee097fb` (clean). 읽기 전용. 앱 실행·사이트 열기·DB 조회·시험 실행 0회.
- 판정: PASS = 코드 증거 있음 · FAIL = 코드가 계약과 다름 · NOT_PROVEN = 화면 렌더링·서버 동작 등 이 감사에서 확인 못 함 · N/A = 뒤 승인 문서가 바꿈(근거 표기).
- 모든 PASS 는 **코드 PASS** 다. 화면(360·600~767 폭·다크 모드)·실기기 판정은 하지 않았다.
- Owner 고정 결정(이번 지시): 칩 = 4px(LOCKED), 배지·아바타 = pill(LOCKED).
- 「prior」 = `matrix/prior-reaudit.md` 의 같은 결함 ID. 없으면 NEW.
- 경로 접두: `c/` = `components/moim/`, `cm/` = `components/moim/manage/`, `cat/` = `lib/i18n/catalog/`.

## 덮어쓰는 승인 문서 (인용)

| 문서 | 바꾼 것 |
|---|---|
| `docs/design/moim/moim-category-dropdown-custom-topic-2026-11-12.md` (moim-ssot 계약 2번) | 만들기 5단계 → 4단계(카테고리를 1단계 드롭다운으로 합침). 코드 주석 `c/MoimCreateWizard.tsx:40` |
| `docs/design/community-header-4items-design-2026-11-12.md` §2-3 (Owner 「3판대로 구현」, 코드 주석 `c/MoimTabHome.tsx:25`) | `/moim` 머리글 = 허브 1단 「모임」+검색+알림, 카테고리 = 2단 밑줄 탭(본문 칩 대체), 3단 「정보교환·거래·모임」. **bundle 문서가 아님** — 승인 기록은 이 설계 문서·코드 주석뿐 |
| `docs/audit/moim-bundle4-design-2026-11-28.md` D2·D6 + 설계 §2 표 | 메신저 모임 방: 방 상단 = 머리글 「모임 홈」/「일정 보기」 버튼, 방 정보 = 「모임 홈으로 가기」만 |
| `docs/audit/moim-bundle6-design-2026-11-28.md` 버튼 체계·F4·F5·F7·F8·F9·F11·F12·D3·D5 | 버튼 역할 3종, 탭 순서, 막힌 버튼 → 안내 줄, ⋯→MoreVertical, 운영 6화면 하단 고정 줄, U4 ⌕·U5 ⤴⋮·U7 대화하기, 일정 ⤴ = 모임 초대 링크(Owner 「권장으로 진행」 2026-11-28), `_one` 키 |
| `docs/audit/moim-full-audit-2026-11-27.md:197` §3 권장안 (6번 묶음이 「§3 권장안 그대로」 채택) | 화면 메뉴 = 머리글 ⋮ 하나, 일반 → 신고 → 위험 순 |

---

## A. 시안 U1 · 모임 탭 홈 `/moim`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U1-hdr-title | 1단 제목 「동네생활」 | N/A | `lib/layout/resolve-main-tier1.ts:642-643` `tier1_moim`, `components/layout/RegionBarMainHubTier1.tsx:61,81` | 헤더 설계 §2-3 이 「모임」 허브 제목으로 바꿈 |
| U1-hdr-search | 머리글 ⌕ | PASS | `components/layout/RegionBarMainHubTier1.tsx:169` `data-moim-search-open` | 렌더링 NOT_PROVEN |
| U1-hdr-bell | 머리글 🔔 | NOT_PROVEN | `resolve-main-tier1.ts:643` `showHubQuickActions: true` | 알림 아이콘 그림 여부는 공용 허브 부품 — 미확인 |
| U1-tabs | 2단 「전체·질문·모임·동네소식·맛집」 커뮤니티 탭, 「모임」 선택 | N/A | `c/MoimTabHome.tsx:79-111` (2단 = 카테고리, 3단 = `CommunityTradeSwitchRow active="moim"`) | 헤더 설계 §2-3 |
| U1-mine-title | 「내 모임」 + 오른쪽 「전체 3」 | PASS | `c/MoimTabHome.tsx:126-129`, `cat/moim-screens.ts` `moim_home_mine_count` 「전체 {count}」 | 내 모임 0개면 섹션 없음 |
| U1-mine-items | 가로 스크롤 원형 썸네일 60px + 이름 | PASS | `c/MoimTabHome.tsx:130-134`, `c/MoimCard.tsx:37-39` `h-[60px] w-[60px] rounded-full` | 아바타형 = pill 허용 |
| U1-chips | 카테고리 칩 줄(전체·운동…), 선택 = 초록 채움 | N/A | `c/MoimTabHome.tsx:89-109` `DibaySecondaryTabRow` | 칩 → 2단 탭(헤더 설계 §2-3). 칩 반경 규칙 해당 없음 |
| U1-chips-scroll | 칩은 자르지 않고 가로로 넘김 (시안 주석) | PASS | `c/MoimTabHome.tsx:39` `useFitSectionTabPadding`, `DIBAY_SECONDARY_TAB_LABEL_CLASS` | 렌더링 NOT_PROVEN |
| U1-local-title | 「Taguig 모임」(도시명 + 모임) | FAIL | `c/MoimTabHome.tsx:141` `moim_home_local_title` = 「우리 동네 모임」 | prior P3-36 |
| U1-local-sort | 오른쪽 「최근 활동순」 | PASS | `c/MoimTabHome.tsx:142` `moim_home_sort_recent` | 정적 문구 |
| U1-card-thumb | 카드 썸네일 56px 4px | PASS | `c/MoimCard.tsx:16` `h-14 w-14 rounded-ui-rect` | |
| U1-card-title | 모임 이름 굵게 | PASS | `c/MoimCard.tsx:18` | |
| U1-card-badge-sched | 이름 옆 `b-info` 「일정 모집 중」 배지 | FAIL | `c/MoimCard.tsx:17-28` 해당 배지 없음 | prior P2-19 |
| U1-card-intro | 한 줄 소개 | PASS | `c/MoimCard.tsx:19` `line-clamp-1` | |
| U1-card-meta | 「카테고리 · 동네 · 멤버 N」 | PASS | `c/MoimCard.tsx:13,21` | `formatMoimCount` 정원 있으면 「멤버 n/cap」 |
| U1-card-approval | 메타 끝 「승인 가입」(글자) | PASS | `c/MoimCard.tsx:22-24` gray 배지 「승인 후 가입」 | 글자 → 회색 배지(의미 같음) |
| U1-fab | 「＋ 모임 만들기」 초록 떠 있는 버튼 | PASS | `c/MoimTabHome.tsx:151-158` `rounded-full bg-sam-primary` | FAB = pill 허용. 터치 높이는 G-tap-08 |
| U1-bnav | 하단 탭 「동네생활」 활성 | N/A | 공용 셸 | 헤더 설계 §2-3 「하단 탭 커뮤니티 활성」. 이 감사 범위 밖 |
| U1-note-D2 | 진입 위치 = 동네생활 상단 「모임」 탭 (D2) | N/A | `components/layout/CommunityTradeTitleSwitch.tsx:34-36` | 3단 전환 줄로 바뀜(헤더 설계 §2-3·결정 ③) |
| U1-note-D3 | 같은 도시(LGU) 모임만 노출 | NOT_PROVEN | `c/use-moim-local-list.ts` (서버 필터) | 서버 동작 — 이 감사 범위 밖 |
| U1-x-invites | (추가) 받은 초대 배너 | PASS | `c/MoimTabHome.tsx:117-122` | 시안에 없음 — 설계 P4. 복수형 문제는 G-i18n-pl-03 |

## B. 시안 U2 · 모임 만들기 `/moim/new`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U2-hdr | ← 「모임 만들기」 + 오른쪽 「3/5」 | PASS | `c/MoimCreateWizard.tsx:72` `moim_create_title` 「모임 만들기 {step}/{total}」 | 단계 수 표시는 제목에 합침. 뒤로 가기 렌더링 NOT_PROVEN |
| U2-steps-count | 5단계 | N/A | `c/MoimCreateWizard.tsx:21` `STEPS = 4` | 카테고리 드롭다운 문서가 4단계로 |
| U2-steps-bar | 단계 막대(진행 = 초록) | PASS | `c/MoimCreateWizard.tsx:161-165` | |
| U2-area | 「활동 동네」 + 도시 + 안내 「기본 주소의 도시로…」 | PASS | `c/MoimCreateWizard.tsx:261-269`, `moim_create_area_hint` | 입력칸 모양 → 굵은 글자 |
| U2-capacity | 「정원」 입력 + 「최대 인원은 운영 정책에 따라요.」 | PASS | `c/MoimCreateWizard.tsx:270-282`, `moim_create_capacity_hint` | |
| U2-joinmode | 세그먼트 「바로 가입 / 승인 후 가입」, 선택 = 연한 초록 | PASS | `c/MoimCreateWizard.tsx:283-299` | 터치 높이 G-tap-10 |
| U2-questions-label | 「가입 질문 (선택, 최대 3개)」 | PASS | `c/MoimCreateWizard.tsx:302`, `moim_create_questions_label` | |
| U2-question-input | 질문 입력칸 | PASS | `c/MoimCreateWizard.tsx:303-320` | ✕ 36px → G-tap-05 |
| U2-question-add | 「＋ 질문 추가」 | PASS | `c/MoimCreateWizard.tsx:321-325` | btnSm 40px → G-tap-01 |
| U2-warnbox | 노란 안내 「실명·전화번호·신분증…」 | PASS | `c/MoimCreateWizard.tsx:326` `noticeWarn` | |
| U2-cta | 하단 「이전」(보조)·「다음」(기본) | PASS | `c/MoimCreateWizard.tsx:392-403` `MoimStickyFooter` | 기본 1개 |
| U2-note-steps | ①~⑤ 단계 구성 | N/A | `c/MoimCreateWizard.tsx:190-387` | 4단계(카테고리 문서) |
| U2-note-banned | 질문 저장 때 금지어 검사 | NOT_PROVEN | 서버 `moim__question_banned_words` (prior §4 B7 확인) | UI 감사 범위 밖 |
| U2-x-agree | (추가) 운영 규칙 동의 체크 | PASS | `c/MoimCreateWizard.tsx:382-385` | 터치 G-tap-11 |

## C. 시안 U3 · 공개 페이지 + 가입 신청 시트 `/moim/[id]`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U3-hdr-back | ← | PASS | `c/MoimDetailScreen.tsx:137` `backHref: moimRoutes.tab` | |
| U3-hdr-title | 제목 비움 | FAIL | `c/MoimDetailScreen.tsx:137` `titleText: moim?.name` | NEW (P3). 공개 페이지도 머리글에 이름 |
| U3-hdr-share | ⤴ | N/A | `c/use-moim-invite-share.ts:21` 활성 멤버 + `manage_invite_link` 만 | 공유 계약(Owner 11-14 §N-3)·6번 F11-2 결정 「초대 링크 유지」 — 비멤버에게 없음 |
| U3-hdr-menu | ⋮ | PASS | `c/MoimDetailScreen.tsx:129-131` | 로그아웃이면 빈 시트(prior P3-33) |
| U3-cover | 표지 140px | PASS | `c/MoimPublicView.tsx:25` `h-[140px]` | |
| U3-cover-tag | 표지 위 흰 글자 「운동 · Taguig」 | FAIL | `c/MoimPublicView.tsx:22,27` 표지 아래 회색 글자 | NEW (P3) |
| U3-name | 이름 18px 굵게 | PASS | `c/MoimPublicView.tsx:28` | |
| U3-stat | 「멤버 18/30 · 승인 후 가입 · 최근 활동 오늘」 | PASS | `c/MoimPublicView.tsx:29-33` | |
| U3-intro | 소개 | PASS | `c/MoimPublicView.tsx:34` | |
| U3-sched-title | 「다가오는 일정」 | PASS | `c/MoimPublicView.tsx:160-164` | |
| U3-sched-date | 날짜 칸: 테두리 흰 칸, 위 작은 빨간 「11/15」, 아래 굵은 요일 | FAIL | `c/moim-schedule-ui.tsx:84-96` 연초록 채움, 날짜 굵게·요일 작게 | NEW (P3). U4 날짜 칸도 같은 부품 |
| U3-sched-line | 「오후 6:00 · BGC 체육관 · 6/8명」 | FAIL | `c/MoimPublicView.tsx:171-173` 시각 · 인원만, **장소 없음** | NEW (P3) |
| U3-sheet-title | 시트 제목 「가입 신청」 | PASS | `c/MoimPublicView.tsx:208` `moim_join_request_title` | |
| U3-sheet-question | 질문 라벨 + 답 입력 | PASS | `c/MoimJoinSheet.tsx:75-85` | |
| U3-sheet-profile-label | 「이 모임에서 쓸 프로필」 | PASS | `c/MoimJoinSheet.tsx:87` | |
| U3-sheet-profile-card | 카드(아바타 「민」 + 닉네임 + 「DIBAY 닉네임 · 모임마다 바꿀 수 있어요」 + 「수정」) | FAIL | `c/MoimJoinSheet.tsx:86-103` 닉네임·소개 입력칸 + 안내 | NEW (P3). 카드+수정 → 바로 입력 |
| U3-sheet-privacy | 「전화번호·DIBAY ID 는 다른 멤버에게 보이지 않아요.」 | PASS | `c/MoimJoinSheet.tsx:104` `moim_profile_privacy_short` | |
| U3-sheet-cta | 「신청하기」 기본 버튼 | PASS | `c/MoimJoinSheet.tsx:66-72` 「가입 신청하기」 | 시트 안 반경 G-rad-04 |
| U3-note-members | 비멤버는 멤버 목록·멤버 전용 글 못 봄 | PASS | `c/MoimPublicView.tsx:196` 안내 문구, 멤버 탭 없음 | 서버 필터는 NOT_PROVEN |
| U3-note-banned | 차단된 사람: 「가입할 수 없는 모임입니다」만, 사유 없음 | PASS | `c/MoimPublicView.tsx:112-117` | |
| U3-x-full | (추가) 정원 마감 = 안내 줄 | PASS | `c/MoimPublicView.tsx:127-132` | 6번 F7 |
| U3-x-pending | (추가) 신청 중 → 「신청 취소」 보조 | PASS | `c/MoimPublicView.tsx:118-126` | 6번 위험 목록에 「신청 취소」 없음. 단 `c/moim-ui.tsx:23` 주석은 「취소」 전부를 위험으로 적음 — 문서·주석 불일치 |
| U3-x-joinpath | 설계 §9 「가입 신청 `/moim/[id]/join`」 | N/A (충돌) | 라우트 없음, `c/MoimJoinSheet.tsx` 시트 | 시안 U3 = 시트, §9 = 「경로(안)」. 같은 날 두 계약이 다름 — Owner 확인 대상(보고만) |

## D. 시안 U4 · 모임 홈(멤버) `/moim/[id]`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U4-hdr-back | ← | PASS | `c/MoimDetailScreen.tsx:137` | |
| U4-hdr-title | 「BGC 배드민턴」 | PASS | `c/MoimDetailScreen.tsx:137` | |
| U4-hdr-search | ⌕ 모임 안 검색 | PASS | `c/MoimDetailScreen.tsx:119-128` → `/moim/{id}/search` | 6번 F11-1 |
| U4-hdr-menu | ≡ 메뉴 | N/A | `c/MoimDetailScreen.tsx:129-131` `MoreVertical` | 감사 §3(6번 채택) 「화면 메뉴 = ⋮」 |
| U4-hdr-share | (추가) ⤴ | PASS | `c/MoimDetailScreen.tsx:111-117` 초대 링크 권한자만 | 공유 계약 §N-3 |
| U4-tabs | 「홈·게시판·일정·앨범·멤버 18」, 넘치면 가로 스와이프 | PASS | `c/MoimMemberView.tsx:37,81-104` | 6번 F5. 렌더링 NOT_PROVEN |
| U4-x-head | (시안에 없음) 표지·머리 블록 | FAIL | `c/MoimMemberView.tsx:191` `MoimHeadBlock` | prior P3-36 |
| U4-notice-card | 공지 카드: `b-warn` 「공지」 배지 + 제목 한 줄 | FAIL | `c/MoimPostRow.tsx:19` 고정 글 배지 `badgeGreen` 「공지」; `c/MoimMemberView.tsx:196-210` 「공지」 섹션 제목 추가 | NEW — 배지 색 warn → green |
| U4-sched-head | 「다가오는 일정」 + 오른쪽 「달력」 | FAIL | `c/MoimMemberView.tsx:151-156` 「전체 보기」 | prior P3-36 |
| U4-sched-card1 | 날짜 칸 · 제목 · 「오후 6:00 · BGC 체육관」 · 오른쪽 `b-ok` 「참여 확정」 | FAIL | `c/moim-schedule-ui.tsx:78` 확정 배지 `badgeGreen`; `:113` 상태 배지도 같이 나옴 | prior P3-31 |
| U4-sched-card2 | 「3/6명」 + `b-gray` 「모집 중」 | FAIL | `c/moim-schedule-ui.tsx:63` `recruiting: badgeGreen` | prior P3-31. 시작 뒤에도 「모집 중」(prior P2-10) |
| U4-recent-head | 「최근 글」 + 오른쪽 「게시판」 | FAIL | `c/MoimMemberView.tsx:213-218` 「전체 보기」 | prior P3-36 |
| U4-recent-row | 「게시판 · 글쓴이 · 시간」 + 제목 | PASS | `c/MoimPostRow.tsx:18-23` | |
| U4-fab-chat | 「💬 모임 채팅」 떠 있는 버튼 | PASS | `c/MoimMemberView.tsx:120-128` | 터치 G-tap-08 |
| U4-menu-items | ≡: 초대 · 내 모임 프로필 · 모임 알림 설정 · 신고 · 모임 나가기 | PASS | `c/MoimDetailScreen.tsx:179-201` | 초대 = 친구 초대 화면(U6 참조). 모임장은 나가기 대신 위임·종료(6번 D5) |
| U4-menu-manage | 운영진에게 「운영 관리」 | PASS | `c/MoimDetailScreen.tsx:105,186` | |
| U4-menu-order | 일반 → 신고 → 위험 | PASS | `c/MoimDetailScreen.tsx:179-201` | |
| U4-warn-banner | 경고 상태면 운영진에게만 상단 경고 | PASS | `c/MoimMemberView.tsx:193-195` | |
| U4-x-tab-primary | (6번 F4) 일정 만들기·글쓰기 = 기본 | PASS | `c/MoimMemberView.tsx:248,328` | btnSm 40px → G-tap-01 |
| U4-x-members-tab | 멤버 탭 사람 시트 | FAIL | `c/MoimMemberView.tsx:412-429` 「신고」만, 위험 색 | prior P2-12(대화하기 없음)·P3-30(신고 빨강) |
| U4-x-rolebadge | 멤버 탭 역할 배지 | FAIL | `c/moim-ui.tsx:84-88` 모든 역할 green | prior P2-17 (U7 은 모임장 green·운영진 info) |

## E. 시안 U5 · 일정 상세 `/moim/[id]/schedules/[sid]`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U5-hdr-title | ← 「일정」 | PASS | `c/MoimScheduleDetailScreen.tsx:133` | |
| U5-hdr-share | ⤴ | N/A | `c/MoimScheduleDetailScreen.tsx:421-433` 초대 링크 권한자만 | 6번 F11-2 결정(Owner 「권장으로 진행」) |
| U5-hdr-menu | ⋮ (신청자 화면에도 보임) | FAIL | `c/MoimScheduleDetailScreen.tsx:392-394,433-442` 관리 권한자만 | prior P2-19·P2-9 (일반 멤버 ⋮·신고 없음) |
| U5-badge-status | `b-gray` 「모집 중」 | FAIL | `c/moim-schedule-ui.tsx:63` green | prior P3-31 |
| U5-badge-mode | `b-info` 「신청 후 승인」 | FAIL | `c/MoimScheduleDetailScreen.tsx:458-460` `badgeGray` | NEW (moimCls 에 info 배지 없음) |
| U5-title | 「수요 레슨」 18px | PASS | `c/MoimScheduleDetailScreen.tsx:463` | |
| U5-kv | 일시 · 장소 · 인원 · 호스트 | PASS | `c/MoimScheduleDetailScreen.tsx:464-478` | |
| U5-host | 「준호 (운영진)」 | PASS | `c/MoimScheduleDetailScreen.tsx:471-477` 닉네임 + 역할 배지 | |
| U5-desc | 설명 | PASS | `c/MoimScheduleDetailScreen.tsx:479` | |
| U5-confirmed | 「참여 확정 3」 + 아바타 줄 | PASS | `c/MoimScheduleDetailScreen.tsx:541-553` | |
| U5-motivation | 본문에 「지원 동기 (8자 이상)」 입력칸 | FAIL | `c/MoimScheduleDetailScreen.tsx:66-120,242-246` 버튼을 누르면 시트로 | NEW (P3) |
| U5-infobox | 초록 안내 상자 「참여가 확정되면 일정 채팅방에 자동으로 들어가요.」 | FAIL | `c/MoimScheduleDetailScreen.tsx:372` 회색 작은 글자(`text-sam-muted`) | NEW (P3) — 문구는 같음 |
| U5-cta | 하단 「참여 신청」 기본 | PASS | `c/MoimScheduleDetailScreen.tsx:373-375,615-617` `MoimStickyFooter` | |
| U5-note-firstcome | 선착순이면 [참여하기] | PASS | `c/MoimScheduleDetailScreen.tsx:374` `moim_schedule_join_btn` | |
| U5-note-requests | 호스트에게 [신청 현황 2] | PASS | `c/MoimScheduleDetailScreen.tsx:511-539` 「신청 현황 {count}」 섹션 + 승인·거절 | 버튼 → 섹션 |
| U5-note-result | 승인·거절 결과는 신청자에게 알림 | PASS | `cat/moim-core.ts:199-202` `notify_moim_schedule_decided_ok/no` | 발송 동작 NOT_PROVEN |
| U5-note-remind | 시작 24시간·1시간 전 리마인드 | PASS | `cat/moim-core.ts:203-206` | 크론 동작 NOT_PROVEN (prior P2-13) |
| U5-x-reject | (6번) 신청 거절 = 위험 | FAIL | `c/MoimScheduleDetailScreen.tsx:528` `btnSecondary` | prior W4/P2-20 |
| U5-x-remove | (6번) 참여자 내보내기 = 위험 | FAIL | `c/MoimScheduleDetailScreen.tsx:588` `btnSecondary` | prior W4/P2-20 |
| U5-x-cancel | (6번 F6) 일정 취소 = 위험 | PASS | `c/MoimScheduleDetailScreen.tsx:331`, `:412-414` danger | |
| U5-x-attendance | 출석 토글 | FAIL | `c/MoimScheduleDetailScreen.tsx:573` `px-2.5 py-1` | prior P2-18 |

## F. 시안 U6 · 초대 (모임 홈 ≡ → 초대)

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U6-form | 모임 홈 위 바텀시트 「모임 초대하기」 | FAIL | `c/MoimDetailScreen.tsx:179-181` → `cm/MoimManageInvite.tsx` 별도 화면 「초대」 | NEW (P3) — 시트 → 화면, 제목 다름 |
| U6-qr | QR 코드 | FAIL | `cm/MoimManageInvite.tsx` QR 없음 | prior P2-19 |
| U6-url | 링크 주소 표시 | PASS | `cm/MoimManageInvite.tsx:144` | |
| U6-copy | ⧉ 링크 복사 | PASS | `cm/MoimManageInvite.tsx:156-158` | 아이콘 없음, btnSm 40px |
| U6-share | ⤴ 다른 앱으로 공유 | PASS | `cm/MoimManageInvite.tsx:159-163` (기기 공유 가능할 때) · 머리글 ⤴ `c/MoimDetailScreen.tsx:111` | |
| U6-friend | ☺ 친구에게 초대 보내기 | PASS | `cm/MoimManageInvite.tsx:207-308` | |
| U6-hint | 「링크로 들어와도 승인 후 가입 방식은 그대로예요. 운영진이 직접 보낸 초대는 승인 없이 가입돼요.」 | PASS | `cm/MoimManageInvite.tsx:132,251`, `cat/moim-manage.ts:151,167` | 두 줄로 나눔 |
| U6-note-expiry | 만료일·링크 끄기 = 운영진 권한 | PASS | `cm/MoimManageInvite.tsx:110-123,166`, `:314` `can.manage_invite_link` | 링크 만들기 보조(6번 L6) |
| U6-note-interval | 재초대 간격 D6 | NOT_PROVEN | 서버 정책 | UI 감사 범위 밖 |
| U6-note-banned | 차단된 모임은 초대 불가 | NOT_PROVEN | 서버(2번 B4) | UI 감사 범위 밖 |
| U6-x-chips | 만료 칩 4px | PASS | `cm/MoimManageInvite.tsx:117` `rounded-ui-rect` | 터치 G-tap-02 |

## G. 시안 U7 · 운영 · 멤버 관리 `/moim/[id]/manage/members`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U7-hdr | ← 「멤버 관리」 | PASS | `cm/MoimManageMembers.tsx:425`, `cat` 「멤버 관리」 | |
| U7-tab-members | 「멤버 18」 | PASS | `cm/MoimManageMembers.tsx:179-181` | 수는 목록 길이(prior P3-37) |
| U7-tab-requests | 「가입 신청 2」 | FAIL | `cm/MoimManageMembers.tsx:178-187` 없음 | prior P2-19 |
| U7-tab-banned | 「차단 1」(수) | FAIL | `cm/MoimManageMembers.tsx:184` 수 없음 | prior P2-19 |
| U7-tab-memo | 「메모」 | FAIL | 없음 | prior P2-19 |
| U7-row-host | 이름 + `b-green` 「모임장」 + 「2026-09-02 가입」 | PASS | `cm/moim-manage-shared.tsx:178` `Sam.badge.primary`, `cm/MoimManageMembers.tsx:211-212` | 배지 반경 G-rad-02 |
| U7-row-staff | `b-info` 「운영진」(파랑) | FAIL | `cm/moim-manage-shared.tsx:180` `Sam.badge.info` → `app/design-tokens.css:153-154` `--sam-info: var(--sam-primary)` | NEW — 클래스는 info 지만 토큰이 초록이라 모임장과 같은 색. LOCKED 색 토큰과 시안 충돌(보고) |
| U7-row-member | 배지 없음 | PASS | `cm/moim-manage-shared.tsx:181` | |
| U7-row-rejoin | `b-gray` 「재가입 1」 | PASS | `cm/MoimManageMembers.tsx:207-209` `Sam.badge.neutral` | 반경 G-rad-02 |
| U7-row-memo | 「· 메모 있음」 | PASS | `cm/MoimManageMembers.tsx:213` | |
| U7-sheet-title | 시트 제목 = 이름 | PASS | `cm/MoimManageMembers.tsx:267` | |
| U7-sheet-01 | ★ 역할 변경 (부모임장 · 운영진 · 멤버) | PASS | `cm/MoimManageMembers.tsx:106-114,272-304` | 괄호 설명은 역할 시트에서 고름 |
| U7-sheet-02 | ✎ 운영진 메모 | PASS | `cm/MoimManageMembers.tsx:115-123` | |
| U7-sheet-03 | ✉ 대화하기 | PASS | `cm/MoimManageMembers.tsx:103,124` | 6번 F11-3 |
| U7-sheet-04 | ⇥ 내보내기(빨강) + 「재가입 가능」 | PASS | `cm/MoimManageMembers.tsx:125-136` | |
| U7-sheet-05 | ⊘ 차단(빨강) + 「재가입·초대 불가」 | PASS | `cm/MoimManageMembers.tsx:137-151` | |
| U7-sheet-icons | 각 줄 앞 아이콘 ★✎✉⇥⊘ | FAIL | `cm/MoimManageMembers.tsx:103-151` 항목에 아이콘 없음 | NEW (P3) |
| U7-note-perm | 역할 변경 = 모임장만, 내보내기·차단 = 모임장·부모임장만 | PASS | `cm/MoimManageMembers.tsx:106,125,137` `can.*` | 서버 기본값은 2번 B6 (prior §4) |
| U7-note-private | 메모·재가입 수는 운영진에게만 | PASS | 멤버 탭 `c/MoimMemberView.tsx:388-411` 에 없음 | |
| U7-x-unban | 차단 해제 보조 | PASS | `cm/MoimManageMembers.tsx:256` | 되돌리기라 위험 아님 |

## H. 시안 U8 · 메신저 모임 방 `/community-messenger`

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U8-hdr | 「채팅」 ⌕ ＋ | N/A | 메신저 도메인 | 모임 계약 밖 |
| U8-tabs | 「전체·친구·그룹·모임·오픈채팅·거래」 — 모임 탭은 D1 과 함께 승인 필요 | NOT_PROVEN | 메신저 목록에 모임 필터 없음(`components/community-messenger` 에 `"moim"` 필터 검색 0) | 승인 여부 기록 못 찾음(설계 §11 D1 문구에 탭 없음) |
| U8-row-moim-badge | 모임 방 `b-green` 「모임」 배지 | FAIL | `components/community-messenger/MessengerChatListItem.tsx:1151-1152` `rounded-ui-rect` | prior W3 — 색은 primary-soft(PASS), 반경 4px = 배지 pill 규칙 위반 |
| U8-row-sched-badge | 일정 방 `b-info` 「일정」 배지 | FAIL | 같은 줄 `:1152` 모임·일정 같은 색 | prior P3-31 |
| U8-row-sched-sub | 「BGC 배드민턴 · 11/15 오후 6시」 | NOT_PROVEN | 메신저 목록 부제 | |
| U8-row-group | 「가족방」 `b-gray` 「그룹」 | N/A | `MessengerChatListItem.tsx:1143` 「그룹 배지는 목록에서 뺌(시안 3판)」 | 메신저 시안 |
| U8-roomtop | 방 상단 초록 띠 「BGC 배드민턴 · 멤버 18 / 모임 홈 ›」 | PASS | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx:516-526` 머리글 「모임 홈」/「일정 보기」 버튼 | 설계 §2 표 「방 상단 버튼」·4번 D2. 띠 모양·멤버 수 표시는 NOT_PROVEN |
| U8-roomtop-btn | 「모임 홈」 버튼 모양 | FAIL | 같은 파일 `:521` `rounded-full … px-2.5 py-1` | prior P2-18(터치) + NEW(버튼 pill — LOCKED 버튼 4px) |
| U8-who | 「준호 · 운영진」 모임 프로필 이름 | NOT_PROVEN | 메신저 말풍선 이름 | |
| U8-note-settings | 방 설정 = 알림 끄기만(나가기·초대·내보내기 없음) | PASS | `CommunityMessengerRoomPhase2RoomSheets.tsx:1250-1255`, `:724-733`; `MessengerChatRoomActionSheet.tsx:179-180` | 4번 D6·D7 |

## I. 시안 U9 · 알림 목록

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U9-hdr | ← 「알림」 | N/A | 알림 도메인 | |
| U9-tabs | 「전체·거래·커뮤니티·주문·운영」, 모임 알림 = 커뮤니티 | NOT_PROVEN | `lib/moim/server/moim-notify.server.ts:93` `push_kind: "community"` | 탭 분류는 알림 도메인 |
| U9-01 | 「BGC 배드민턴 가입 신청이 승인됐어요. 가입 인사를 남겨 보세요.」 | PASS | `cat/moim-core.ts:176` | |
| U9-02 | 「토요일 정기 게임 **내일 오후 6시에** 시작해요.」 | FAIL | `cat/moim-core.ts:203-204` 「{title} 일정이 곧 시작해요」 시각 없음 | NEW (P3) |
| U9-03a | 「운영진 소희님이 모임에 초대했어요」(보낸 사람 역할) | FAIL | `cat/moim-core.ts:182` 「{name}님이 {moim}에 초대했어요」 | NEW (P3) |
| U9-03b | 알림 줄 안 「수락 · 거절」 | FAIL | `lib/moim/server/moim-notify.server.ts:150` 링크 = `/moim/invites`, 줄 안 동작 없음 | NEW (P3) |
| U9-04 | 「BGC 배드민턴 새 공지: 11월 회비 안내」 | PASS | `cat/moim-core.ts:189-190` | |
| U9-05 | 「신고하신 내용을 검토해 조치했어요.」 | PASS | `cat/moim-core.ts:166-167` | |
| U9-unread | 안 읽은 줄 강조 | N/A | 알림 도메인 | |
| U9-note-results | 결과 알림은 끌 수 없음 | PASS | `lib/moim/server/moim-notify.server.ts:130-142` 공지·새 글·일정만 거름; `c/MoimNotificationSettingsScreen.tsx:115` | |
| U9-note-posts | 새 글 기본 꺼짐 | PASS | `lib/moim/server/moim-notify.server.ts:140` `posts: false` | |

## J. 시안 U10 · 내 모임 프로필 · 모임 알림

| ID | 요구 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| U10-form | 프로필 + 알림을 한 화면 | N/A | `/moim/[id]/profile`·`/settings/notifications` 두 화면 | 설계 §9 가 두 경로로 나눔 |
| U10-hdr-title | 「이 모임에서의 나」 | PASS | `c/MoimProfileScreen.tsx:26`, `moim_profile_title` | |
| U10-hdr-save | 머리글 오른쪽 초록 「저장」 | FAIL | `c/MoimProfileScreen.tsx:107-113` 하단 고정 줄 | prior P3-36 |
| U10-avatar | 가운데 72px 아바타 + 아래 「사진 바꾸기」 | FAIL | `c/MoimProfileScreen.tsx:82-95` 64px 왼쪽 + 옆 보조 버튼 | NEW (P3) |
| U10-nick | 「닉네임」 입력 | PASS | `c/MoimProfileScreen.tsx:96-99` `maxLength={40}` | |
| U10-bio | 「소개」 입력 | PASS | `c/MoimProfileScreen.tsx:100-103` | maxLength 없음(prior P3-38) |
| U10-infobox | 「다른 멤버에게는 이 프로필만 보여요…바꾼 기록도…」 | PASS | `c/MoimProfileScreen.tsx:104`, `moim_profile_privacy_note` 문구 같음 | |
| U10-ntf-rows | 공지 · 새 글 · 새 일정·리마인드 · 모임 채팅 | PASS | `c/MoimNotificationSettingsScreen.tsx:16-20,105-113` | 채팅 = 방 무음으로 연결(설계 §7) |
| U10-ntf-state | 켜짐 `b-ok` / 꺼짐 `b-gray` 배지 | FAIL | `c/MoimNotificationSettingsScreen.tsx:102` `MoimSwitch` | NEW (P3) — 정적 시안의 상태 배지를 스위치로 구현. Owner 확인 대상 |
| U10-note-identity | 개설·가입에 전화 인증, 표시는 모임 프로필 | NOT_PROVEN | 서버 | UI 감사 범위 밖 |

---

## K. 설계 §9 화면 목록

| ID | 화면 · 경로 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| S9-01 | 모임 탭 홈 `/moim` | PASS | `app/(main)/moim/page.tsx` | |
| S9-02 | 모임 찾기·검색 `/moim/search` | PASS | `app/(main)/moim/search/page.tsx` | |
| S9-03 | 모임 만들기(5단계) `/moim/new` | PASS | `app/(main)/moim/new/page.tsx` | 4단계(카테고리 문서) |
| S9-04 | 공개 페이지·모임 홈 `/moim/[id]` (탭 홈·게시판·일정·앨범·멤버) | PASS | `app/(main)/moim/[moimId]/page.tsx`, `c/MoimMemberView.tsx:37` | |
| S9-05 | 글 `/moim/[id]/posts/[postId]` | PASS | `app/(main)/moim/[moimId]/posts/[postId]/page.tsx` | |
| S9-06 | 글쓰기 `/moim/[id]/write` | PASS | `app/(main)/moim/[moimId]/write/page.tsx` | |
| S9-07 | 일정 상세 `/moim/[id]/schedules/[sid]` | PASS | `app/(main)/moim/[moimId]/schedules/[scheduleId]/page.tsx` | |
| S9-08 | 일정 만들기 `/moim/[id]/schedules/new` | PASS | `app/(main)/moim/[moimId]/schedules/new/page.tsx` | 수정 `…/edit` 추가 |
| S9-09 | 가입 신청 `/moim/[id]/join` | N/A (충돌) | 라우트 없음, 시트 `c/MoimJoinSheet.tsx` | U3-x-joinpath 참조 |
| S9-10 | 내 모임 프로필 `/moim/[id]/profile` | PASS | `app/(main)/moim/[moimId]/profile/page.tsx` | |
| S9-11 | 운영: 가입신청 | PASS | `app/(main)/moim/[moimId]/manage/requests/page.tsx` | |
| S9-12 | 운영: 멤버관리 | PASS | `…/manage/members/page.tsx` | |
| S9-13 | 운영: 권한 | PASS | `…/manage/permissions/page.tsx` | |
| S9-14 | 운영: 설정 | PASS | `…/manage/info/page.tsx`, `…/manage/boards/page.tsx` | |
| S9-15 | 운영: 위임 | PASS | `…/manage/transfer/page.tsx` (+ `host-request`) | |
| S9-16 | 운영: 종료 | PASS | `…/manage/close/page.tsx` | |
| S9-17 | 초대 링크 착지 `/moim/i/[token]` | PASS | `app/(main)/moim/i/[token]/page.tsx` | |
| S9-18 | 모임 알림 설정 `/moim/[id]/settings/notifications` | PASS | `app/(main)/moim/[moimId]/settings/notifications/page.tsx` | |
| S9-19 | (목록 밖) `/moim/invites`, `/moim/[id]/search`, `manage/invite`·`reports`·`host-request`, `schedules/[id]/edit` | PASS | 각 `page.tsx` | `[id]/search` = 6번 F11-1 승인. 나머지는 설계 P4·P8·P13 화면 |
| S9-20 | 페이지는 `app/(main)/moim/**` | PASS | 위 25개 `page.tsx` 모두 `app/(main)/moim/` | |
| S9-21 | 문구 `t("key")`, ko·en 함께 | PASS | 모임 화면 파일 한국어 문자열 0건(주석 제외 검색); 카탈로그 ko/en 키 수 196/196·201/201·330/330 | `check:i18n-quality` 실행은 NOT_PROVEN |
| S9-22 | 카드·버튼 4px, 시트는 오버레이 반경 | FAIL | G-rad-04 | 시트 안 요소 |
| S9-23 | 2단 탭 이름 안 자르고 가로 스와이프 | PASS | `c/MoimMemberView.tsx:91-104` `whitespace-nowrap` + `DibaySecondaryTabRow`; `cm/MoimManageMembers.tsx:178` `barScroll` | 렌더링 NOT_PROVEN |

---

## L. 전역 규칙 sweep

### L-1 화면별 기본(초록) 버튼 수 (6번 「기본 = 화면 핵심 동작 1개」)

| ID | 화면 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-pri-01 | 만들기 | PASS (1) | `c/MoimCreateWizard.tsx:399` | |
| G-pri-02 | 공개 페이지 | PASS (1) | `c/MoimPublicView.tsx:108` 또는 `:135` | 시트 안 1개 |
| G-pri-03 | 모임 홈(멤버) 탭별 | PASS (탭당 1) | `c/MoimMemberView.tsx:248,328` | FAB 는 FAB |
| G-pri-04 | 모임 홈 + 위임 요청 배너 | FAIL (2) | `c/MoimDetailScreen.tsx:80` + `c/MoimMemberView.tsx:248/328` | NEW — 배너가 뜬 상태에서 일정·게시판 탭 |
| G-pri-05 | 일정 상세(호스트, 신청자 N명) | FAIL (N) | `c/MoimScheduleDetailScreen.tsx:531` 신청자마다 「승인」 기본 | NEW |
| G-pri-06 | 운영 가입 신청 | FAIL (N) | `cm/MoimManageRequests.tsx:99` 신청마다 「승인」 기본 | NEW |
| G-pri-07 | 받은 초대함 | FAIL (N) | `c/MoimInvitesScreen.tsx:88` 초대마다 「수락」 기본 | NEW |
| G-pri-08 | 글 상세 | PASS (1) | `c/MoimPostDetailScreen.tsx:232` | |
| G-pri-09 | 프로필·글쓰기·일정 폼·정보·권한·초대·위임·변경 요청 | PASS (각 1) | `c/MoimProfileScreen.tsx:109`, `c/MoimWriteScreen.tsx:214`, `c/MoimScheduleFormScreen.tsx:368`, `cm/MoimManageInfo.tsx:300`, `cm/MoimManagePermissions.tsx:107`, `cm/MoimManageInvite.tsx:299`, `cm/MoimManageTransfer.tsx:99`, `cm/MoimManageHostRequest.tsx:128` | |
| G-pri-10 | 종료 | PASS (위험 1) | `cm/MoimManageClose.tsx:72` | |

### L-2 위험 동작이 btnDanger 가 아님

| ID | 동작 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-dng-01 | 모임장 위임 요청 거절 | FAIL | `c/MoimDetailScreen.tsx:77` `btnSecondary` | prior W4 |
| G-dng-02 | 일정 신청 거절 | FAIL | `c/MoimScheduleDetailScreen.tsx:528` | prior W4 |
| G-dng-03 | 일정 참여자 내보내기 | FAIL | `c/MoimScheduleDetailScreen.tsx:588` | prior W4 |
| G-dng-04 | 받은 초대 거절 | FAIL | `c/MoimInvitesScreen.tsx:85` | prior W4 |
| G-dng-05 | 운영 화면 거절·숨기기·링크 끄기·게시판 끄기·종료 | PASS | `cm/MoimManageRequests.tsx:88`, `cm/MoimManageReports.tsx:125`, `cm/MoimManageInvite.tsx:166`, `cm/MoimManageBoards.tsx:115`, `cm/MoimManageClose.tsx:72` | 6번 F1·F3 |
| G-dng-06 | 앨범 삭제 | PASS | `c/MoimAlbum.tsx:267` | 6번 F2 |
| G-dng-07 | 메뉴 위험 줄(나가기·종료·삭제·숨기기·일정 취소·내보내기·차단) | PASS | `c/MoimDetailScreen.tsx:197,200`, `c/MoimPostDetailScreen.tsx:159,161,172`, `c/MoimScheduleDetailScreen.tsx:413`, `cm/MoimManageMembers.tsx:128,140` | |
| G-dng-08 | 신고를 위험 색으로(일반 → 신고 → 위험) | FAIL | `c/MoimMemberView.tsx:423` `danger: true` | prior P3-30 |
| G-dng-09 | 「신청 취소」「참여 취소」 | PASS | `c/MoimPublicView.tsx:122`, `c/MoimScheduleDetailScreen.tsx:336,344` 보조 | 6번 목록에 없음. `c/moim-ui.tsx:23` 주석(「취소」 전부 위험)과 불일치 — 문서 정정 필요 |

### L-3 막힌 버튼을 상태 표시로 사용 (6번 「안내 줄, 비활성 버튼 아님」)

| ID | 화면 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-dis-01 | 공개 페이지 정원 마감·가입 불가 | PASS | `c/MoimPublicView.tsx:112-132` 안내 줄 | 6번 F7 |
| G-dis-02 | 일정 마감·정원·시작 | PASS | `c/MoimScheduleDetailScreen.tsx:351-367` 안내 줄 | 6번 F7 |
| G-dis-03 | 위임 화면 경고 상태·권한 없음 | FAIL | `cm/MoimManageTransfer.tsx:98` `disabled={warned … \|\| !detail.can.transfer_host}` 기본 버튼이 계속 막힌 채 보임 | NEW (P3) — 안내 줄도 있음(`:52`) |
| G-dis-04 | 모임장 변경 요청 보낸 뒤 | FAIL | `cm/MoimManageHostRequest.tsx:127` `disabled={… \|\| sent}` | NEW (P3) — 안내 줄도 있음(`:73`) |
| G-dis-05 | 스위치 비활성 표시 | FAIL | `c/MoimScheduleFormScreen.tsx:398` `disabled:opacity-50` | prior P3-38 (`disabledToken` 아님) |

### L-4 터치 영역 44px 미만 (`--sam-tap-min`)

| ID | 대상 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-tap-01 | `moimCls.btnSm` = `.sam-btn--sm` 최소 높이 40px — 모임 화면 40곳 | FAIL | `c/moim-ui.tsx:26`, `app/samarket-components.css:304-305`, `app/design-tokens.css:219` (40px). 사용: Album 4·CreateWizard 3·InviteLanding 1·MemberView 3·DetailScreen 2·PostDetail 1·Invites 2·Profile 2·ScheduleDetail 5·LocalList 2·moim-ui 2·ManageInvite 3·ManageMembers 1·manage-shared 2·ManageBoards 3·ManageInfo 4 | NEW — prior P2-18 에 없음 |
| G-tap-02 | 칩: `moimCls.chip`(py-1.5 ≈ 32px), `Sam.chip`(`min-h-8` 32px) | FAIL | `c/moim-ui.tsx:32`, `app/samarket-components.css:836-837`; 사용 `c/MoimMemberView.tsx:239,242,317,321`, `c/MoimReportSheet.tsx:80`, `c/MoimWriteScreen.tsx:145`, `cm/MoimManageBoards.tsx:70`, `cm/MoimManagePermissions.tsx:77`, `cm/MoimManageInvite.tsx:117` | NEW |
| G-tap-03 | 섹션 「전체 보기」 글자 버튼(12px, 높이 지정 없음) | FAIL | `c/MoimMemberView.tsx:153,200,215` `moimCls.sectionLink` | NEW |
| G-tap-04 | 사진 ✕ 24px | FAIL | `c/MoimWriteScreen.tsx:181`, `c/MoimScheduleFormScreen.tsx:307` `h-6 w-6` | prior P2-18 |
| G-tap-05 | 표지 ✕ 28px · 질문 ✕ 36px | FAIL | `c/MoimCreateWizard.tsx:235,313` | prior P2-18 |
| G-tap-06 | 출석 토글 | FAIL | `c/MoimScheduleDetailScreen.tsx:573` | prior P2-18 |
| G-tap-07 | 앨범 닫기·이전·다음 40px | FAIL | `c/MoimAlbum.tsx:231,243,248` `h-10 w-10` | prior P2-18 |
| G-tap-08 | FAB 「모임 만들기」「모임 채팅」 `py-2.5` + 14px ≈ 40px | FAIL | `c/MoimTabHome.tsx:154`, `c/MoimMemberView.tsx:123` | NEW (높이 지정 없음, 계산값) |
| G-tap-09 | 스위치 31px | FAIL | `c/MoimScheduleFormScreen.tsx:398` `h-[31px]` (알림 설정에서도 씀 `c/MoimNotificationSettingsScreen.tsx:102`) | NEW |
| G-tap-10 | 가입 방식 세그먼트 `py-2.5` + 13px ≈ 40px | FAIL | `c/MoimCreateWizard.tsx:292` | NEW |
| G-tap-11 | 동의 체크박스 줄(높이 지정 없음) | FAIL | `c/MoimCreateWizard.tsx:382-383` | NEW |
| G-tap-12 | 메신저 「모임 홈」 버튼 `py-1` | FAIL | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx:521` | prior P2-18 |
| G-tap-13 | 댓글 ⋮ 44px | PASS | `c/MoimPostDetailScreen.tsx:210` `h-11 w-11` | 6번 F10 |
| G-tap-14 | 체크·라디오 줄 `min-h-[56px]`/`min-h-[48px]` | PASS | `cm/MoimManageInvite.tsx:271`, `cm/MoimManageTransfer.tsx:72`, `cm/MoimManageMembers.tsx:297` | |

### L-5 반경 (칩 4px · 배지 pill · 시트 안 12px)

| ID | 대상 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-rad-01 | 칩 pill → 4px 이어야 함 | FAIL | `c/moim-ui.tsx:32` `rounded-full` (주석 `:14` 도 「칩 pill」); 사용 6곳 `c/MoimMemberView.tsx:239,242,317,321`, `c/MoimReportSheet.tsx:80`, `c/MoimWriteScreen.tsx:145` | prior D-1 (Owner 결정 = 4px) |
| G-rad-02 | 운영 화면 배지 `Sam.badge.*` = `rounded-sam-sm` 4px → pill 이어야 함 | FAIL | `app/samarket-components.css:974-976`; 사용 `cm/moim-manage-shared.tsx:178-180`(역할), `cm/MoimManageMembers.tsx:208`, `cm/MoimManageRequests.tsx:67`, `cm/MoimManageReports.tsx:96-98`, `cm/MoimManageInvite.tsx:151`, `cm/MoimManageBoards.tsx:86`, `cm/MoimManageHub.tsx:89` | NEW (W3 과 같은 종류, 모임 운영 화면) |
| G-rad-03 | 메신저 모임·일정 배지 4px | FAIL | `MessengerChatListItem.tsx:1152` (+ 같은 줄 `:1159,1171,1177`) | prior W3 |
| G-rad-04 | 시트 안 버튼·입력·카드 = `--overlay-radius-md` 12px | FAIL | `c/MoimJoinSheet.tsx:68,79,89,95,104`, `c/MoimReportSheet.tsx:66,90`, `c/MoimScheduleDetailScreen.tsx:98,107`, `cm/MoimManageMembers.tsx:297,330,385`(`rounded-ui-rect`) | NEW — LOCKED 「시트·다이얼로그 안 버튼·카드·입력 12px」 |
| G-rad-05 | 메신저 「모임 홈」 버튼 pill | FAIL | `CommunityMessengerRoomPhase2Header.tsx:521` `rounded-full` | NEW — 버튼 = 4px |
| G-rad-06 | 모임 화면 배지 `moimCls.badge` pill | PASS | `c/moim-ui.tsx:35` | |
| G-rad-07 | 아바타·FAB·원형 아이콘 pill | PASS | `c/moim-ui.tsx:95,101`, `cm/moim-manage-shared.tsx:161,169`, `c/MoimTabHome.tsx:154` | |
| G-rad-08 | 화면 카드·버튼·입력 4px | PASS | `c/moim-ui.tsx:18,22-29`, `cm/moim-manage-shared.tsx:209-211` | |

### L-6 하드코딩 색

| ID | 대상 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-col-01 | 앨범 사진 위 버튼 반투명 흰색 | N/A | `c/MoimAlbum.tsx:209-210` | 6번 F2·L1 「반투명 바탕 유지」 |
| G-col-02 | 앨범 보기 화면 `bg-black`·`text-white` | FAIL | `c/MoimAlbum.tsx:217,230,243,248,253` | NEW (P3) — `design-tokens.css` 밖 색 |
| G-col-03 | 그 밖 모임 화면 hex·Tailwind 팔레트 색 | PASS | 검색 0건(`#hex`·`rgb(`·`-gray-`·`-red-`…) | |
| G-col-04 | info 토큰 = primary (시안 info 파랑과 다름) | FAIL | `app/design-tokens.css:153-154` | U7-row-staff 와 같은 근거. 충돌 보고 |

### L-7 번역·언어

| ID | 대상 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-i18n-01 | 화면 파일 한국어 문자열 | PASS | `components/moim/**` 주석 밖 한글 0건 | |
| G-i18n-02 | 언어 삼항·`fallbackKo/En`·인라인 `{ko,en}` | PASS | 1건 `c/moim-ui.tsx:54` = DB 다국어 열 선택(허용) | |
| G-i18n-03 | 카테고리 이름이 반대 언어로 대체됨 | FAIL | `c/moim-ui.tsx:54` `c.labelEn \|\| c.labelKo` / `c.labelKo \|\| c.labelEn` | NEW — i18n §3-3 「다른 언어로 대체하지 않는다」, §3-6 영어 = `name_en` → slug 키 → 공통 문장 |
| G-i18n-04 | ko·en 키 수 | PASS | moim-core 196/196, moim-manage 201/201, moim-screens 330/330 | |
| G-i18n-05 | 용어집·개발자 용어(en) | PASS | 모임 en 값 검색 0건(area·region·local·town·withdraw·api·null 등) | `check:i18n-quality` 실행 NOT_PROVEN |
| G-i18n-06 | 길이 예산(_tab·_chip·_badge 18, _btn 22, _title 40, _toast 80) | PASS | 모임 카탈로그 초과 0건 | |

### L-8 영어 복수형 — `{count}` + 복수 명사 키 전부 (모임 화면에서 쓰는 것)

| ID | 키 (en) | 쓰는 곳 | 1일 때 | 판정 | 비고 |
|---|---|---|---|---|---|
| G-i18n-pl-01 | `moim_screen_member_count` 「{count} members」 + `_one` 「{count} member」 | `c/moim-ui.tsx:204` | 「1 member」 | PASS | 6번 D3 |
| G-i18n-pl-02 | `moim_screen_member_count_cap` 「{count}/{cap} members」 | `c/moim-ui.tsx:203` | 「1/10 members」 | PASS | 6번 D3 「맞는 표현」 |
| G-i18n-pl-03 | `moim_home_invites_banner` 「You have {count} group invites」 (`cat/moim-screens.ts:354`) | `c/MoimTabHome.tsx:119` | 「You have 1 group invites」 | FAIL | prior P2-16 |
| G-i18n-pl-04 | `moim_manage_reports_count` 「{count} reports」 (`cat/moim-manage.ts:244`) | `cm/MoimManageReports.tsx:97` | 「1 reports」 | FAIL | prior P2-16 |
| G-i18n-pl-05 | `moim_manage_info_capacity_hint` 「…current {count} members」 (`cat/moim-manage.ts:338`) | `cm/MoimManageInfo.tsx:216` | 「current 1 members」 | FAIL | prior P2-16 |
| G-i18n-pl-06 | `moim_manage_invite_sent_toast` 「Invites sent to {count} people」 (`cat/moim-manage.ts:384`) | `cm/MoimManageInvite.tsx:245` | 「1 people」 | FAIL | prior P2-16 |
| G-i18n-pl-07 | `moim_album_added_toast` 「Added {count} photos」 (`cat/moim-screens.ts:651`) | `c/MoimAlbum.tsx:88` | 「Added 1 photos」 | FAIL | prior P2-16 |
| G-i18n-pl-08 | `moim_manage_invite_send_btn` 「Send invites ({count})」 (`cat/moim-manage.ts:382`) | `cm/MoimManageInvite.tsx:302` | 「Send invites (1)」 | PASS | 괄호 수 — 문장 복수 아님(판단 근거: 「Send invites」 자체가 동작 이름) |
| G-i18n-pl-09 | `moim_manage_close_point_records` 「…for {days} days」 (`cat/moim-manage.ts:419`) — `{count}` 아님, 참고 | `cm/MoimManageClose.tsx:21-24` 정책값 | 정책이 1이면 「1 days」 | NOT_PROVEN | 운영 정책값이 1인지 이 감사에서 조회 안 함(prior: 운영 30) |
| G-i18n-pl-10 | `moim_album_pick_limit_toast` 「up to {max} photos」 — `{count}` 아님, 참고 | `c/MoimAlbum.tsx:77` 상수 10 | 해당 없음 | PASS | `c/MoimAlbum.tsx:18` |
| G-i18n-pl-11 | 그 밖 `{count}` 키: `moim_home_mine_count` 「{count} total」, `moim_home_members_tab`·`moim_manage_members_count_tab` 「Members {count}」, `moim_comments_title` 「Comments {count}」, `moim_schedule_count(_cap)` 「{count} going」, `moim_schedule_requests_title` 「Requests {count}」, `moim_schedule_confirmed_title` 「Going {count}」, `moim_manage_invite_usage` 「{count} joined」, `moim_manage_rejoin_badge` 「Rejoined {count}x」, `moim_manage_count_badge` 「{count}」, `moim_write_photos_label` 「Photos {count}/{max}」 | 각 화면 | 라벨 형태 | PASS | 명사 + 수 라벨 형태라 1에서도 어색하지 않음 |

### L-9 하단 고정 줄 (`MoimStickyFooter`)

| ID | 대상 | 판정 | 코드 증거 | 비고 |
|---|---|---|---|---|
| G-foot-01 | 멤버 화면 7곳(만들기·공개·일정 상세·일정 폼·글쓰기·글 상세·프로필) | PASS | `c/MoimCreateWizard.tsx:392`, `c/MoimPublicView.tsx:200`, `c/MoimScheduleDetailScreen.tsx:615`, `c/MoimScheduleFormScreen.tsx:366`, `c/MoimWriteScreen.tsx:212`, `c/MoimPostDetailScreen.tsx:220`, `c/MoimProfileScreen.tsx:107` | |
| G-foot-02 | 운영 6화면(정보·권한·초대·위임·변경 요청·종료) | PASS | `cm/MoimManageInfo.tsx:295`, `cm/MoimManagePermissions.tsx:102`, `cm/MoimManageInvite.tsx:294`, `cm/MoimManageTransfer.tsx:94`, `cm/MoimManageHostRequest.tsx:123`, `cm/MoimManageClose.tsx:67` | 6번 F9. 키보드 위치는 NOT_PROVEN |
