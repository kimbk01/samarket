# 기존 서비스 댓글 기능 조사 (웹 조사만 · 2026-11-28 PHT)

- 범위: 당근 동네생활, 네이버 카페, 다음 카페, Instagram, YouTube, Facebook
- 표기: **공식** = 해당 회사 고객센터·도움말·공식 공지 / **2차** = 언론·블로그·검색 요약 / **확인 못 함** = 공식 근거를 찾지 못함 (추측으로 채우지 않음)
- 각 칸의 `[숫자]` 는 맨 아래 「출처」 번호
- 조사 한계
  - 앱 화면을 직접 열어 보지 않았다. 모두 문서 근거다. 실제 앱 동작은 NOT_PROVEN.
  - 다음 카페 공식 공지(`m.cafe.daum.net/supporters`)는 이 환경에서 접속이 거부되어 원문을 열지 못했다. 검색 엔진 요약으로만 봤으므로 「공식(요약)」으로 적었다.
  - Instagram 도움말 원문은 JS 화면이라 직접 읽지 못했다. help.instagram.com 으로 범위를 제한한 검색 요약을 썼다.
  - 당근 FAQ 31번(차단)은 「중고거래」 분류 문서다. 동네생활 댓글에도 같은지는 문서에 따로 적혀 있지 않다.

---

## 1. 댓글 구조

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 답글 깊이 | 확인 못 함 | 댓글 아래 「답글쓰기」 공식 [N1] · 몇 단계까지인지는 확인 못 함 | 답댓글 있음 2차 [D3] · 깊이는 확인 못 함 | 댓글 아래 Reply 공식 [I8] · 깊이는 확인 못 함 | 원 댓글 아래 스레드로 묶임 공식 [Y1] · 깊이는 확인 못 함 | 확인 못 함 |
| 답글 표시(접기·@멘션) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 스레드 표시 공식 [Y1] · @멘션은 확인 못 함 | 「가장 관련성 높은 댓글」 보기에서 답글 대부분이 숨겨짐 2차 [F9] |
| 정렬 | 확인 못 함 (게시글 목록은 추천순 공식 [K15]) | **등록순(기본)·최신순** 공식 [N2] + **BEST 댓글 최대 3개** 공식 [N3] | 확인 못 함 | 확인 못 함 | **인기 댓글순(기본)·최근 댓글순** 공식 [Y4] | 가장 관련성 높은 댓글(기본)·최신순·모든 댓글 공식 [F6] |
| 페이지·더보기 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |

- 네이버 BEST 댓글 기준: 좋아요 수·답글 수·작성자 활동 점수, 댓글 10개 이상·조회 50회 이상 글에만, 2025-09-01 이후 글부터 공식 [N3]
- YouTube: 댓글 시간 표시를 누르면 그 댓글과 답글 스레드로 가는 「하이라이트 댓글 링크」 공식 [Y4]

## 2. 작성

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 글자 수 제한 | 확인 못 함 | **댓글·답글 최대 3,000자** 공식 [N1] | 확인 못 함 | 확인 못 함 | 확인 못 함 (1만 자 설은 근거 못 찾음) | 확인 못 함 |
| 사진·이모티콘 | 댓글에 **장소 추가** 공식 [K7][K8] · 사진은 확인 못 함 (동네업체 댓글은 이미지 댓글 공식 [K11] · 당근카페 댓글은 GIF 공식 [K12]) | **사진 또는 스티커**, 한 댓글에 둘 다는 불가 공식 [N1] | 확인 못 함 | 사진 포함 댓글 있음 2차 [I10] | 확인 못 함 | 확인 못 함 |
| 입력창 위치 | 확인 못 함 | 게시글 아래 말풍선 아이콘 → 작성 공식 [N1] (고정 여부는 확인 못 함) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 비로그인 | 확인 못 함 | 확인 못 함 (게시판별 「댓글쓰기 권한」 등급 설정 공식 [N13]) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 비밀 댓글 | 확인 못 함 | **제공하지 않음** 공식 [N12] | 2016년 카페 공지에서 비밀댓글 사용 금지 사례 2차 [D3] | 해당 없음 | 해당 없음 | 해당 없음 |

## 3. 수정·삭제

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 수정 가능 | **가능** (내 댓글 ⋮ → 수정) 공식 [K1] | 확인 못 함 (댓글 수정 도움말을 못 찾음) | 확인 못 함 | **2026-04 부터 가능**, 올린 뒤 15분 안, 글만 수정 2차 [I9] | **가능** (더보기 → 수정) 공식 [Y1] | **가능** (Options → Edit) 공식 [F1] |
| 시간 제한 | 문서에 없음 (확인 못 함) | 확인 못 함 | 확인 못 함 | 15분 2차 [I9] | 문서에 없음 | 공식 문서에 없음 [F1] |
| 「수정됨」 표시 | 확인 못 함 | 게시물은 수정 시각을 **표시하지 않음** 공식 [N12] · 댓글은 확인 못 함 | 확인 못 함 | 수정 사실은 보이고 원래 글은 안 보임 2차 [I9] | 확인 못 함 (도움말에 없음) | 「edited」 표시·수정 기록 열람 2차(2012 보도) [F10] · 공식 문서에는 없음 [F1] |
| 삭제 | 가능, **복구 불가** 공식 [K1] | 가능, **데이터가 남지 않아 복구 불가** 공식 [N4] | 확인 못 함 | 내 댓글 + 내 글의 남의 댓글 삭제 공식 [I2][I3] | 작성자·채널 소유자·정책 위반 삭제 공식 [Y4] | Options → Delete 공식 [F1] |
| 답글 있는 댓글 삭제 시 | 확인 못 함 | 확인 못 함 | 답댓글 자리에 「삭제된 댓글입니다.」 표시가 실제 화면에 있음 2차(관찰) [D3] · 공식 규정은 확인 못 함 | 확인 못 함 | 확인 못 함 (공식 도움말에 언급 없음 [Y4]) | 답글·좋아요도 함께 사라진다는 블로그 설명 2차 [F10] · 공식은 확인 못 함 |

## 4. 좋아요(공감)

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 댓글 좋아요 | **있음** (글 = 공감하기, 댓글 = 좋아요) 공식 [K3] | **있음** (BEST 댓글 기준에 댓글 좋아요 수) 공식 [N3]; 게시판별 좋아요 사용 여부는 운영진 설정 공식 [N5] | 확인 못 함 | 확인 못 함 | **좋아요·싫어요** 공식 [Y1] + 크리에이터 **하트** 공식 [Y1] | 댓글 반응 바꾸기·취소 도움말 있음 공식 [F11] |
| 자기 댓글 좋아요 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 좋아요 알림 | 확인 못 함 | **글·댓글 좋아요 → 내소식·푸시 알림** 공식 [N6] | 확인 못 함 | 확인 못 함 | 하트를 받으면 알림(시청자 알림 설정에 따라) 공식 [Y1] | 확인 못 함 |

## 5. 글 작성자 권한

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 남의 댓글 삭제 | 확인 못 함 | 일반 글쓴이 권한은 확인 못 함 (삭제는 운영진·스탭 권한 공식 [N7]) | 확인 못 함 | **가능** — 내 글의 남의 댓글 삭제 공식 [I2] | **가능** — 채널 소유자 삭제 공식 [Y4] | **가능** — 내 프로필 글의 댓글 숨김·삭제 공식 [F2] |
| 남의 댓글 숨김 | 확인 못 함 | 확인 못 함 | 확인 못 함 | **가능** — 숨기면 나와 댓글 쓴 사람만 보이고, 쓴 사람은 숨김을 모름 공식 [I4] | 사용자를 채널에서 숨기기 공식 [Y3] | **가능** — 숨기면 쓴 사람과 그 친구에게는 계속 보이고, **답글도 함께 숨김** 공식 [F2] |
| 댓글 고정(핀) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 게시물 댓글 최대 3개 고정 2차 [I11]; 라이브 방송 댓글 고정은 공식 [I12] | **1개 고정**, 「(이름)님이 고정함」 표시 공식 [Y1] | 확인 못 함 (Page 게시물 고정 도움말만 있음 [F12]) |
| 「작성자」 배지 | 확인 못 함 | 확인 못 함 | 글 작성자 댓글에 「작성자」 아이콘 (2021-10 도입) 공식(요약) [D2] + 2차 보도 [D4] | 확인 못 함 | 확인 못 함 | 확인 못 함 |

## 6. 신고

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 신고 경로 | 댓글 ⋮ 버튼 → 신고 공식 [K2][K4] | 서비스 화면의 신고 버튼 공식 [N8] | 확인 못 함 | 댓글 밀기(iPhone)·길게 누르기(Android) → 느낌표 공식 [I5] | 스팸·악용 신고 공식 [Y1] | 그룹 관리자에게 댓글 신고 도움말 있음 공식 [F7] |
| 사유 선택형 | **항목 선택형**, 항목 검색도 가능 공식 [K4][K5] | **사유 카테고리 선택형** 공식 [N8] | 확인 못 함 | **선택형** (스팸·사기 / 악용 콘텐츠 등) 공식 [I5] | 「스팸 또는 악용」 공식 [Y1] (세부 목록은 확인 못 함) | 확인 못 함 |
| 신고 후 신고자 화면에서 숨김 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 결과 안내 | 모든 신고에 결과 알림을 주지는 않음 공식 [K6] | **결과를 알려주지 않음** 공식 [N8] | 확인 못 함 | 신고자는 익명 공식 [I5] | 확인 못 함 | 확인 못 함 |
| 익명성 | 신고받은 사람은 신고자를 모르는 것이 원칙 공식 [K13] | 확인 못 함 | 확인 못 함 | 익명 공식 [I5] | 확인 못 함 | 확인 못 함 |

## 7. 차단

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 차단한 사람의 댓글 | **「특정 사용자의 댓글은 보지 않도록 설정이 어려워요」** — 차단해도 댓글은 안 가려짐 공식 [K9] (중고거래 분류 문서) | **「차단한 멤버의 글입니다」 대체 문구**로 바뀜 공식 [N9] | 차단한 회원의 글·댓글이 **대체 텍스트**로 바뀜 공식(요약) [D1] | 차단해도 **기존 댓글·좋아요는 남음**, 직접 삭제 가능 공식 [I6] | 시청자끼리 차단 기능은 확인 못 함; 채널 주인이 숨긴 사용자의 댓글은 내 동영상에 안 보임 공식 [Y2] | 차단한 사람은 내 글을 못 봄 공식 [F3]; 그 사람의 기존 댓글 표시는 확인 못 함 |
| 차단 사용자 답글 처리 | 확인 못 함 | 차단한 멤버가 내 글에 댓글·답글을 달아도 **알림을 보내지 않음** 공식 [N9] · 스레드 안 처리 방식은 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 다시 보기·해제 | 나의 당근 → 설정 → 차단 사용자 관리 공식 [K10] | 「이 댓글만 보기」로 잠깐 보기, 더보기 → 차단 해제 공식 [N9] | 내 프로필 차단 탭에서 해제 공식(요약) [D1] | 확인 못 함 | 확인 못 함 | 확인 못 함 |
| 상대가 아는지 | 확인 못 함 | 차단 사실을 **모름** 공식 [N9] | 차단 목록은 본인만 봄 공식(요약) [D1] | 알림 없음 공식 [I6] | 확인 못 함 | 알림 없음 공식 [F3] |
| 한도·예외 | 거래 대화 상대는 일정 기간 차단 불가 공식 [K14] | 가입한 카페 전체 **200명** 공식 [N9]; PC 글 목록에는 제목이 보임 공식 [N9] | 카페당 **30명**, **앱에서만**, 인기글·검색에는 적용 안 됨, 익명게시판 불가 공식(요약) [D1] | 「댓글만 차단」 별도 기능 공식 [I7] | — | 그룹 안 별명 차단은 그 그룹에서만 적용 공식 [F3] |

- 당근에는 차단과 별도로 「이 사용자의 글 보지 않기」(게시글만 안 보임, 채팅·내 글 보기는 가능)가 있다 공식 [K9]

## 8. 알림

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 댓글·답글 알림 | 글마다 **종 아이콘**으로 켜고 끔, 댓글을 쓰면 그 글의 새 댓글 알림을 받음, 진동·소리 없이 메시지만 공식 [K3b] | 알림 범위 4단계 (모든 댓글 / 참여글 / 내 글·댓글 / 끄기), 「모든 댓글」은 멤버 500명 이하 카페만 공식 [N10] | 확인 못 함 | 확인 못 함 | 고정·하트·답글 시 알림(설정에 따라) 2차 요약 · 하트 알림은 공식 [Y1] | 확인 못 함 |
| 알림 탭 → 해당 댓글로 이동 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 (하이라이트 댓글 링크는 있음 [Y4]) | 확인 못 함 |

## 9. 운영자(카페 매니저 등) 관리

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 댓글 삭제·숨김 | 당근 운영: 위반 댓글 **미노출**, 반복·심한 경우 이용 제한 공식 [K2]; 미노출되면 **알림함으로 사유 안내** 공식 [K16] (당근스토리 문서) | 스탭 권한에 **댓글 삭제** 공식 [N7]; 삭제 글·댓글 보기 메뉴 공식 [N7] | 「작성자와 운영진만 볼 수 있습니다」 표시 사례 2차(관찰) [D3] | 해당 없음 (글 주인 권한) | 운영자 지정은 확인 못 함 | 그룹 관리자: 댓글 속도 늦추기·멤버 활동 제한 공식 [F8] |
| 회원 제재 | 이용 한시·영구 제한 공식 [K2] | **활동정지**(사유 선택·기간), **강제탈퇴 + 재가입 불가** 공식 [N11][N14]; 매니저가 정지 사유 최대 3개 추가 공식 [N15] | 확인 못 함 | — | 채널에서 사용자 삭제·숨기기 공식 [Y3] | 멤버 일시 정지 공식 [F8] |
| 자동 숨김·필터 | 신고 누적 시 숨김 횟수는 **확인 못 함** (나무위키 2차: 「여러 명 신고 누적 시 빠르게 미노출」) | **금칙어** 포함 게시물 → 스팸 보관함 자동 이동 공식 [N16] | 확인 못 함 | 불쾌한 단어 댓글 **기본 자동 숨김**, 숨긴 단어 목록 공식 [I4] | 보류 단계 없음·기본·엄격·모두 보류, **최대 60일 보관**, 차단 단어 공식 [Y2] | 순위 시스템이 스팸·악용 예상 댓글을 아래로 내림 공식 [F6] |
| 화면 문구 | 「동네생활 운영정책에 따라 숨김 처리 되었어요」 2차(검색 요약) | 확인 못 함 | 확인 못 함 | — | — | — |

## 10. 댓글 막기·허용 (글 단위)

| 항목 | 당근 동네생활 | 네이버 카페 | 다음 카페 | Instagram | YouTube | Facebook |
|---|---|---|---|---|---|---|
| 글 단위 끄기 | 확인 못 함 | **2026-09 부터 없앰** — 모든 글 댓글 기본 허용 2차(보도 2026-08-31) [N17]; 현재 글쓰기 기능 설정 도움말에도 댓글 허용 항목 없음 공식 [N12] | 확인 못 함 | 글·릴스·스토리 단위로 올리기 전·후 끄기 공식 [I1] | 동영상 단위 **사용 / 일시중지 / 사용 안 함** 공식 [Y2] | 공개 글마다 「누가 댓글을 달 수 있는지」 선택 공식 [F4] |
| 누가 댓글을 다는지 | 확인 못 함 | 게시판별 댓글쓰기 등급 공식 [N13] | 확인 못 함 | 팔로워·내가 팔로우한 사람 등으로 제한, Limits(1일~4주 2차) 공식 [I4][I13] | 구독자·회원만, 최소 구독 기간 공식 [Y2] | 전체·친구·친구의 친구 공식 [F4] |

---

## 출처

### 당근 (공식 = 당근 고객센터 FAQ, 2026-11-28 열람)
- [K1] 동네생활 게시글/댓글을 수정/삭제하고 싶어요 — https://www.daangn.com/wv/faqs/505 (공식)
- [K2] 동네생활 운영정책 — https://www.daangn.com/wv/faqs/531 (공식)
- [K3] 동네생활에 공감하기는 무엇인가요? — https://www.daangn.com/wv/faqs/3107 (공식)
- [K3b] 동네생활 새 댓글 알림을 끌 수 있나요? — https://www.daangn.com/wv/faqs/3106 (공식)
- [K4] 신고는 어떻게 하나요? — https://www.daangn.com/wv/faqs/605 (공식)
- [K5] 신고 화면이 개선되었어요! — https://www.daangn.com/wv/faqs/13166 (공식)
- [K6] 신고가 잘 접수됐나요? — https://www.daangn.com/wv/faqs/27868 (공식)
- [K7] 장소 추가 — https://www.daangn.com/wv/faqs/400 (공식)
- [K8] 댓글 아래 [장소 추가] 버튼 — https://www.daangn.com/wv/faqs/2014 (공식)
- [K9] 특정 사용자의 게시글을 보고 싶지 않아요 (차단하기) — https://www.daangn.com/wv/faqs/31 (공식, 중고거래 분류)
- [K10] 차단 해제는 어떻게 하나요? — https://www.daangn.com/wv/faqs/136 (공식)
- [K11] 동네업체 댓글 운영정책 — https://www.daangn.com/wv/faqs/27393 (공식, 비즈프로필 댓글)
- [K12] 카페 댓글에 GIF 첨부 — https://www.daangn.com/wv/faqs/33069 (공식, 당근카페)
- [K13] 신고하면 상대방이 알 수 있나요? — https://www.daangn.com/wv/faqs/122 (공식)
- [K14] 차단할 수 없다고 하는데 왜 그런가요? — https://www.daangn.com/wv/faqs/142 (공식)
- [K15] 동네생활 게시글 순서 — https://www.daangn.com/wv/faqs/9670 (공식)
- [K16] 내 스토리/댓글이 미노출됐어요 — https://www.daangn.com/wv/faqs/27146 (공식, 당근스토리)
- 2차: 나무위키 당근(플랫폼) — https://namu.wiki/w/%EB%8B%B9%EA%B7%BC(%ED%94%8C%EB%9E%AB%ED%8F%BC)
- 2차(검색 요약): 동네생활 공개 글의 숨김 문구 — https://www.daangn.com/kr/community/%ED%95%98-3qew4danu7zi/

### 네이버 카페 (공식 = 네이버 고객센터 카페, service 5622)
- [N1] 댓글·답글 등록 방법 — https://help.naver.com/service/5622/contents/15234 (공식)
- [N2] 댓글 노출 순서 설정 방법 — https://help.naver.com/service/5622/contents/862 (공식)
- [N3] BEST 댓글 소개 — https://help.naver.com/service/5622/contents/24815 (공식)
- [N4] 내가 등록한 게시글 및 댓글 확인 방법 — https://help.naver.com/service/5622/contents/15228 (공식)
- [N5] 좋아요 기능 소개 — https://help.naver.com/service/5622/contents/15246 (공식)
- [N6] 좋아요 알림 설정 방법 — https://help.naver.com/service/5622/contents/23389 (공식)
- [N7] 스탭 임명 방법과 권한 소개 — https://help.naver.com/service/5622/contents/15721 (공식)
- [N8] 유해게시글 신고 방법 안내 — https://help.naver.com/service/5622/contents/1920 (공식)
- [N9] 멤버 차단 기능 소개 — https://help.naver.com/service/5622/contents/14684 (공식)
- [N10] 댓글 알림 범위 설정 방법 — https://help.naver.com/service/5622/contents/19115 (공식)
- [N11] 멤버 활동정지 설정 방법 — https://help.naver.com/service/5622/contents/769 (공식)
- [N12] 게시글 작성 방법 및 기능 설정 안내 — https://help.naver.com/service/5622/contents/15212 (공식)
- [N13] 게시판 권한 설정 방법 — https://help.naver.com/service/5622/contents/15704 (공식)
- [N14] 멤버 강제탈퇴 및 재가입 불가 설정 방법 — https://help.naver.com/service/5622/contents/15720 (공식)
- [N15] 활동정지 사유 관리 안내 — https://help.naver.com/service/5622/contents/25508 (공식)
- [N16] 금칙어 설정 방법 — https://help.naver.com/service/5622/contents/15223 (공식)
- [N17] 2차(보도): 「네이버 카페, 9월부터 모든 게시글 댓글 기본 허용」 — https://www.i-boss.co.kr/ab-2877-17977 , https://v.daum.net/v/20260831180642647 (원문 직접 열람 실패, 검색 요약)

### 다음 카페
- [D1] [공식]Daum카페 라운지 「다음카페앱 v4.7.0 업데이트」 — https://m.cafe.daum.net/supporters/MbmU/209 (공식(요약): 이 환경에서 접속 거부, 검색 요약으로만 확인)
- [D2] [공식]Daum카페 라운지 공지 (댓글 작성자 표기 예정) — https://m.cafe.daum.net/supporters/MbmU/178 (공식(요약), 같은 한계)
- [D3] 2차(관찰): 카페 댓글 화면 — https://m.cafe.daum.net/forjournalists/DY4T/43147/comments , https://m.cafe.daum.net/ssaumjil/EpQf/473834/comments (검색 요약)
- [D4] 2차(보도): 인사이트 — https://www.insight.co.kr/news/362057 , 머니투데이 — https://news.mt.co.kr/mtview.php?no=2021100622351941001

### Instagram (공식 = help.instagram.com, 범위 제한 검색 요약)
- [I1] Turn comments on or off — https://help.instagram.com/1766818986917552 (공식)
- [I2] Delete a comment on Instagram — https://help.instagram.com/289098941190483 (공식)
- [I3] Delete comments you've made — https://help.instagram.com/631948184906507/ (공식)
- [I4] Hide comments or message requests — https://help.instagram.com/700284123459336 (공식)
- [I5] Report a comment on Instagram — https://help.instagram.com/198034803689028 (공식)
- [I6] When I block someone, do their likes and comments disappear? — https://help.instagram.com/443143382436836 (공식)
- [I7] Block someone from commenting — https://help.instagram.com/234506470408555/ (공식)
- [I8] Reply to a comment — https://help.instagram.com/366968666719222 (공식)
- [I9] 2차: TechCrunch 「You can now edit your Instagram comments」 2026-04-09 — https://techcrunch.com/2026/04/09/you-can-now-edit-your-instagram-comments/
- [I10] 2차: 같은 TechCrunch 기사 (사진 포함 댓글은 글만 수정)
- [I11] 2차: The Next Web 2020-07-07 (게시물 댓글 3개 고정) — https://thenextweb.com/basics/2020/07/07/instagram-now-lets-you-pin-3-comments-on-your-posts-heres-how/
- [I12] Stories / Live 댓글 고정 — https://help.instagram.com/1662869217365427 (공식)
- [I13] Limits — https://help.instagram.com/4106887762741654 (공식) · 기간 1일~4주는 2차 https://blog.heepsy.com/posts/how-to-pin-a-comment-on-instagram

### YouTube (공식 = YouTube 고객센터)
- [Y1] 댓글 게시 및 상호작용 — https://support.google.com/youtube/answer/6000964?hl=ko (공식)
- [Y2] 댓글 설정 알아보기 — https://support.google.com/youtube/answer/9483359?hl=ko (공식)
- [Y3] 댓글 검토 및 답글 달기 — https://support.google.com/youtube/answer/9482367?hl=ko (공식)
- [Y4] 댓글 보기, 정리, 삭제 — https://support.google.com/youtube/answer/6000976?hl=ko (공식)
- 참고: 댓글 알림 설정 변경 — https://support.google.com/youtube/answer/3523594 (공식, 원문 미열람)

### Facebook (공식 = Facebook 고객센터 · Meta 투명성 센터)
- [F1] Delete or edit my comment — https://www.facebook.com/help/105443102880679 (공식)
- [F2] Hide or delete a comment from a post on your profile — https://www.facebook.com/help/207042374708584 (공식)
- [F3] 차단하면 어떻게 되나요 — https://www.facebook.com/help/168009843260943 (공식)
- [F4] Choose who can comment on your public posts — https://www.facebook.com/help/1625371524453896 (공식)
- [F6] Facebook Feed Ranked Comments — https://transparency.meta.com/features/explaining-ranking/fb-feed-ranked-comments/ (공식)
- [F7] Report a group post or comment to the admins (검색 결과 제목만) — https://www.facebook.com/help/131887213640898 (공식, 원문 미열람)
- [F8] 그룹 멤버 활동 제한 — https://www.facebook.com/help/719854838671405 (공식, 검색 요약)
- [F9] 2차: socialrails 2026 — https://socialrails.com/blog/how-to-turn-off-comments-on-facebook-posts
- [F10] 2차: NBC News 2012 — https://www.nbcnews.com/tech/gadgets/you-can-now-edit-facebook-comments-much-you-want-flna840938 , Tom's Guide — https://www.tomsguide.com/us/Facebook-Comments-Edit-Delete-Edit-History-Tips,news-15648.html
- [F11] 반응 바꾸기·취소 — https://www.facebook.com/help/907484546014773 (공식, 제목만)
- [F12] Pin items to the top of your Page — https://www.facebook.com/help/235598533193464 (공식, Page 게시물)
