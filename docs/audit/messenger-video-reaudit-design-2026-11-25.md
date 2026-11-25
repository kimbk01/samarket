# 채팅 영상 — 재감사 · 결함 · 설계안 (2026-11-25)

- 상태: **감사·설계만 했고 구현은 하지 않았다.** Owner 승인 전에는 코드·DB·네이티브를 바꾸지 않는다.
- 확인 조건: 운영 SHA `86ac083` · Samsung SM-M156S Android 1.2.7(82) Debug(q테스트1) · iPhone 13 mini iOS 1.2.7(61) Debug(BK) · 2026-11-25 08:41~09:10 PHT.
- 앞 설계: `docs/audit/messenger-video-send-audit-design-2026-11-24.md` (PR #578, 운영 반영).

---

## 0. 작업자 잘못 (먼저 보고)

| # | 잘못 | 근거 |
|---|---|---|
| W1 | **승인된 설계와 다르게 구현했다.** 설계 §3-2 는 재생 화면을 「사진 뷰어 셸을 재사용(닫기·저장·전달은 사진과 같은 자리)」으로 정했다. 그런데 웹 `<video>` 에 닫기만 있는 화면을 새로 만들었고, **저장이 없다.** | `components/community-messenger/room/MessengerVideoViewer.tsx` — 닫기 버튼 1개, 저장 없음 |
| W2 | 「최근 사진」 줄에 영상을 넣지 않았다(설계 §3-2). 구현 뒤에 §8 에 적어 보고했지만, 승인 전에 임의로 정한 것이다. | 설계 §8-1 |
| W3 | 재생기를 웹 `<video>` 로 만들었다. 앱이 휴대폰에서 세로로 고정돼 있어 **회전이 처음부터 불가능한 구조**였는데, 확인하지 않았다. | 아래 D2 |
| W4 | 11-24 보고에서 「vitest 전체 1회」라고 했는데 실제로는 절반(1/2)만 돌았다. 그 때문에 CI 실패 2건을 놓쳤다. 11-24 에 정정 보고함. | — |

---

## 1. 결함 (증거 · 판정)

| # | 결함 | 판정 | 증거 |
|---|---|---|---|
| D1 | **영상 저장(다운로드)이 없다.** 재생 화면·말풍선·길게 누르기 메뉴 어디에도 「저장」이 없다. 사진은 사진첩 저장이 있다(`DibayImageViewer` → `saveMessengerPhotosWithFeedback` → 네이티브 `saveImages`, 이미지 전용). | FAIL | 코드: `MessengerVideoViewer.tsx` · `messenger-photo-library.ts` `saveImages(urls)` 는 이미지만 |
| D2 | **회전이 안 된다.** 재생기가 웹 `<video>` 라서 앱 화면 방향을 따른다. 휴대폰은 앱 전체가 세로 고정이다. | FAIL | Android `DibayAppOrientationPolicy.applyToAppShell` → `SCREEN_ORIENTATION_PORTRAIT`. Samsung 실기 `dumpsys activity`: `requestedOrientation=SCREEN_ORIENTATION_PORTRAIT`. iOS `Info.plist` `UISupportedInterfaceOrientations` = Portrait 만, `DibayAppOrientationPolicy` `PHONE_IOS → .portrait` |
| D3 | **재생 화면이 레거시 앱(카톡·텔레그램) 방식이 아니다.** 앱 고유 재생기가 아니라 브라우저 기본 컨트롤(WebView `<video controls>`)이 나온다. 저장·공유·전달·회전 같은 앱 동작을 붙일 자리가 없다. | FAIL | 코드 `MessengerVideoViewer.tsx` |
| D4 | **「최근 사진」 줄에 권한을 허용할 버튼이 없다.** 안내 문구만 있고, 그 문구도 잘린다(실기 캡처: 「사진 접근 권한을 허용하면 최근 사진을 바로 선택할 수」에서 끊김). 누를 곳이 없다. | FAIL | 실기 캡처 s3·s6 · 코드 `CommunityMessengerAttachmentSheet.tsx:669-673` (`min-w-[180px]` 글자 칸, 버튼 없음) |
| D5 | **시트를 열 때마다 시스템 권한 대화상자가 다시 뜬다.** 권한 상태가 `prompt` 이면 시트가 열릴 때마다 요청한다. | FAIL | 실기: 08:54·08:56·08:57 세 번 모두 뜸 · 코드 `CommunityMessengerAttachmentSheet.tsx:205-210` |
| D6 | **Android 14+ 「제한된 액세스 허용」을 허용으로 보지 않는다.** 사용자가 일부 사진만 허용해도 앱은 「권한 없음」으로 보고 계속 다시 묻는다. 줄은 비어 있다. | FAIL (코드) · 실기 NOT_PROVEN (Owner 기기 설정이 바뀌어 누르지 않음) | `MessengerPhotoLibraryPlugin.hasPhotoPermission()` 이 `READ_MEDIA_IMAGES` 만 검사. 기기에는 `READ_MEDIA_VISUAL_USER_SELECTED` 가 선언돼 있음(`dumpsys package`) |
| D7 | **최근 줄에 영상이 없다** (W2). 줄에서 바로 영상을 고를 수 없고, 아래 메뉴 「사진·동영상」으로 들어가야 한다. 줄 끝에 「전체 보기」 칸도 없다. | FAIL | 코드 · 실기 캡처 |
| D8 | **iPhone 에서 영상을 보내지 못했다.** | FAIL · **원인 NOT_PROVEN** | 운영 DB: 09:01 전후 BK 계정의 메시지 0건, 업로드 파일 0개(서버 확정까지 온 요청 없음). 실패 단계(선택·압축·URL 요청·업로드)를 서버에서 알 수 없다 — 클라이언트 실패가 서버에 남지 않는 구조(`runMediaUploadAttempt` 는 안내 문구만 띄움) |
| D9 | 알림 | 판정 보류 | 운영 DB `notification_deliveries`: BK 기기로 08:55:48·08:57:18 PHT `sent`. 코드상 본문 「동영상을 보냈습니다」(`notify_preview_sent_video`), 누르면 방으로 이동(기존 경로). **실제 iPhone 에 뜬 문구·눌렀을 때 이동은 확인 못 함(NOT_PROVEN).** 지시하신 「알림 버튼 눌림」의 뜻을 정확히 확인하지 못했다 — §6 질문 |

**통과한 것 (Samsung 실기 11-25)**
- 보내기·압축(19.3MB → 4.98MB 1280×720)·복사 경로·3분 초과 차단·업로드 중 취소(남은 파일 0)·재생 시작·◁ 정상 경로·목록 「동영상」·임시 파일 정리.

---

## 2. 레거시 앱 분석 (근거 확인함)

근거는 세 가지다:
- **실기**: Samsung SM-M156S 에서 2026-11-25 09:19~09:21 PHT 관찰. 텔레그램에 로그인된 상태에서 보내지 않고 관찰만 했다.
- **설치 앱 권한**: `adb dumpsys package` 로 확인.
- **텔레그램 공개 소스**: DrKLO/Telegram `master`, 2026-11-25 받음. 아래 줄 번호는 받은 시점 기준이다.

카톡은 이 기기에 로그인돼 있지 않아 화면을 관찰하지 못했다. 계정을 만들거나 로그인하지 않았다. 그래서 카톡 근거는 권한 선언만이다.

| 항목 | 텔레그램 | 카톡 | DIBAY 지금 |
|---|---|---|---|
| 미디어 권한 선언 | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` (Manifest 38·39, 실기 dumpsys 동일) | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` + `READ_MEDIA_VISUAL_USER_SELECTED` (26.10.1 실기 dumpsys) | `READ_MEDIA_IMAGES` 만 |
| 권한 요청 시점 | **누를 때만**. 권한이 없으면 갤러리 자리에 안내 화면(제목·설명·「Allow Access」 버튼·「Open Camera」)을 보여 주고, 버튼이나 칸을 눌렀을 때 IMAGES+VIDEO 를 함께 요청 (`ChatAttachAlertPhotoLayout.java` 930–939, 4550–4561, `GalleryEmptyView.java`) | 관찰 못 함 | **시트를 열 때마다 자동 요청**(D5), 버튼 없음(D4) |
| 최근 미디어 | 사진·영상이 섞인 3열 격자, 첫 칸은 실시간 카메라, 영상 칸에 ▶+길이(실기 캡처 t3 · `PhotoAttachPhotoCell.java` 333–338) | 관찰 못 함 | 사진만, 가로 한 줄(D7) |
| 보내기 전 화면 | 해상도·길이·예상 크기(「1280x720, 0:15, ~5.6 MB」), 자르기 막대, 소리 끄기, 회전·자르기, 화질 4단계 막대(기본 3단계=720), 설명 입력 (실기 t4·t7) | 관찰 못 함 | 없음(바로 전송) |
| 기본 압축 | 1080p 원본 → 기본 720p. 720 단계 상한 2.6Mbps (`MediaController.makeVideoBitrate` 7348–7380). 같은 시험 영상 예상 5.6MB | — | 720p · 2Mbps — 같은 영상 실측 4.98MB |
| 재생 | 앱 고유 전체 화면 재생기(ExoPlayer). 탐색바·시간·재생·**전체 화면 버튼**. 메뉴: 갤러리에 저장·공유·전달·답장·삭제·속도·화질 (`PhotoViewer.java` 5897–5926) | — | 웹 `<video>` 기본 컨트롤, 닫기만 |
| 회전 | 전체 화면 버튼을 누르면 재생 화면이 **가로로 전환**되고, 닫으면 원래 방향으로 돌아감 (`PhotoViewer.java` 6058–6076, 18170) | — | 앱이 세로 고정이라 회전 불가(D2) |
| 저장 | 메뉴 「갤러리에 저장」 → MediaStore `Movies/Telegram`. Android 9 이하만 쓰기 권한 요청 (`MediaController.java` 6440, `PhotoViewer.java` 4912–4982) | — | 없음(D1) |
| 알림 누름 | **대화방만 연다.** 알림 intent 에 메시지 id 가 없다 (`NotificationsController.java` `message_id` 0건, `LaunchActivity.java` 3065–3080 은 id 가 있을 때만 그 메시지로 이동) | — | 대화방을 연다(기존 경로) |

## 3. 설계안

### S-A. 네이티브 영상 재생기 (D2·D3 · 레거시 방식)

기존 `MessengerPhotoLibrary` 플러그인에 `openVideoPlayer` 메서드를 추가한다(새 플러그인 등록 없음).

- 입력: 조회 라우트 `?format=json` 으로 받은 서명 URL(7일)과 썸네일, 메시지 id. 재생기가 Range 로 스트리밍하고, **연 뒤에만** 받는다.
- **Android**: 새 Activity `MessengerVideoPlayerActivity` — Media3 ExoPlayer + PlayerView.
  - 방향(R7): 기본은 세로. 전체 화면 버튼 → 가로 고정, 다시 누르거나 닫으면 세로. 시스템 자동 회전이 켜져 있으면 기기 방향도 따른다.
  - `MainActivity` 세로 고정은 그대로다. 닫으면 채팅은 세로로 돌아온다.
  - 상단: 닫기·저장. 하단: 재생·탐색·시간(PlayerView 기본 컨트롤).
- **iOS**: `AVPlayerViewController` 를 전체 화면으로 띄운다.
  - 재생기가 떠 있는 동안에만 `AppDelegate.application(_:supportedInterfaceOrientationsFor:)` 가 `.allButUpsideDown` 을 돌려준다.
  - 그 밖에는 지금처럼 `.portrait` 다. `Info.plist` 에 가로를 추가하되, 루트 화면은 지금처럼 `.portrait` 만 허락한다.
  - 저장은 오른쪽 위 버튼.
- **웹**: 말풍선을 누르면 새 바이너리(헤더에 `openVideoPlayer`)는 네이티브 재생기를 연다. 구 바이너리·브라우저는 지금 웹 뷰어를 쓰되 저장 버튼을 추가한다(S-B 웹 경로).
- **영향 범위**: 통화 화면은 회전 정책의 주인이 아니다(`DibayAppOrientationPolicy` 주석). iOS `supportedInterfaceOrientationsFor` 는 앱 전체 창에 걸리므로 **통화 화면 영향 분석이 필요하다(통화 규정 3)**.
  - 설계: 반환값을 「재생기가 떠 있을 때만」으로 묶고, 그 밖에는 지금 값 그대로다.
  - 통화 코드는 바꾸지 않는다.
  - 실기 검증에 통화 수신·발신 화면 방향 확인을 넣는다.

### S-B. 영상 저장 (D1)

- 네이티브 `saveVideo({ url, fileName })`.
  - Android: 서명 URL → 임시 파일 → `MediaStore.Video` `Movies/DIBAY`. Android 10+ 는 권한 없음, 9 이하는 기존 `WRITE_EXTERNAL_STORAGE`(maxSdk 28)를 쓴다.
  - iOS: `PHPhotoLibrary` addOnly(사진 저장과 같은 권한 흐름) `creationRequestForAssetFromVideo`.
- 진행·완료·실패 안내는 사진 저장 SSOT(`messenger-photo-save-feedback`)를 같이 쓴다. 문구 키는 새로 만든다.
- 진입점은 세 곳이다:
  - 네이티브 재생기 저장 버튼
  - 말풍선 길게 누르기 메뉴 「저장」
  - 웹 뷰어 저장 버튼(구 바이너리: 공유 시트 / 브라우저: `download` 링크)
- 임시 파일은 저장 직후 지운다.

### S-C. 「최근 사진」 줄 (D4~D7)

1. **권한 요청은 사용자가 누를 때만** 한다. 시트를 열 때 자동으로 요청하지 않는다(D5).
2. 권한 상태별 칸:
   - `prompt` → 「사진 접근 허용」 버튼 칸. 누르면 시스템 대화상자.
   - `denied` → 「설정에서 허용」 버튼 칸. 누르면 앱 설정(`openAppSettings`, 이미 있음).
   - `limited` / Android 「제한된 액세스」 → 고른 항목만 보이고 「더 고르기」 칸(D6).
   - 칸 크기는 88px 칸 1개, 2줄 글자 — 잘리지 않는다(D4).
3. **Android 제한된 액세스 인식**: `READ_MEDIA_VISUAL_USER_SELECTED` 가 허용이면 `limited` 로 돌려준다(D6).
4. **영상 포함**(D7):
   - iOS: `PHAsset` 영상도 같은 권한으로 조회하고, 길이 배지를 붙인다.
   - Android: `READ_MEDIA_VIDEO` 를 추가한다(R1 — 카톡·텔레그램과 같음). Play 사진 권한 신고를 동영상까지 넓힌다.
5. 줄 끝에 「전체 보기」 칸 → 시스템 선택기(지금 「사진·동영상」과 같은 동작).

### S-D. iPhone 전송 실패 원인 확정 (D8)

- **추측으로 고치지 않는다.**
- 먼저 진단 장치를 넣는다:
  - 클라이언트가 실패 단계(`pick`·`prepare`·`upload_url`·`put`·`finalize`)와 네이티브 실패 코드를 기존 감시 이벤트(`/api/community-messenger/monitoring/events`)로 1건 보낸다. **실패할 때만** 보내므로 평소 호출은 늘지 않는다.
  - iOS 압축·업로드 실패 지점마다 원인 코드를 돌려준다. 지금은 `transcode_failed` 하나뿐이다.
- 그다음 재현 1회: iPhone 을 Mac 에 연결한 상태에서 `idevicesyslog` 로 기기 로그를 받으며 Owner 가 1번 보낸다(설치 확인 결과 이 Mac 에 있음).
- 원인을 확정한 뒤 수정 설계를 따로 보고한다.

### S-E. 알림 (D9)

- 실기 확인: iPhone 잠금 화면 알림 문구가 「동영상을 보냈습니다」인지, 누르면 그 방이 열리는지.
- 지시하신 「알림 버튼 눌림」이 다른 동작을 뜻하면 §6 답에 따라 설계를 추가한다.

---

## 4. 단계 · 분류

| 단계 | 내용 | 분류 |
|---|---|---|
| 1 | S-D 진단 장치 + R1·R2·R3(Android 권한·CTA·영상 포함·전체) + R9 | 웹 + 네이티브 + Play 신고 갱신 |
| 2 | R4 확인 화면 + R6·R7 네이티브 재생기·회전 + R8 저장 | 네이티브 — **iOS 방향 변경은 통화 영향 분석 문서를 먼저 Owner 승인** |

- 각 단계는 PR 1개로 만들고, 배포 전 보고 → Owner 「병합」 뒤에만 병합한다.
- 네이티브 변경이 있으면 설치 빌드 때 빌드 번호를 올린다.

---

## 5. 검증 (구현 후 · 지금은 모두 NOT_PROVEN)

- V0: 카톡·텔레그램 영상 재생·저장·회전·최근 줄을 실기로 캡처해 요소별 대조.
- 재생기: 세로 ↔ 가로 회전, 닫으면 채팅 세로 유지, ◁ 로 닫기, 탐색, 저장 → 사진첩에 생김(Android·iPhone).
- 최근 줄: 권한 3상태(prompt·denied·limited)마다 칸 표시와 버튼 동작. 시트를 열어도 대화상자 자동 없음.
- iPhone → Samsung 보내기 PASS. 실패 시 감시 이벤트 1건.
- 통화: 수신·발신 화면이 회전하지 않음(iOS 방향 변경 영향).
- 운영 DB: 저장·재생이 메시지·파일 수를 바꾸지 않음. 재생은 연 뒤에만 Storage 요청.

---

## 6. 권장안 (레거시 앱 근거로 확정)

| # | 항목 | 권장안 | 근거 |
|---|---|---|---|
| R1 | Android 권한 | **`READ_MEDIA_VIDEO` 와 `READ_MEDIA_VISUAL_USER_SELECTED` 를 추가해 카톡과 같은 3개를 선언한다.** 「허용」을 누르면 IMAGES+VIDEO 를 함께 요청한다. 일부 허용(USER_SELECTED)은 `limited` 로 보고, 고른 항목만 보여 주며 「더 고르기」 칸을 둔다. Play Console 의 기존 사진 권한 신고에 「채팅 첨부 최근 사진·동영상」을 동영상까지 넓혀 적는다(Owner 가 Play Console 에서 제출). | 카톡 26.10.1·텔레그램 모두 VIDEO 를 선언하고 Play 배포 중(실기 dumpsys). 텔레그램은 IMAGES·VIDEO 를 함께 요청(930–939) |
| R2 | 권한 요청 시점·CTA | 텔레그램 방식을 따른다. 시트를 열 때는 **요청하지 않는다**. 권한이 없으면 줄 자리에 안내 칸을 보여 준다: 제목 「사진·동영상 접근 허용」, 설명 1줄, 버튼 「허용」, 옆에 「카메라」. 거부를 두 번 받으면(시스템이 더는 안 띄움) 버튼을 「설정 열기」로 바꾼다. | 텔레그램 `GalleryEmptyView` · 930–939 · 실기 D5 |
| R3 | 최근 미디어 모양 | **사진·영상을 섞고**, 영상 칸에 ▶+길이를 붙인다. 지금 가로 한 줄 모양(설계 「kakao-parity」)은 유지하고, 줄 끝에 「전체」 칸 → 시스템 선택기. | 텔레그램 실기 t3. 카톡 모양은 관찰 못 해 지금 승인된 모양을 유지 |
| R4 | 보내기 전 화면 | 영상 1개를 고르면 텔레그램처럼 **확인 화면**을 띄운다: 해상도·길이·예상 크기 표시, 재생 미리보기, 「보내기」. 화질 단계·자르기·그리기는 넣지 않는다 — 3분·50MB 상한(승인 O1)이 있어 고화질 단계를 둘 수 없다(1080p 상한 6.8Mbps × 3분 = 153MB). | 텔레그램 실기 t4 · `makeVideoBitrate` |
| R5 | 압축값 | **지금 값 유지**(720p, 2Mbps+128kbps). 텔레그램 기본도 720p(상한 2.6Mbps)이고, 같은 영상이 DIBAY 4.98MB · 텔레그램 예상 5.6MB 로 같은 수준. | 실측 비교 |
| R6 | 재생기 | 네이티브 전체 화면 재생기(Android ExoPlayer — 텔레그램과 같은 엔진 · iOS AVPlayerViewController). 조작: 재생·탐색·시간·**전체 화면(가로) 버튼**·저장·전달(전달은 O6 범위 밖이라 버튼 없음). | 텔레그램 `PhotoViewer` |
| R7 | 회전 | 텔레그램과 같게 한다. 재생 화면의 **전체 화면 버튼 → 가로 고정**, 다시 누르거나 닫으면 세로로 돌아간다. 기기를 돌려서 회전하는 것은 시스템 자동 회전이 켜져 있을 때만. 채팅 화면은 계속 세로다. | `PhotoViewer.java` 6058–6076, 9682–9692, 18170 |
| R8 | 저장 위치 | Android `Movies/DIBAY` (MediaStore, 10+ 권한 없음) · iOS 사진 앱(사진 저장과 같은 DIBAY 앨범 규칙). | 텔레그램 `Movies/Telegram` 과 같은 방식 |
| R9 | 구 바이너리 | 재생은 지금 웹 뷰어를 쓴다. 저장 버튼을 누르면 「앱을 업데이트하면 저장할 수 있어요」 + 스토어 이동. 절반만 되는 우회 저장은 만들지 않는다. | 레거시 앱도 새 기능은 앱 업데이트로만 제공(웹 없음) |
| R10 | 알림 누름 | **대화방을 연다**(지금과 같음, 텔레그램과 같음). 알림 본문은 「동영상을 보냈습니다」. 이번에 바꾸지 않는다. | `NotificationsController` 메시지 id 0건 |
| R11 | 「알림 버튼 눌림」(권한 팝업) | ＋ 를 누를 때마다 뜨는 시스템 권한 팝업은 R2 로 없앤다(누를 때만). | 실기 D5 |

## 7. iPhone 전송 실패 — 원인 확정 단계 (설계 S-D)

서버에 남은 기록이 없어 지금은 원인을 모른다. 그래서 1단계에 포함해 다음 순서로 확정한다:
1. 실패 단계 코드를 서버 감시 이벤트로 남긴다(실패 때만).
2. iPhone 을 Mac 에 연결해 `idevicesyslog` 로 기기 로그를 받으며 1회 재현한다.
3. 원인 줄을 특정한 뒤 수정 설계를 보고한다.

---

## 8. 1단계 구현 기록 (Owner 2026-11-25 「1단계 승인」)

| 항목 | 구현 | 파일 |
|---|---|---|
| S-D 진단 | 실패할 때만 `POST …/videos/failure` 1건 → Vercel 로그 `[messenger-video-send-failure]`(단계·원인 코드·플랫폼·크기·길이). DB 쓰기 없음. iOS·Android 네이티브가 실패 지점별 원인 코드를 돌려준다(`reader_*`·`writer_*`·`transcode_failed_*`·`thumb_failed`·`copy_failed`·`video_http_*`·`video_network_*`·`phasset_*`). | `app/api/.../videos/failure/route.ts` · `messenger-video-upload-client.ts` · `MessengerVideoPrep.java` · `MessengerPhotoLibraryPlugin.swift` |
| R1 | Android `READ_MEDIA_VIDEO`·`READ_MEDIA_VISUAL_USER_SELECTED` 선언. 「허용」 시 사진+영상(14+ 는 제한 접근 포함) 함께 요청. 상태: authorized(사진·영상 둘 다) · limited · prompt · denied(시스템이 더는 안 물음). | `AndroidManifest.xml` · `MessengerPhotoLibraryPlugin.java` |
| R2 | 시트를 열 때 권한 요청 없음. 안내 칸(「사진·동영상 접근 허용」 + 「허용」/「설정에서 허용」). 설정에서 돌아오면 다시 읽음. 제한 접근이면 「더 고르기」(iOS 선택 범위 편집 · Android 시스템 창). | `CommunityMessengerAttachmentSheet.tsx` |
| R3 | 최근 줄에 사진·영상을 날짜순으로 섞고 영상은 길이 배지. 3분 넘는 영상은 고를 때 막음. 줄 끝 「전체」. 고른 최근 영상은 `registerVideos` 로 등록 후 기존 압축·업로드 경로. | 시트 · 두 플러그인(`queryRecentMedia` · `fetchRecentThumbs(includeVideos)` · `registerVideos`) |
| R9 | **이번 단계에서 하지 않음 — 아래 보고** | — |

**R9 를 1단계에서 하지 않은 이유 (Owner 확인 필요)**
- R9 는 「구 바이너리에서 저장을 누르면 업데이트 안내」다.
- 그런데 저장 기능 자체(R8 네이티브 저장)는 2단계다. 1단계 바이너리에는 아직 저장이 없다.
- 1단계에 저장 버튼을 넣으면 **최신 앱을 포함한 모든 사용자에게 「업데이트하면 저장할 수 있어요」가 뜨는데, 받을 업데이트가 아직 없다.**
- 그래서 R9 는 R8 과 함께 2단계로 옮긴다.
