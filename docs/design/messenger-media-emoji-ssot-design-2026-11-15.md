# 메신저 사진·이모티콘 UI·UX·CTA 단일 기준(SSOT) 설계 — 텔레그램 대조 (2026-11-15)

- 상태: **S1 승인·구현(Owner 「S1 구현 시작」 2026-11-16).** S2~S8 은 Owner 승인 전 구현 금지. 감사 원본: `docs/audit/messenger-image-emoji-audit-2026-11-15.md`.
- 기준 앱: 텔레그램 — Android 공개 소스 `DrKLO/Telegram` master 원문(파일:줄 인용) + Samsung 실기(Telegram 13.2.2, 23:36 PHT, 열람만).
- 코드 기준: `origin/main` `6f2e405b4`.

## 0. 왜 같은 수정이 반복되는가 (원인)

| 반복 | 이력 | 확정 원인 |
|---|---|---|
| 사진 말풍선 크기·깜빡임 | `d2109c608`(10-16 「no blank flash after send」), `1e845ad24`(11-08 D2-가 「사진은 비율 상자를 채우기만」), `c9c316611`(11-09 앨범 3장 비율) | ① 전역 층 밖 규칙 `img{height:auto}`(`app/globals.css:207-213`)가 말풍선의 `h-full` 을 이겨 D2-가 가 운영에서 적용되지 않음(계측: 칸 298px · 사진 357px). ② 크기·자르기 규칙이 컴포넌트 안 숫자(clamp 0.75~1.5, `max-h-[360px]`, `w-[min(62vw,280px)]`)로 흩어져 기준 문서가 없음. ③ 받기 전 그릴 것(흐린 미리보기)이 없어 회색 칸 → 사진 교체가 구조적으로 남음. |
| 사진 확대 | 메신저 뷰어는 8-09 이후 확대 기능 추가 이력 없음 | 앱에는 이미 확대·넘기기·닫기 제스처를 갖춘 **공용 뷰어** `components/common/media/PostImageViewer.tsx` + `lib/ui/image-viewer-transform.ts` 가 있고 게시글·상품·매장 3곳이 쓴다. **메신저만 별도 뷰어** `MessengerImageLightbox.tsx`(확대 없음)를 써서 갈라졌다. |
| 사진 모음 | — | 그룹방은 서버 페이지 조회(`use-group-room-media-album.ts:32` → `/group/{id}/media`), 1:1 방은 화면에 불러온 메시지만 셈(`use-messenger-room-derived-message-lists.ts:53-61`) → 운영 w테스트1 방 사진 5건인데 「사진 0 · 미디어 없음」(Samsung 실기 11:38 PHT). |
| 이모지 | 10-24 K-4 「이모지 시트 분리」 | 이모지 동작(바로 전송·덮는 시트)이 텔레그램 기준 없이 정해짐. 거래 채팅(`components/chats/ChatInputBar.tsx`)과 메신저(`ChatEmojiPicker`)가 목록만 공유하고 부품·동작·큰 이모지 판정이 다름. |

→ 해결 원칙: **기능마다 부품 1개 · 상수 파일 1개 · 계약 시험 1개.** 화면이 그 부품만 쓰는지 시험으로 고정한다(진입점 통일, `unify-all-entry-points`).

## 1. 텔레그램 기준값 (원문·실측)

| 항목 | 텔레그램 값 | 근거 |
|---|---|---|
| 뷰어 두 번 탭 | 1배 → **3배**(누른 지점 중심), 확대 중이면 → 1배 | `PhotoViewer.java:21012-21026`, Samsung 실기(두 번 탭 확대·다시 두 번 탭 복귀 캡처) |
| 뷰어 핀치 최대 | **3배**(스티커 10배) | `PhotoViewer.java:19229` |
| 확대 중 이동 | 손가락 이동 + 관성 | `PhotoViewer.java:20821-20824` |
| 뷰어 열 때 | 말풍선에 이미 있는 사진을 먼저 그리고 고화질로 교체 | `MessageObject.java:342,2199-2210`(stripped thumb) |
| 말풍선 사진 폭 | 가로 사진(w≥h): 화면 짧은 변 − 64dp · 세로 사진: 짧은 변 × 0.7 · 태블릿: 태블릿 짧은 변 × 0.7 | `ChatMessageCell.java:9138-9153` |
| 말풍선 사진 높이 | 최대 = 폭 + 100dp, 넘으면 폭을 줄여 비율 유지 · 최소 120dp(그때만 자름) | `ChatMessageCell.java:9155`, `:9264-9276` |
| 받기 전 표시 | 메시지에 담긴 아주 작은 흐린 썸네일 | `MessageObject.java:2199-2210` |
| 이모지만 보낸 글 크기 | 1~2개 40.8dp · 3개 33.6dp · 4개 26.4dp · 5~9개 22.8dp(배율표 `.68/.46/.34/.28/.22/.19 × 120dp`, 일반 이모지는 한 칸 아래 값) | `MessageObject.java:2272-2306`, `Theme.java:8125-8128` |
| 이모지 패널 | 키보드 자리를 대신하는 패널 · 분류 탭 · 최근 · 피부색 · 검색 · 누르면 **입력창에 삽입** | `EmojiView.java:218,344,380,637`, `EmojiData.java`(8분류) |
| 스티커·GIF | 같은 패널의 탭 | `EmojiView.java:242,265` |
| 반응 | 길게 눌러 고르기, 실시간 반영 | 실기 확인 예정(§6 D-R) |

## 2. 단일 기준 정의

### M1. 사진 뷰어 = 앱 공용 뷰어 1개

- 부품: `PostImageViewer` 를 **`DibayImageViewer`**(위치 `components/common/media/`)로 일반화하고, 메신저 `MessengerImageLightbox` 는 삭제한다.
- 입력 계약: `items: { display: string; original: string; placeholder?: string }[]`, `index`, `onClose`. 화면별 주소 변환(게시글 `.detail` 파생본, 메신저 조회 라우트)은 부르는 쪽이 만든다. 지금 쓰는 `displayUrlFor`(`PostImageViewer.tsx:78-80`)는 이 계약으로 흡수한다.
- 열 때: `placeholder`(말풍선에 이미 그려진 썸네일 주소)를 즉시 그리고, `display` 로드가 끝나면 교체한다. 회색·검은 화면 금지.
- 제스처 상수는 `lib/ui/image-viewer-transform.ts` 한 곳에서 정한다. 지금 값은 `MAX_SCALE 4`, `DOUBLE_TAP_SCALE 2.5`, 텔레그램은 3/3 → **Owner 결정 O1**.
- 저장·원본 보기·뒤로가기(히스토리 1칸)·스크롤 잠금은 공용 뷰어 것을 그대로 쓴다. 메신저 읽음 차단 키(`messengerRoomReadBlockKeyImageLightbox`)는 유지한다.
- 진입점 전수표 (지금 → 바뀐 뒤):

| 진입점 | 지금 | 바뀐 뒤 |
|---|---|---|
| 메신저 말풍선 한 장·앨범 (`MessengerChatImageBubble` → `CommunityMessengerRoomPhase2MessageTimeline.tsx:2345`) | MessengerImageLightbox | DibayImageViewer |
| 메신저 1:1 사진 모음 (`RoomSheets.tsx:1586-1630`) | 누르면 메시지로 이동(`scrollToRoomMessage`) — 뷰어 아님 | S1 에서 바꾸지 않음(O2·S5 와 함께 결정) |
| 그룹 사진 모음 (`GroupRoomMediaAlbumPanel` `onOpenMessage`) | 메시지로 이동 | 유지(텔레그램도 모음 → 해당 사진 뷰어) — **O2** |
| 게시글·피드·외부 글 (`CommunityPostDetailBody`, `NeighborhoodInterleavedContent`, `ImportedRichContent`) | PostImageViewer | DibayImageViewer(동작 같음) |
| 상품 상세 `ProductImageGallery.tsx:132` · 매장 상세 `StoreDetailPublic.tsx:2419` | PostImageViewer | DibayImageViewer(동작 같음) |
| 거래 채팅(옛 `components/chats`) 사진 | 확인 필요 | 범위 밖 — 보고만(Owner 지시 시 같은 부품) |

- 계약 시험: 위 파일들이 `DibayImageViewer` 만 import 하고 `MessengerImageLightbox` 가 저장소에 없음을 확인한다.

### M2. 사진 말풍선 크기 = 상수 파일 1개

- 파일 `lib/community-messenger/media/messenger-photo-bubble-size.ts` 의 순수 함수 `photoBubbleSize({ w, h, containerWidth, isTablet })` 가 `{ width, height, crop }` 을 돌려준다. 값은 §1 텔레그램 규칙을 그대로 쓰고, dp 는 CSS px 로 둔다.
- 말풍선은 이 함수 결과로 **로드 전에** 폭·높이를 고정한다. 사진은 `!h-full !w-full object-cover` 로 칸을 채운다. 층 안 `!important` 는 전역 `img{height:auto}` 를 이기기 위한 것이고, 전역 규칙은 통화 규정 대상이라 건드리지 않는다.
- 크기 정보가 없는 지난 메시지는 기본 비율 4:5 를 쓰고 로드 후에도 칸을 바꾸지 않는다(밀림 0). 지난 데이터는 다시 채우지 않는다.
- 앨범: 텔레그램은 크기 정보로 칸을 나눈다. 지금은 고정 격자 → **Owner 결정 O3**. 최소 수정은 격자를 유지하고 칸 채움(`!h-full`)·덮개(아래 M3)만 맞추는 것이다.
- 계약 시험: 함수 값 표(가로·세로·아주 긴 사진·최소 높이) + 말풍선이 함수 결과를 쓰는지 렌더 시험 + 기기 계측(칸 높이 = 사진 높이).

### M3. 깜빡임 0 = 받기 전 그릴 것 + 같은 주소

| 원인 | 수정 | 영향 |
|---|---|---|
| 받기 전 그릴 것 없음 | 업로드 때 서버(sharp)가 긴 변 16~20px 흐린 썸네일을 만들어 `metadata.image_blur`(앨범 `image_blurs[]`, data URL 1KB 이하)에 저장한다. 말풍선·뷰어는 이것을 즉시 배경으로 그린다(텔레그램 stripped thumb 와 같은 역할). | `messenger-image-variants.ts`, `service.ts:17871-17940`(메타·응답), bump 스냅샷, 말풍선, 뷰어. 지난 메시지는 배경색만. |
| 5분마다 새 주소 → 다시 받기 | 서명 유효 600초 · 302 캐시 300초(`messenger-media-access.ts:17-20`)와 저장 객체 `cacheControl max-age=3600` 이 원인이다. 경로가 바뀌지 않는 파일이므로 업로드 `cacheControl` 을 1년으로, 서명·302 캐시 시간을 늘린다. **O4(보안 결정)** — 서명 주소가 밖에 나갔을 때 유효한 시간이 함께 늘어난다. | 미디어 라우트, 업로드 2곳(사진·전달 복사) |
| 보낸 직후 앨범 회색 | 한 장 말풍선의 「직전 사진 깔기」를 앨범 칸에도 같은 부품으로 적용하고, 서버 응답에 앨범 크기를 넣는다(`service.ts:17924-17930`, `messenger-image-message-map.ts:189-193`). | 말풍선만 |
| 화면 안 사진 지연 로드 | 화면 안 첫 화면 분량은 `loading="eager"` · 나머지만 lazy. | 말풍선만 |

### M4. 방 사진 모음 = 서버 조회 1개

- 1:1·그룹·거래·주문 방 모두 `/rooms/{id}/media`(그룹 API 일반화) 한 경로로 서버 페이지 조회한다. 화면에 불러온 메시지로 세는 `mediaGalleryMessages` 는 모음 화면에서 쓰지 않는다.
- 사진·음성 개수 칸은 서버 개수로 표시한다.
- 계약 시험: 1:1 방 모음이 서버 응답 개수를 그대로 그리는지(메시지 0개 로드 상태에서도).

### E1. 이모지 입력 = 텔레그램 동작

- 누르면 **입력창 커서 위치에 삽입**(바로 전송 금지)한다. 전송은 전송 버튼만. 지금 함수 `insertEmojiIntoComposerText`(`messenger-composer-emoji-insert.ts`)를 비편집 상태에도 쓴다. 안내 문구 「탭하여 입력」은 동작과 일치하게 된다.
- 패널 위치: 키보드 자리를 대신하는 패널이다(😊 ↔ ⌨ 버튼 전환). 패널 높이는 마지막으로 잰 키보드 높이, 없으면 기기 기본값으로 둔다. **방 뷰포트 계약(`docs/community-messenger-mobile-room-viewport.md`)을 바꾸는 변경**이라 그 문서 §7 이력과 함께 단독 단계로 한다.
- 목록: 유니코드 공식 목록(`emoji-test.txt`, Unicode 라이선스)에서 만든 정적 데이터 파일 1개를 쓴다. 분류 8개 · 최근 사용(기기 저장) · 피부색(길게 누르기). 검색은 **O5**. 기기에서 그려지지 않는 새 이모지가 나오지 않게 지원 버전 상한을 둔다(**O6**: Android 최소 지원 버전 기준).
- 거래 채팅(옛 `ChatInputBar`)도 같은 패널 부품을 쓸지는 범위 밖 — 보고만(Owner 지시 시 같은 부품).

### E2. 큰 이모지 = 판정 함수 1개

- `lib/chat-ui/emoji-only.ts`: 이모지만으로 된 글인지와 개수를 `Intl.Segmenter`(글자 묶음) + `\p{Extended_Pictographic}` 로 판정한다. 지금 옛 거래 채팅 정규식(`ChatMessageList.tsx:75-82`)은 「이모지 1개 이상 포함」만 봐서 「!!😀」도 큰 글자가 된다.
- 크기: §1 텔레그램 표(1~2개 40.8 · 3개 33.6 · 4개 26.4 · 5~9개 22.8, 10개 이상 일반)를 그대로 쓰고, 말풍선 배경 없이 그린다.
- 메신저 말풍선과 옛 거래 채팅이 같은 함수를 쓰게 한다. 옛 거래 채팅 적용은 범위 확인 **O7**.

### E3. 반응

- 지금은 반응이 열린 방 실시간 구독에서 의도적으로 빠져 있다(`open-room-bundle-no-reactions-binding.test.ts`: 이 테이블은 Realtime 대상이 아니라 넣으면 채널 전체가 조용히 끊김).
- 메신저 방 계약은 「변경 직후 서버만 bump 발행」(`docs/messenger-realtime-policy.md`)이다. 반응 토글(`service.ts:19183`) 뒤 서버 bump 로 알리는 것이 계약과 맞는 방법이다. 지금 토글 경로에 bump 발행이 있는지는 구현 단계 첫 작업에서 코드로 확정한다.
- 반응 종류 6개 고정·1인 1개·내 메시지 불가는 텔레그램과 다르다 → **O8**(종류·개수 정책).

### E4. 스티커·GIF·움직이는 이모지

- 지금: 정지 스티커 11개 · GIF 없음 · 움직이는 이모지 없음. 텔레그램 수준은 새 기능(자산·라이선스·저장 용량·어드민)이라 계약에 없다 → **O9 — 만들지 여부부터 Owner 결정.** 결정 전에는 손대지 않는다.

## 3. 단계 (한 단계 = PR 1개, 끝난 상태에서 화면이 깨지지 않게)

| 단계 | 내용 | 바뀌는 곳 | 같은 단계에서 함께 처리 | 검증 |
|---|---|---|---|---|
| S1 | M1 공용 뷰어 일반화 + 메신저 전환 + 옛 뷰어 삭제 | `PostImageViewer`→`DibayImageViewer`, 게시글·상품·매장 호출 5곳, 메신저 타임라인 | 저장·원본·뒤로가기·읽음 차단 유지, 계약 시험 | vitest · 기기: Samsung 실제 입력 경로 두 번 탭·두 손가락·넘기기·아래로 닫기 + 게시글·상품 회귀 |
| S2 | M2 말풍선 크기 상수 + 칸 채움 | 상수 파일, `MessengerChatImageBubble` | 앨범 칸 채움, 기존 크기 시험 갱신 | 기기 계측(칸=사진 높이, 로드 전후 밀림 0) |
| S3 | M3 흐린 썸네일 + 앨범 깔기·크기 + 첫 화면 eager | 업로드 변환·메타·bump 스냅샷·말풍선 | 전달 복사(`fwd-*`) 경로도 같은 메타 | 기기 녹화(진입·보낸 직후 회색 0 프레임) |
| S4 | M3 캐시 시간 (O4 승인 시만) | 미디어 라우트·업로드 cacheControl | — | 5분 뒤 재진입 `fromCache` 계측 |
| S5 | M4 사진 모음 서버 조회 통일 | 미디어 API 일반화, 1:1 모음 | 그룹 모음 같은 API | 1:1 방 모음 개수 = 운영 DB 개수 |
| S6 | E1 이모지 삽입(바로 전송 제거) + E2 큰 이모지 | 컨트롤러 `insertOrSendComposerEmoji`, 말풍선 글자 | 안내 문구 키 확인 | 기기: 글+이모지 섞어 보내기, 큰 이모지 크기 계측 |
| S7 | E1 키보드 자리 패널 + 전체 목록·최근·피부색 | composer·뷰포트 계약 문서 | 뷰포트 문서 §7 이력 | 기기: 키보드↔패널 전환 시 입력창 위치 변동 0 |
| S8 | E3 반응 bump (O8 결정 반영) | 반응 서비스·bump 수신 | — | 두 기기 반응 표시 시간 계측 |

- 통화 관련 파일(`globals.css` img 규칙 포함)은 어느 단계에서도 바꾸지 않는다.
- 각 단계는 승인된 범위만, 끝나면 1회 보고한다.

## 4. Owner 결정 필요

| # | 질문 | 작업자 권장 |
|---|---|---|
| O1 | 뷰어 확대 배율: 텔레그램 3배/두 번 탭 3배 vs 지금 공용 4배/2.5배 (게시글·상품·매장도 같이 바뀜) | 텔레그램 값 3/3 |
| O2 | 그룹 사진 모음에서 사진을 누르면: 메시지로 이동(지금) vs 뷰어 열기(텔레그램) | 뷰어 열기 + 뷰어 안 「메시지로 이동」 |
| O3 | 앨범 칸: 고정 격자 유지 vs 텔레그램처럼 크기 기반 배치 | 이번엔 격자 유지(S3까지), 배치는 별도 |
| O4 | 사진 주소 캐시 시간 늘리기(보안 시간과 맞바꿈) | 서명 7일 · 302 캐시 6일 · 파일 캐시 1년 |
| O5 | 이모지 검색 넣기 | 넣기(ko·en 이름) |
| O6 | 이모지 지원 버전 상한 | Android 7(minSdk 24) 기준으로 그려지는 버전까지 |
| O7 | 큰 이모지·이모지 패널을 거래 채팅(옛 화면)에도 적용 | 같은 부품 적용 |
| O8 | 반응: 6개 고정·1인 1개·내 메시지 불가 유지 vs 텔레그램처럼 확장 | 정책은 유지, 실시간 반영만 |
| O9 | 움직이는 스티커·GIF·움직이는 이모지 만들지 | Owner 결정(새 기능) |

## 5. 실기 확정 결과와 남은 확인

- 확정(Samsung 1.2.7 (59), 실제 입력 경로 `InputManagerGlobal` 주입, 23:51~23:53 PHT):
  - 메신저 뷰어 두 번 탭·두 손가락·아래로 밀기 모두 동작하지 않음.
  - 열 때 0.94초 동안 사진이 없음.
  - 뒤로 키를 누르면 대화방까지 나감.
- 확정(같은 입력, 상품 상세): 공용 뷰어는 확대·밀어 닫기가 되고, 뒤로 키에 뷰어만 닫힘 → **M1 통일만으로 확대·뒤로 결함이 함께 해결되는 근거.** M1 계약 시험에 「뷰어 열린 채 뒤로 = 뷰어만 닫힘」을 넣는다.
- 남음:
  - 1:1 사진 모음에서 사진을 눌렀을 때 동작(지금은 0건이라 못 누름).
  - (해결 23:56 PHT) 텔레그램 이모지 패널 실기: 키보드 자리 패널·⌨/😊 전환·누르면 입력창 삽입·「이모지·GIF·스티커」 탭 확인 → E1 기준 확정.
  - iOS 실기.

## 6. S1 구현 기록 (2026-11-16)

- `components/common/media/PostImageViewer.tsx` → `DibayImageViewer.tsx`. 입력 `items[{display, original, placeholder?}]`, `allowSaveAll`. 주소 → 항목 변환은 `lib/ui/dibay-image-viewer-items.ts`(늦게 불러오는 매장 화면용 분리).
- 받는 동안 `placeholder`(메신저 말풍선 썸네일 960)를 같은 맞춤·같은 확대로 먼저 그림 → 검은 빈 화면 제거. placeholder 가 없으면 기존 로딩 원.
- 메신저: `MessengerChatImageBubble` 이 항목(1600 화면용 · 원본 · 썸네일)을 넘기고 타임라인이 `DibayImageViewer`(모두 저장 포함)를 연다. `MessengerImageLightbox.tsx` 와 그 계약 시험 삭제.
- 확대 배율·두 번 탭 배율은 바꾸지 않음(O1 미결정 — 지금 공용 값 4배·2.5배 그대로).
- 계약 시험 `components/common/media/__tests__/dibay-image-viewer-ssot-contract.test.tsx`: 진입점 6파일이 공용 뷰어만 쓰는지 · 옛 파일 없음 · placeholder 먼저 그림 · 뒤로 = 히스토리 1칸.
