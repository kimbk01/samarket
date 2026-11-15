# 메신저 이미지(보내기·읽기·확대·깜빡임) · 이모티콘 감사 — 텔레그램 대조 (2026-11-15)

- 범위: Community 메신저 방(`/community-messenger/rooms/*`). 보고만 — 코드 변경 없음.
- 확인 조건: 코드 = 로컬 `origin/main` `6f2e405b4`. 운영 DB = `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(23:0x PHT). 기기 = Xiaomi 태블릿(8b37179f7d94, 앱 1.2.7/53, 운영 웹 `samarket.vercel.app`, Owner 계정 아님 — 이 기기 로그인 계정, CDP 로 폭 384 휴대폰 화면 덮어쓰기) 23:16~23:19 PHT. Production 배포 SHA 는 이번에 조회하지 않음 → **NOT_PROVEN**.
- 텔레그램 기준: 공개 소스 `DrKLO/Telegram` master (Android) 원문 — `PhotoViewer.java`, `AndroidUtilities.java`, `SendMessagesHelper.java`, `MessageObject.java`, `EmojiView.java`, `EmojiData.java`.
- 판정: **FAIL** = 코드·계측으로 결함 확인 / **코드 FAIL** = 코드로만 확인(기기 미재현) / **NOT_PROVEN** = 확인 못 함.

## 작업자 사고 먼저 보고

- 23:17 PHT, Xiaomi 에서 확대 동작을 재려고 CDP 로 두 손가락 터치를 주입하자 **앱 화면 전체가 5배 확대된 상태**가 됐다(사진만이 아니라 머리글·대화 화면 전체). 23:19 PHT 에 CDP 로 배율 1·확대 보기 닫기로 되돌리고 화면 캡처로 정상 확인, 포트 해제. 데이터 변경 없음.
- 이 주입은 실제 손가락과 경로가 달라(WebView 의 확대 허용 설정을 거치지 않음) **실기 확대 판정 근거로 쓰지 않는다.**

---

## A. 이미지 확대 보기 — 확대 안 됨

| # | 판정 | 내용 | 근거 |
|---|---|---|---|
| A1 | **FAIL** | 확대 보기 화면에 **확대 기능 자체가 없다.** 두 손가락 확대·두 번 탭 확대·확대 후 이동·밀어서 다음 사진·아래로 밀어 닫기 처리 코드 0. 사진은 `max-h-full max-w-full object-contain` 고정 1장. | `components/community-messenger/room/MessengerImageLightbox.tsx:178-183` (터치·포인터·transform 없음), `package.json` 확대 라이브러리 없음 |
| A2 | **코드 FAIL** | 화면 전체 확대도 앱에서 막혀 있다. Capacitor `zoomEnabled` 미설정 → Android `setBuiltInZoomControls(false)`, iOS `scrollViewWillBeginZooming` 에서 핀치 인식기 끔. 웹 viewport `maximumScale: 5` 는 앱 안에서 쓰이지 않는다. | `node_modules/@capacitor/android/.../Bridge.java:612`, `CapConfig.java:287`(기본 false), `node_modules/@capacitor/ios/.../CAPBridgeViewController.swift:322`, `WebViewDelegationHandler.swift:338-339`, `capacitor.config.ts`(zoom 없음), `app/layout.tsx:79` |
| A3 | **FAIL** | 확대 보기를 열면 **검은 화면**이 먼저 나온다. 말풍선에 이미 받아 둔 썸네일(960px)을 깔지 않고 1600px 미리보기를 새로 받는다. 계측: 말풍선 탭 1.2초 뒤에도 확대 보기 사진 `naturalWidth 0`(아직 안 그려짐). | Xiaomi 23:17 PHT CDP 계측 / `MessengerImageLightbox.tsx:48`(`src = urls[i]` 만, 썸네일 깔기 없음) |
| A4 | **코드 FAIL** | 여러 장 넘김은 좌우 버튼·키보드만. 손가락으로 밀어 넘기기 없음. 사진 바깥 아무 곳이나 탭하면 닫힘. | `MessengerImageLightbox.tsx:145-170` |

**실기 확정 (추가, 2026-11-15 23:51~23:53 PHT, Samsung SM-M156S · 앱 1.2.7 (59) · q테스트1 계정 · w테스트1 방 10-26 사진).** 입력은 `input` 명령과 같은 시스템 경로(`InputManagerGlobal.injectInputEvent`, 두 손가락 MotionEvent)로 넣었다. 커널 입력 장치 직접 쓰기는 두 기기 모두 SELinux 로 막힘.

| # | 판정 | 내용 |
|---|---|---|
| A1·A2 | **FAIL (실기)** | 메신저 확대 보기: 두 번 탭 → 변화 없음, 두 손가락 벌리기(간격 120→800px) → 변화 없음, 아래로 밀기 → 닫히지 않음 (캡처 4장 동일) |
| A3 | **FAIL (실기)** | 말풍선 탭 → 0.94초 동안 사진 없이 대화 화면이 비치는 어두운 덮개만 → 사진 표시 (녹화 프레임 1.88s·2.82s) |
| A5 | **FAIL (실기, 신규)** | 확대 보기가 열린 채 Android 뒤로 키 1번 → 확대 보기와 함께 **대화방까지 나가** 채팅 검색 화면으로 돌아감. 텔레그램·앱 공용 뷰어는 뷰어만 닫힘 |
| 비교 | **PASS (실기)** | 같은 입력으로 앱 공용 뷰어(`PostImageViewer`, 상품 상세 사진): 두 번 탭 확대 · 두 손가락 확대 · 아래로 밀어 닫기 · 뒤로 키 = 뷰어만 닫힘 모두 동작. 원인은 앱 확대 설정이 아니라 **메신저만 공용 뷰어를 안 쓰는 것**(A2 의 WebView 확대 꺼짐은 공용 뷰어처럼 화면 안 제스처로 처리하면 무관) |
| 텔레그램 | 실기 | 같은 입력으로 텔레그램 13.2.2: 두 번 탭 확대 → 다시 두 번 탭 복귀, 두 손가락 확대 동작 (23:36 PHT) |

텔레그램 대조 (`PhotoViewer.java`): 두 번 탭 → 3배, 다시 두 번 탭 → 1배 (`:21012-21026` `animateTo(3.0f …)`), 핀치 최대 3배(스티커 10배) (`:19229`), 확대 상태 관성 이동 `onFling` (`:20821-20824`), 사진 넘김·아래로 밀어 닫기, 열 때 말풍선 썸네일 즉시 표시 후 고화질 교체. → DIBAY 는 이 중 **넘김 버튼만** 있다.

## B. 이미지 보내기 전체 흐름

| 단계 | 현재 동작 | 근거 |
|---|---|---|
| 선택 | 웹 `<input type=file>`(jpeg/png/webp/gif, 최대 10장, 장당 8MB) / 앱 사진첩 플러그인 | `CommunityMessengerAttachmentSheet.tsx:386-401`, `messenger-direct-upload-policy.ts:24-33` |
| 축소 | 앱 사진첩 경로만 긴 변 1920 (iOS JPEG 0.85 · Android 86). 웹 선택 경로는 원본 그대로 업로드 | `MessengerPhotoLibraryPlugin.swift:30,585`, `MessengerPhotoLibraryPlugin.java:64,532` |
| 보내는 중 말풍선 | `blob:` 로컬 주소, 크기 정보 없음, 회색 덮개+스피너 | `use-messenger-room-phase2-controller.ts:1667-1742` |
| 업로드 | 합계 3.5MB 이하 multipart, 초과 시 서명 URL 로 나눠 올림 | `messenger-direct-upload.ts:137-179` |
| 서버 변환 | 썸네일 960 WebP q78 · 미리보기 1600 WebP q86 · 원본 EXIF 제거 재인코딩 | `messenger-image-variants.ts:4-8,40-57,102-122` |
| 저장 | 비공개 버킷 `messenger-media`(public=false) — 메시지에는 `getPublicUrl` 주소를 저장하고 읽을 때 조회 라우트로 바꿈 | `service.ts:17871-17902`, 운영 `storage.buckets` |
| 교체 | 서버 응답으로 `blob:` → 조회 라우트 주소. 행 key 는 `cmc:{clientMessageId}` 로 유지 | `community-messenger-room-helpers.tsx:118-125` |

결함:

| # | 판정 | 내용 | 근거 |
|---|---|---|---|
| B1 | **코드 FAIL** | **여러 장(앨범) 보낸 직후 깜빡임.** 한 장은 `blob:` 사진을 아래에 깔고 서버 사진 로드 후 교체하지만, 앨범 칸은 깔기 없이 `src` 만 바뀌어 회색 칸 → 사진으로 다시 그려진다. | `MessengerChatImageBubble.tsx:91-108`(앨범 칸, 깔기 없음, `loading="lazy"`) vs `:198-251`(한 장만 깔기) |
| B2 | **코드 FAIL** | 앨범 서버 응답에 가로·세로 크기가 빠진다(DB 에는 `image_widths/heights` 저장됨). 앨범 메타 읽기도 크기를 버린다. | `service.ts:17924-17930`, `messenger-image-message-map.ts:189-193` |
| B3 | 이미 수정됨 | `metadata.storage_bucket` 이 `post-images` 로 잘못 기록되던 문제(파일은 `messenger-media`)는 11-14 04:03 PHT `10b491279` 에서 수정됨. 운영 DB: 11-14 03:30 PHT 까지 16건 오기록, 11-14 04:12 PHT 이후 3건 정상. 지난 데이터라 이번 결함 목록에서 뺀다. | 운영 DB 최근 14일 이미지 19건 조회 |
| B4 | NOT_PROVEN | 실제 보내기(앨범·한 장) 기기 재현 — 운영 계정으로 메시지를 보내야 해서 이번에 하지 않음. |  |

텔레그램 대조: 보내는 즉시 로컬 사진을 그대로 보여 주고, 업로드 완료 후에도 같은 파일을 캐시 키로 재사용해 다시 받지 않음. 기본 1280px(고화질 선택 시 2560) (`AndroidUtilities.java:3133-3149`), 90px 썸네일 동봉 (`SendMessagesHelper.java:1457-1460`).

## C. 이미지 읽기 · 방 진입 깜빡임

계측(Xiaomi, 방 `cc5cfddd…`, 사진 3장, 23:16·23:17 PHT, 40ms 간격 DOM 표본 + 네트워크):

| 시점 | 처음 진입 | 다시 진입(5분 안) |
|---|---|---|
| 말풍선 칸 생김 | 3,802ms | 2,887ms |
| 조회 라우트 → 302 | +290~360ms | +12~21ms (302 캐시) |
| 사진 바이트 도착 | +1,150~1,200ms (`fromCache false`) | +55ms (`fromCache true`) |
| 회색 칸으로 보인 시간 | **약 1.2초** | **약 0.11초** |
| 칸 높이 변화 | 298 → 318 / 298 → 201 px (아래 말풍선 78px 밀림) | 같음 |

| # | 판정 | 내용 | 근거 |
|---|---|---|---|
| C1 | **FAIL** | **방 진입 시 사진 자리가 회색으로 비었다가 사진이 튀어나온다.** 흐린 미리보기·작은 썸네일 등 즉시 그릴 것이 없고 배경 `bg-black/10` 만 있다. 처음 진입 약 1.2초, 다시 진입도 약 0.1초 회색. | 계측 표, `MessengerChatImageBubble.tsx:218-221` |
| C2 | **코드 FAIL** | **5분이 지나면 매번 처음처럼 다시 받는다.** 302 캐시 300초, 서명 URL 600초. 302 가 만료되면 새 토큰의 다른 주소가 나와 브라우저 캐시를 못 쓴다. 매 사진마다 로그인 확인+DB 2~3회 조회+서명 왕복(계측 약 300ms)이 먼저 붙는다. | `messenger-media-access.ts:17-20`, 미디어 라우트 `route.ts:163-191`, 운영 객체 `cacheControl max-age=3600` |
| C3 | **FAIL** | **크기 정보 없는 사진은 로드 후 칸 높이가 바뀌어 대화가 밀린다**(계측 298→318·201px, 아래 말풍선 top 118→196). 크기 정보가 있는 최근 한 장 메시지는 로드 전 비율 고정. 운영 이미지 117건 중 크기 없는 것 87건(대부분 과거 데이터, 최근 14일은 1건). | 계측, `MessengerChatImageBubble.tsx:193-196` |
| C4 | **FAIL** | 말풍선 사진이 칸을 꽉 채워 가운데 자르기가 안 된다. `h-full` 이 층 밖 전역 규칙 `img{height:auto}` 에 져서 사진 높이가 원래 비율대로 계산되고, 칸을 넘는 부분은 **아래쪽만** 잘린다(계측: 칸 298px, 사진 357px). 세로로 긴 사진은 위쪽만 보인다. 앨범 칸도 같은 규칙. | 계측, `app/globals.css:207-213`, `MessengerChatImageBubble.tsx:233-237,104` |
| C5 | **코드 FAIL** | 사진이 `loading="lazy"` 라 진입 직후 화면 안 사진도 지연 로드 판정을 거친다. | `MessengerChatImageBubble.tsx:238` |
| C7 | **FAIL (실기, 신규)** | 1:1 방 ⋮ → 「사진/파일 보기」가 「사진 0 · 미디어 없음」. 운영 DB 에 그 방(w테스트1, `c202326f…`) 사진 메시지 5건. 원인: 1:1 모음은 화면에 불러온 메시지만 센다(`use-messenger-room-derived-message-lists.ts:53-61`). 그룹방은 서버 페이지 조회(`use-group-room-media-album.ts:32`)라 갈라져 있음 | Samsung 11:38 PHT 캡처, 운영 DB |
| C6 | 확인 결과 | 이미 받은 메시지의 사진 주소가 진입·갱신 중 바뀌는 경로는 없음(같은 메시지·같은 경로 → 같은 라우트 주소, 행 객체 재사용). | `messenger-media-ref.ts:222-254`, `merge-primed-timeline-seed.ts` |

텔레그램 대조: 메시지마다 아주 작은 흐린 썸네일(stripped thumb)을 메시지 자체에 담아 **받기 전에도 즉시 그림**(`MessageObject.java:342,2199-2210`), 사진 크기를 항상 알고 있어 칸이 바뀌지 않음, 받은 파일은 기기 캐시에 저장해 재진입 시 다시 받지 않음.

## D. 이모티콘 전체

### 현재 DIBAY 에 있는 것 (코드·DB 확인)

| 종류 | 상태 | 근거 |
|---|---|---|
| 이모지 패널 | 손으로 적은 목록 6줄×20 = 120개(😌 중복 → 실제 119개): 얼굴 80 · 손 20 · 하트 20. 처음 35개만, 나머지는 「더보기」 | `lib/chat-ui/chat-emoji-catalog.ts:2-14`, `components/chat-ui/ChatEmojiPicker.tsx:21,47-56` |
| 스티커 | 정지 그림 11개(기본 6 · 리액션 5), Twemoji 72px PNG → 128px WebP 변환. 최근 사용 16개(기기 저장) | `public/stickers/packs/*`, `scripts/build-samarket-stickers.mjs`, `lib/stickers/recent-stickers-client.ts:3-4` |
| 메시지 반응 | 고정 6개 😀😮❤️👍👏😢, 1인 1개, 내 메시지에는 불가. 운영 누적 9건 | `message-reaction-policy.ts:5,13-25`, 운영 `community_messenger_message_reactions` |
| GIF | 사진으로 올린 GIF 원본만 유지(검색·패널 없음) | `messenger-image-variants.ts:86-95` |

### 결함

| # | 판정 | 내용 | 근거 |
|---|---|---|---|
| D1 | **코드 FAIL** | **이모지를 누르면 바로 한 개짜리 메시지로 전송된다.** 글과 이모지를 섞어 쓸 수 없다(수정 중일 때만 입력창에 넣음). 패널 안내 문구는 「탭하여 입력」이라 화면 문구와 동작이 다르다. | `use-messenger-room-phase2-controller.ts:1364-1394`(`void sendMessage(token)`), `lib/i18n/catalog/common.ts:63,238` |
| D2 | **코드 FAIL** | 이모지만 보낸 메시지가 큰 글자로 보이지 않는다(메신저 말풍선 항상 14px). 같은 앱의 옛 거래 채팅에는 큰 이모지가 있어 화면마다 다르다. | `MessengerTimelineBubbleInners.tsx:260-295`, `components/chats/ChatMessageList.tsx:75-82,310` |
| D3 | **코드 FAIL** | 이모지 패널이 **키보드 자리를 대신하지 않고 화면을 덮는 시트**로 열린다. 키보드↔이모지 전환 버튼 없음, 패널 높이를 키보드 높이에 맞추는 처리 없음. | `CommunityMessengerRoomPhase2RoomSheets.tsx:150-180`, `CommunityMessengerRoomPhase2Composer.tsx:567-572` |
| D4 | 비교 미구현 | 분류 탭·최근 사용·피부색·검색 없음(119개 고정). | `ChatEmojiPicker.tsx` |
| D5 | 비교 미구현 | 움직이는 스티커·움직이는 이모지·GIF 검색·스티커 묶음 추가/관리(어드민 포함) 없음. 스티커 11개 고정. | 저장소 전수 검색 결과 없음 |
| D6 | **코드 FAIL** | 반응이 방 실시간 구독에서 빠져 있어, 상대가 단 반응은 다음 새로 고침 때 나타난다(실기 시간 미측정 → 지연 길이 NOT_PROVEN). | `lib/community-messenger/realtime/__tests__/open-room-bundle-no-reactions-binding.test.ts` |
| D7 | i18n 위반 | 반응 버튼 읽기 이름 `반응 ${k}`, 스티커 묶음 이름 「기본」「리액션」, 목록 미리보기 「스티커」가 코드 안 한국어. | `MessageReactionBar.tsx:20`, `fallback-sticker-catalog.ts:19-20`, `room-list-semantic-preview.ts:33` |

### 텔레그램 이모티콘 종류 (Android 소스 기준)

| 종류 | 텔레그램 | DIBAY |
|---|---|---|
| 유니코드 이모지 | 8개 분류, 목록 3,606개(`EmojiData.java` `data`), 피부색 선택(`EmojiColorPickerWindow`), 최근 사용, 검색 | 119개, 분류 탭·피부색·최근·검색 없음 |
| 이모지 입력 | 입력창에 삽입(글과 섞기) | 바로 전송 (D1) |
| 큰 이모지 | 이모지만 보낸 메시지는 크게, 움직이는 이모지는 재생(`MessageObject.java:2252-2272`) | 없음 (D2) |
| 스티커 | 정지·움직이는(Lottie)·영상 스티커, 묶음 추가·검색 | 정지 11개 |
| GIF | GIF 탭·검색(`EmojiView.java:242,710-742`) | 없음 |
| 사용자 지정 이모지 | 움직이는 사용자 지정 이모지(프리미엄) | 없음 |
| 반응 | 많은 이모지 선택, 내 메시지에도 가능, 실시간 반영 | 6개 고정, 내 메시지 불가, 실시간 아님 (D6) |
| 패널 위치 | 키보드 자리 그대로 전환 | 덮는 시트 (D3) |

D4·D5 와 표의 「없음」 항목은 **기능 차이**이며, 만들지 여부는 Owner 결정이 필요하다(계약에 없음 — 임의 구현 대상 아님).

## E. 확인 못 한 것 (NOT_PROVEN)

- Production 배포 SHA, Owner 계정·Owner 휴대폰 화면에서의 재현(실기는 테스트 계정 q테스트1 · Xiaomi 계정).
- iOS 실기(확대·뒤로 대신 가장자리 밀기).
- (해결) 텔레그램 이모지 패널 실기 — 23:56 PHT Samsung 텔레그램 13.2.2, 보내기 없음: 😊 버튼 → 키보드 자리에 패널(버튼은 ⌨ 로 바뀜) · 위 줄 최근·분류 아이콘 · 검색칸 · 8열 격자 · 아래 탭 「이모지 · GIF · 스티커」 · 지우기 키. 이모지를 누르면 **입력창에 삽입**되고 전송 버튼이 나타남(바로 전송 안 됨) · 지우기로 삭제 · 입력창을 누르면 같은 높이에서 키보드로 전환. → D1·D3 결함 기준 실기 확정.
- 작업 기록: 23:53:58 PHT 쯤 다른 세션의 DIBAY 통화 화면이 앞에 올라온 것을 모르고 Samsung 에 탭 2번(빈 곳)이 들어감 — 직후 캡처에서 통화 진행·스피커·음소거 변화 없음, 해당 세션에 보고함.
- 정정: 처음에 「대화방 옛 기록이 안 불러와진다」고 봤으나, 천천히 올리면 정상으로 불러와진다(결함 아님).
- 사진 보내기(B1·B2) 실기 — 운영 계정으로 보내야 해서 하지 않음.
- 반응 실시간 지연 시간(D6).
