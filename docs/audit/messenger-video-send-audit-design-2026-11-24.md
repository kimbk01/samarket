# 채팅 영상 보내기 — 결함 확인 · 설계안 (2026-11-24)

- 상태: **감사·설계만 했고 구현은 하지 않았다.** Owner 승인 전에는 코드·DB·네이티브를 바꾸지 않는다.
- 조사 기준: `origin/main` `e32d53ab6`, 운영 DB `ckdosyydvgzqwpbwuhon`(읽기 전용 조회), 2026-11-24 PHT.
- 범위: 사용자 채팅 3종. 거래 채팅과 배달·매장 주문 채팅도 실제로는 메신저 방 화면(`/community-messenger/rooms/[id]`)에서 열린다(`app/(main)/chats/[roomId]/page.tsx:66-79`). 그래서 메신저 한 곳만 구현하면 3종에 모두 적용된다.
- 통화 코드와의 관계: 통화 관련 코드(`call*`, `lib/push/**` 통화 발송, CallKit, Agora)는 건드리지 않는다. 통화 변경 규정은 적용 대상이 아니다.

---

## 1. 확인한 결함

증거 종류는 코드(파일:줄) 또는 운영 DB 조회 결과로 적었다.

| # | 결함 | 판정 | 증거 |
|---|---|---|---|
| D1 | 첨부 시트에 **영상 보내기가 없다.** 메뉴는 「사진」「선물」 두 가지뿐이다. | FAIL | `lib/community-messenger/attachment/attachment-action-capability.ts:9,38-40` — `actions = ["photo", (gift)]` |
| D2 | 갤러리에서 고를 때도 **이미지 형식만** 받는다. | FAIL | `CommunityMessengerAttachmentSheet.tsx:390` `accept="image/jpeg,image/png,image/webp,image/gif"`, `:397` 카메라 `accept="image/*"` |
| D3 | 네이티브 사진 라이브러리(최근 사진 줄·선택기)가 **이미지만** 조회한다. 영상 길이와 영상 썸네일 기능도 없다. | FAIL | Android `MessengerPhotoLibraryPlugin.java:101-112,139-147` `MediaStore.Images`, `:160-162` `ACTION_PICK_IMAGES`(영상 타입 지정 없음) · iOS `MessengerPhotoLibraryPlugin.swift:312` `filter = .images`, `:473` `fetchAssets(with: .image)` |
| D4 | 메시지 종류에 `video` 가 없다. DB CHECK 제약에도 없다. | FAIL | `lib/community-messenger/types.ts:15-21` · 운영 `community_messenger_messages_message_type_check` = text·image·file·system·call_stub·voice·sticker·community_post_share·gift_certificate |
| D5 | 우회 경로만 있다. 1:1 방 ⋮ 메뉴의 「파일」로 mp4 를 보낼 수는 있다. 하지만 **15MB 상한**이 있고, 화면에는 재생 없이 문서 아이콘 파일 카드로 나온다. 그룹 방에는 이 버튼조차 없다. | FAIL (영상 경험 없음) | `messenger-file-upload-policy.ts:9,29` · `MessengerTimelineBubbleInners.tsx:119-180` · `ChatRoomMoreMenu.tsx:306-312` → `use-messenger-room-phase2-controller.ts:1874-1877` |
| D6 | 운영에 영상 메시지가 **0건**이다. 파일 메시지는 누적 34건이고 최근 30일은 0건이다. | 사실 확인 | 운영 DB: `message_type` 별 건수와 `metadata` 의 `video/` 포함 건수 = 0. `messenger-media` 버킷 안 영상 객체 = 0 |
| D7 | 지금 큰 파일 경로(staged 업로드)는 **서버 함수가 파일 전체를 메모리로 내려받은 뒤 다시 올린다.** 영상에 그대로 쓰면 함수 메모리와 시간, Storage 송신량이 두 배가 된다. | 설계 제약 (영상에 재사용 금지) | `messenger-media-upload-send.ts:206-225` `takeMessengerStagedObject` → `download` → `Buffer` → `:158` `upload` |
| D8 | 버려진 staging 파일은 **같은 사용자가 같은 방에서 다시 업로드할 때만** 정리된다. 그 사용자가 다시 올리지 않으면 영구히 남는다. | 잠재 누수 (지금 staging 잔존 0) | `messenger-media-upload-send.ts:295` 이 유일한 `purgeStaleMessengerStagingObjects` 호출. 메신저 미디어 정리 cron 없음(`vercel.json`) · 운영 staging 객체 0 |
| D9 | **운영 저장소에 고아 파일이 있다.** 「모두에게서 삭제」된 사진 1건의 원본·미리보기·썸네일 3개(0.89MB)가 지워지지 않고 남아 있다. | FAIL (원인은 NOT_PROVEN) | 운영: `messenger-media` 148개 중 3개가 어떤 메시지에도 연결되지 않음. 해당 메시지 = 2026-11-14 03:37 PHT 생성, `deleted_for_everyone_at` 04:14 PHT, `metadata={}`. 현재 코드(`service.ts:19468-19490`)는 DB 갱신 뒤 purge 하므로 같은 원인이 남아 있는지는 확인 못 함. 당시 Vercel 로그 `remove_failed` 가 있는지도 확인 못 함 |
| D10 | 방 나가기, 회원 삭제, 방 삭제 때는 메신저 첨부를 **지우지 않는다.** 사진·파일·음성 공통이다. | 범위 밖 결함 (보고만) | `service.ts:12571-12594` 나가기 = 참가자 행만 삭제 · `lib/admin/admin-user-deletion.ts:117` 미디어 정리 없음 |

### 현재 운영 수치 (읽기 전용 조회)

- `messenger-media` 버킷: 비공개, 파일 1개 상한 **50MB**(`file_size_limit=52428800`), 객체 148개, **38.9MB**.
- 최근 30일 사진 메시지는 61건이다. 지금 저장소 사용량은 사진이 대부분이다. 영상이 들어오면 몇 배로 늘어나는 구조이고, 그래서 아래 §3-5 계약이 필수다.
- 설치된 앱 버전(최근 30일 활성 기기): Android 1.2.5(20)~1.2.7(81), iOS 1.2(22)~1.2.7(60). 웹 화면은 서버에서 받아 오므로(`capacitor.config.ts` `server.url`) **구 바이너리에도 새 웹 UI 가 나간다.** 그래서 네이티브 압축 기능이 없는 구 바이너리용 경로가 필요하다(§3-7).

---

## 2. 카톡·텔레그램 영상 보내기 분석

**출처 한계 먼저 밝힌다.** 카카오 고객센터와 Telegram 의 공식 문서는 이번 검색에서 찾지 못했다. 아래 수치는 언론·블로그·Telegram 버그 트래커 기준이고, 두 앱을 실기기로 캡처한 대조는 하지 않았다. 그래서 수치는 **참고값(NOT_PROVEN)** 이다. 구현 전에 실기 캡처 대조를 1회 해서 확정한다(§6).

| 항목 | 카카오톡 | 텔레그램 |
|---|---|---|
| 진입 | ＋ → 앨범. 사진과 영상이 한 목록에 섞여 있고, 영상 칸에는 길이 배지가 붙는다 | 📎 → 갤러리. 사진·영상 한 목록, 영상 칸에 길이 배지 |
| 기본 전송 | 압축해서 보냄. 화질 선택(일반·고화질) 설정이 있다는 자료가 있다 | 압축(재인코딩)해서 보냄. 「파일로 보내기」를 고르면 원본 그대로 |
| 상한 | 파일 1개 300MB. 톡클라우드 구독자는 1GB([inews24](https://inews24.com/view/1999617)) | 2GB, Premium 은 4GB(제3자 자료) |
| 보내는 중 | 말풍선이 먼저 뜨고 썸네일 위에 진행률 원과 취소 버튼이 보인다 | 같음. 압축 중과 업로드 중 진행률이 보이고 취소할 수 있다 |
| 받은 말풍선 | 썸네일 + ▶ + 길이. 자동재생하지 않는다 | 썸네일 + ▶ + 길이. 설정에 따라 자동 다운로드 |
| 재생 | 누르면 전체 화면 플레이어(재생·탐색·저장·공유) | 말풍선 안 재생 또는 전체 화면, 스트리밍 재생 |
| 원본 화질 | 「파일」로 보내면 압축하지 않는다([extrememanual](https://extrememanual.net/53042)) | 「파일로 보내기」([online-tech-tips](https://www.online-tech-tips.com/how-to-use-telegram-to-send-high-quality-photos-videos/)) |

**두 앱의 공통 구조는 다음과 같고, 이것을 DIBAY 에 적용한다.**

1. 사진과 영상을 **한 갤러리**에서 고른다. 영상 칸에는 길이 배지를 붙인다.
2. **기본은 압축**해서 보낸다. 원본은 「파일」 경로로 분리한다.
3. 말풍선이 **바로** 뜬다(낙관적 표시). 썸네일 위에 진행률과 취소를 보여 준다.
4. 받는 쪽 말풍선은 **썸네일만** 받는다. 영상 본문은 **눌렀을 때만** 스트리밍한다.

---

## 3. 설계안

### 3-1. 단일 정의(SSOT) 파일

| 파일 | 하는 일 |
|---|---|
| `lib/community-messenger/upload/messenger-video-upload-policy.ts` (신규·순수) | 영상 상한(바이트·길이), 허용 형식(mp4·mov 입력 → 결과는 항상 mp4), 압축 목표(해상도·비트레이트), 썸네일 규칙, 오류 코드. 클라이언트·서버·네이티브 호출부가 이 파일의 값만 쓴다 |
| `docs/messenger-video-send-ssot.md` (신규) | UI·UX·CTA 계약 문서. 아래 3-2~3-6 을 옮긴다. 검사 스크립트 `verify:messenger-video-ssot` 는 Owner 승인 시 추가 |
| `attachment-action-capability.ts` | 메뉴 액션 단일 정의. `photo` 의 이름을 「사진·동영상」으로 바꾸고 액션 id 는 유지한다(호출처 호환) |

### 3-2. UI·CTA (화면별)

| 화면 | 지금 | 바뀐 뒤 |
|---|---|---|
| 첨부 시트 최근 줄 | 사진만 나옴 | 사진과 영상이 섞여 나온다. 영상 칸에는 오른쪽 아래에 `0:42` 길이 배지가 붙는다. 선택 번호는 지금 방식 그대로 |
| 첨부 시트 카메라 칸 | 사진 촬영 | 그대로 둔다(영상 촬영 추가 여부는 **Owner 결정 O5**) |
| 첨부 메뉴 이름 | 「사진」 | 「사진·동영상」 (키 `cm_ui_attach_photo_video`, ko·en 동시) |
| 섞어서 고르기 | — | 사진은 지금처럼 앨범으로 묶는다. **영상은 1개당 메시지 1건**이다(카톡과 같음). 선택 상한은 지금의 10개를 합산 |
| 보내기 버튼 | 「보내기」 | 그대로 둔다. 영상이 상한을 넘으면 선택할 때 바로 안내하고 그 칸을 막는다 |
| 보내는 중 말풍선 | — | 썸네일 + 가운데 **진행률 원** + 원 안에 **✕(취소)**. 압축 단계와 업로드 단계를 한 원에 이어서 표시한다 |
| 실패 말풍선 | 사진과 같은 재시도 | 같은 「다시 보내기·삭제」. 재시도할 때는 압축 결과를 재사용한다(다시 압축하지 않음) |
| 받은·보낸 말풍선 | — | 썸네일(비율 유지, 사진 말풍선 크기 규칙 재사용) + 가운데 ▶ + 왼쪽 아래 길이. **자동재생과 자동 다운로드는 하지 않는다** |
| 재생 | — | 말풍선을 누르면 전체 화면 뷰어가 열린다. `<video controls playsInline preload="none" poster=썸네일>`. 사진 뷰어 셸을 재사용한다(닫기·저장·전달은 사진과 같은 자리) |
| 방 목록과 알림 미리보기 | — | 「동영상」 (키 `cm_home_preview_video`, 푸시 본문도 같은 키, 서버는 요청 언어로) |
| 답장 미리보기 | — | 썸네일 + 「동영상」 |

※ 통화 CTA·PiP·Dock 과는 관계가 없다(`dibay-call-minimized-surface-cta-ssot` 대상 아님).

### 3-3. 데이터 계약

- `message_type = 'video'` 를 새로 둔다. **DB CHECK 제약 변경이 필요하고 운영 DB 적용은 Owner 승인 대상이다.** 기존 `file` 에 영상을 섞는 방식은 쓰지 않는다. 그렇게 하면 미리보기·답장·알림 문구가 「파일」로 나오고 재생 분기가 MIME 추측에 의존하게 된다.
- `metadata`(서버만 기록):
  `storage_bucket`, `storage_path`(영상), `storage_paths`([영상, 썸네일]), `video_thumb_path`, `mimeType: "video/mp4"`, `video_duration_ms`, `video_width`, `video_height`, `file_size_bytes`, `image_blur`(썸네일 흐린 미리보기 — 사진과 같은 규칙).
- 경로: `{userId}/community/messenger-video/{roomId}/{uuid}.mp4`, 썸네일은 `{uuid}.thumb.jpg`. purge 수집기가 `storage_paths` 를 읽으므로 **삭제 시 영상과 썸네일이 함께 지워진다.**

### 3-4. 전송 경로 (서버가 파일을 내려받지 않음 — D7 회피)

```
① 고르기 → ② (네이티브) 압축 + 썸네일 생성 → ③ POST …/videos/upload-url
   (서버: 송신 가드 · 상한 사전 검사 · 서명 업로드 URL 2개 발급 · 최종 경로)
→ ④ 클라이언트가 Storage 로 영상·썸네일 직접 PUT (진행률 = XHR upload progress, 취소 = abort)
→ ⑤ POST …/videos {path, thumbPath, durationMs, w, h, clientMessageId}
   (서버: 객체 존재·크기를 Storage 메타로 확인 · 앞 64바이트만 Range 로 읽어 ISO-BMFF(ftyp) 서명 확인 ·
    썸네일 JPEG 서명 확인 · 길이·크기 범위 검사 · 메시지 INSERT(cid 멱등) · 서버 bump)
→ 실패·거절·deduped → 이번 업로드 두 파일 즉시 purge
```

- 호출 수: 영상 1건에 **API 2회**(upload-url, 확정) + Storage PUT 2회다. 진행률 폴링은 없다.
- 확정 단계에서 서버가 읽는 양은 64바이트뿐이다. 함수 메모리와 시간은 파일 크기와 관계없이 일정하다.
- 취소: ④ 중에 취소하면 PUT 을 abort 하고, 이미 올라간 객체는 `DELETE …/videos/upload` 1회로 정리한다. 정리에 실패해도 3-5 의 GC 가 회수한다.
- 비율 제한: 기존 파일 업로드와 같은 1분 20회. 영상 전용 키를 쓴다.

### 3-5. 저장 공간 · 불필요 호출 · 누수 계약 (필수)

| 위험 | 계약 |
|---|---|
| 원본 그대로 저장 | **압축 결과만 저장한다.** 원본은 서버로 보내지 않는다. 압축 목표는 O1 |
| 1개당 용량 폭주 | 압축 후 상한 = 버킷 한도 50MB 이내(O1). 서버 확정 단계에서 실제 크기로 다시 검사한다 |
| 자동 다운로드·자동재생 | 하지 않는다. 말풍선은 썸네일(수십 KB)만 받고, 영상 본문은 재생을 누를 때만 받는다(`preload="none"`) |
| 재생 때마다 재서명 | 기존 미디어 라우트(302 → 7일 서명 URL, 302 캐시 6일)를 그대로 쓴다. 탐색(Range)은 Supabase 로 직접 가고 Vercel 을 거치지 않는다 |
| 업로드 후 메시지 미생성(앱 종료·네트워크 단절) | **매일 1회 GC cron**: 생성 24시간이 지났는데 어느 메시지에도 연결되지 않은 `messenger-video/` 객체를 삭제한다. 선례: `store-product-images-orphan-gc`, `community-post-images-gc`. 요청 예산(`lib/perf/request-budget.ts`)에 cron 1건을 추가한다 |
| 모두에게서 삭제 | 기존 purge 가 `storage_paths` 로 영상과 썸네일을 함께 지운다. 테스트로 고정한다 |
| D9 같은 삭제 후 잔존 | 위 GC 가 영상 고아도 회수한다. 사진 고아 D9 는 이번 범위가 아니다(보고만) |
| 사진 자동 저장 | 영상은 자동 저장 대상에서 **제외**한다(`messenger-image-auto-save*` 는 image 만 다룬다는 것을 테스트로 고정) |
| 전달하기 | 이번 범위가 아니다. 영상 전달은 별도 단계(O6) |

### 3-6. 압축 (네이티브)

- Android: Media3 `Transformer` 로 H.264/AAC mp4 를 만든다. 썸네일은 `MediaMetadataRetriever` 로 첫 프레임 JPEG 를 만든다.
- iOS: `AVAssetExportSession`(H.264 프리셋) 으로 mp4 를 만든다. 썸네일은 `AVAssetImageGenerator` 로 만든다.
- 기존 `MessengerPhotoLibraryPlugin` 에 메서드를 추가한다: 영상 조회(최근 목록 영상 포함·길이), `transcodeVideo`(진행률 이벤트·취소), 썸네일 생성. 플러그인 id 는 그대로 둔다.
- **네이티브 변경이므로 Android versionCode 와 iOS 빌드 번호를 올리고 재빌드·재설치가 필요하다.**

### 3-7. 구 바이너리 호환 (웹은 이미 새 화면을 받음)

- 새 메서드가 있는지 `Capacitor.isPluginAvailable` + 메서드 존재 여부로 판정한다.
- **없으면(구 바이너리·웹 브라우저)**: 압축 없이 웹 `<input accept="video/mp4,video/quicktime">` 로 받는다. 썸네일은 브라우저 `<video>` 첫 프레임을 canvas 로 떠서 JPEG 로 만든다. 업로드 상한은 같은 50MB 로 제한하고, 넘으면 「앱을 업데이트하면 더 긴 영상을 보낼 수 있어요」를 안내한다(키로만). 이 경로를 막을지 허용할지는 **O4**.

---

## 4. 구현 단계 (승인 후 · 단계마다 화면이 깨지지 않게)

| 단계 | 내용 | 분류 | 승인 |
|---|---|---|---|
| S1 | DB: `message_type` CHECK 에 `'video'` 추가 (+ 목록 미리보기·알림 함수가 type 을 분기한다면 함께) | DB | **운영 DB 적용 Owner 승인** |
| S2 | 웹·서버: 정책 SSOT, `videos/upload-url`·`videos` 확정·취소 라우트, 말풍선·뷰어·미리보기·i18n, 웹 대체 경로(3-7), GC cron, 테스트 | 웹 | S1 적용 뒤 병합 (적용 전 병합 시 INSERT 거절 → 그래서 순서 고정) |
| S3 | 네이티브: 영상 조회·압축·썸네일 + 빌드 번호 증가 | 네이티브 | 재빌드·재설치 |
| S4 | 실기 행렬(§6) | — | — |

각 단계 PR 은 만든 뒤 **배포 전 보고**하고 자동 병합은 등록하지 않는다. Owner 의 「병합」 뒤에만 병합한다.

---

## 5. Owner 결정 필요 (계약에 없는 값 — 제안값만 적음)

| # | 항목 | 제안 | 근거 |
|---|---|---|---|
| O1 | 압축 목표와 상한 | 긴 변 1280px(720p), 영상 약 2Mbps + 음성 128kbps → **1분 ≈ 16MB**. **최대 길이 3분**(≈ 48MB, 버킷 한도 50MB 이내 · 버킷 설정 변경 없음) | 카톡·텔레그램 모두 기본 압축. 지금 50MB 버킷 한도 유지 |
| O2 | 대상 방 | 1:1·그룹·거래·주문 모두 (사진과 같은 `canUploadAttachments` 규칙) | 3종이 같은 방 화면을 씀 |
| O3 | 원본 화질 보내기 | 이번에는 하지 않는다(「파일」 15MB 경로는 그대로 둠) | 저장 공간 보호 |
| O4 | 구 바이너리·웹에서 압축 없이 보내기 | 50MB 이하만 허용 | 3-7 |
| O5 | 카메라 칸에서 영상 촬영 | 이번에는 하지 않는다 | 범위 최소화 |
| O6 | 영상 전달하기 | 이번에는 하지 않는다 | 전달 1단계가 text·sticker 만 지원 |
| O7 | 영상 보관 기간 | 없음(메시지 삭제 시에만 삭제) — 사진과 같음 | 기존 정책과 같게 |

---

## 6. 검증 항목 (구현 후 · 지금은 모두 NOT_PROVEN)

- 코드: 정책 단위 테스트, 확정 라우트(크기·서명·경로 소유·cid 멱등·거절 시 purge), purge 수집기가 영상과 썸네일을 모두 포함하는지, GC 가 연결된 객체를 지우지 않는지, 자동 저장에서 영상이 빠지는지.
- 운영 DB: 전송 1건마다 `storage.objects` 2개(영상·썸네일) ↔ 메시지 1행이 1:1 인지 · 모두에게서 삭제 후 0개 · 취소 후 0개(또는 24시간 뒤 GC 로 0개).
- 실기(Owner 계정·휴대폰): Android↔iPhone 보내기·받기 / 1:1·그룹·거래·주문 방 / 압축 진행률·취소 / 3분 초과 차단 / 재생·탐색 / 목록·알림 「동영상」 / 구 바이너리 대체 경로. 앱 실행 횟수 10회 상한 안에서 하고, 횟수는 보고서에 적는다.
- 카톡·텔레그램 실기 캡처 대조 1회(§2 참고값 확정).

---

## 7. 범위 밖 결함 (이번에 고치지 않음 · 보고만)

- D9: 운영에 「모두에게서 삭제」된 사진의 고아 파일 3개(0.89MB). 원인 NOT_PROVEN.
- D10: 방 나가기·회원 삭제·방 삭제 때 메신저 첨부를 지우지 않음(사진·파일·음성 공통).
- 레거시 `/chats` 입력창(`components/chats/ChatInputBar.tsx`)은 이미지만 받는다. 거래·주문 방은 메신저로 redirect 되므로 이번 대상이 아니다.

---

## 8. 구현 기록 (Owner 2026-11-24 「제안값대로 승인」 → 같은 날 구현)

브랜치 `feat/messenger-video-send` · PR 1개(S1 DB 파일 + S2 웹·서버 + S3 네이티브). **운영 DB 적용·병합은 Owner 지시 뒤.**

| 설계 항목 | 구현 | 파일 |
|---|---|---|
| SSOT 정책(O1 3분·50MB·720p·2Mbps) | 구현 | `lib/community-messenger/upload/messenger-video-upload-policy.ts` |
| `video` 메시지 종류 + 방 미리보기 「동영상」 | 구현. DB 함수는 운영 정의를 읽어 **한 줄만** 추가하는 방식(정의가 다르면 중단) | `supabase/migrations/20271124150000_messenger_video_message_type.sql` |
| 업로드(서버는 파일을 내려받지 않음) | upload-url → 직접 PUT → 확정(Storage 메타 + 앞 64바이트만) | `lib/community-messenger/server/messenger-video-upload-send.ts`, `app/api/community-messenger/rooms/[roomId]/videos/**` |
| 취소 ✕ | PUT·압축 중단 + `DELETE …/videos` 1회(메시지가 이미 가리키면 지우지 않음) | 위 + `messenger-video-upload-client.ts` |
| 고아 GC | 하루 1회 04:10 PHT, 24시간 지난 미연결 영상·썸네일, 1회 최대 200 | `app/api/cron/messenger-video-orphan-gc/route.ts`, `vercel.json` |
| 말풍선·진행률·재생 뷰어 | 구현. 자동재생·자동 다운로드 없음, `preload="none"` | `components/community-messenger/room/MessengerChatVideoBubble.tsx`, `MessengerVideoViewer.tsx` |
| 미리보기(목록·알림·거래·배달 목록·답장 인용) | 구현 | `cm-home-list-copy.ts`, `cm-service-copy.ts`, `trade-chat-list/view-model.ts`, `delivery-chat-list-preview.ts`, `MessengerTimelineVirtualRow.tsx` |
| 네이티브 압축·썸네일·직접 PUT | Android Media3 Transformer 1.8.0 · iOS AVAssetReader/Writer. 이미 목표 이하인 H.264 mp4 는 복사만 | `MessengerVideoPrep.java`, `MessengerPhotoLibraryPlugin.java/.swift` |
| 구 바이너리·웹 대체(O4) | 압축 없이 mp4·mov 50MB·3분 이하 | `messenger-video-web.ts`, 첨부 시트 |
| 영상 자동 저장 제외 | 자동 저장 경로는 `image` 만 다룸(변경 없음) | — |
| 전달하기(O6) | 영상은 전달 불가(정책 그대로) | `message-share-policy.ts` (변경 없음, 테스트로 고정) |

**설계와 다르게 한 것 (Owner 확인 필요)**

1. **첨부 시트 「최근 사진」 줄에는 영상을 넣지 않았다.** Android 는 기기 영상 목록을 읽으려면 새 권한 `READ_MEDIA_VIDEO` 가 필요하고, Google Play 의 사진·동영상 권한 신고 대상이 된다. 그래서 영상은 「사진·동영상」 선택기(시스템 선택기, 추가 권한 없음)로만 고른다. iOS 도 같은 화면이 되도록 맞췄다.
2. **구 바이너리 전용 「동영상」 칸**을 카메라 칸 옆에 추가했다. 구 바이너리의 네이티브 사진 선택기는 영상을 고르지 못하므로, 웹 선택기로 영상만 고르는 입구가 필요했다. 새 바이너리·웹 브라우저에는 이 칸이 나오지 않는다.
3. 영상을 올리는 동안 **입력창을 막지 않는다**(사진·파일은 보내는 동안 막는다). 업로드가 길기 때문이고, 카톡·텔레그램과 같다.
