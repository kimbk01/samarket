import AVFoundation
import Capacitor
import Foundation
import ImageIO
import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/**
 * Messenger attachment photo library — recent strip + PHPicker multi-select.
 * JS: MessengerPhotoLibrary
 */
@objc(MessengerPhotoLibraryPlugin)
public class MessengerPhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
  public let identifier = "MessengerPhotoLibraryPlugin"
  public let jsName = "MessengerPhotoLibrary"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getPermissionState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getRecentPhotos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pickPhotos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolvePhotos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getSaveCapabilities", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "saveImages", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "prepareVideo", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "uploadPreparedVideo", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancelVideo", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "releaseVideo", returnType: CAPPluginReturnPromise),
  ]

  private var pendingPickCall: CAPPluginCall?
  /// 채팅 영상 — pickPhotos({ includeVideos: true }) 일 때만 true
  private var pendingPickIncludesVideos = false
  private lazy var videoPrep = MessengerVideoPrep { [weak self] id, phase, progress in
    self?.notifyListeners("videoProgress", data: ["id": id, "phase": phase, "progress": progress])
  }
  private let thumbMaxPx: CGFloat = 256
  private let fullMaxEdge: CGFloat = 1920
  /// 전체 접근(.readWrite == .authorized)이 이미 있을 때만 쓰는 사용자 앨범 이름.
  private static let saveAlbumTitle = "DIBAY"
  /// 동시 저장(수동 저장 + 자동 저장)이 앨범을 두 번 만들지 않도록 앨범 경로를 직렬화.
  private let saveAlbumLock = NSLock()

  /// JS feature probe — 구버전 바이너리는 이 메서드가 없어 reject → 저장 버튼을 숨긴다.
  @objc func getSaveCapabilities(_ call: CAPPluginCall) {
    call.resolve([
      "saveImages": true,
      "version": 2,
      "album": canUseSaveAlbum() ? MessengerPhotoLibraryPlugin.saveAlbumTitle : "camera_roll",
      "openAppSettings": true,
    ])
  }

  /// 앱 설정 화면 열기(사진 권한 거부 안내용). 권한 요청 없음. resolve {opened: Bool}.
  @objc func openAppSettings(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        call.resolve(["opened": false])
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in
        call.resolve(["opened": opened])
      }
    }
  }

  /**
   * 앨범(DIBAY) 사용 가능 = 사용자가 이미 **전체 사진 접근(.readWrite == .authorized)** 을 허용한 경우만.
   * 이 판정은 권한을 요청하지 않는다(추가 팝업 없음). addOnly / limited / 미결정 → 카메라 롤에만 저장.
   */
  private func canUseSaveAlbum() -> Bool {
    return PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized
  }

  /// 기존 사용자 앨범 "DIBAY" 조회(전체 접근일 때만 호출). 없으면 nil.
  private func fetchSaveAlbum() -> PHAssetCollection? {
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "localizedTitle = %@", MessengerPhotoLibraryPlugin.saveAlbumTitle)
    let result = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: options)
    return result.firstObject
  }

  /**
   * 메신저 사진을 사진첩(Photo Library)에 원본 바이트 그대로 저장한다 (재인코딩 없음 → 화질·EXIF 방향 유지).
   * 권한: add-only (readWrite 는 절대 요청하지 않는다). 전체 접근(.readWrite == .authorized)이 이미 있으면
   * "DIBAY" 앨범에도 넣고, 아니면 카메라 롤에만 저장. 결과는 index 별 saved / failed(reason) 로 돌려준다.
   */
  @objc func saveImages(_ call: CAPPluginCall) {
    let rawUrls = call.getArray("urls", String.self) ?? []
    let urls = Array(rawUrls.prefix(30))
    if urls.isEmpty {
      call.reject("urls_required")
      return
    }
    requestAddOnlyAuthorization { [weak self] granted, permission in
      guard let self = self else { return }
      if !granted {
        let failed: [[String: Any]] = urls.indices.map { ["index": $0, "reason": "permission_denied"] }
        call.resolve(["saved": [Int](), "failed": failed, "permission": permission])
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        var saved: [Int] = []
        var failed: [[String: Any]] = []
        /** 배치 시작 시 1회 판정 — 전체 접근이 이미 있을 때만 앨범 사용(권한 요청 없음). */
        let useAlbum = self.canUseSaveAlbum()
        for (index, raw) in urls.enumerated() {
          guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            failed.append(["index": index, "reason": "invalid_url"])
            continue
          }
          guard let data = self.downloadImageData(url), !data.isEmpty else {
            failed.append(["index": index, "reason": "download_failed"])
            continue
          }
          guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else {
            failed.append(["index": index, "reason": "not_image"])
            continue
          }
          let reason = self.addImageToLibrary(data, source: source, fileName: url.lastPathComponent, useAlbum: useAlbum)
          if let reason = reason {
            failed.append(["index": index, "reason": reason])
          } else {
            saved.append(index)
          }
        }
        DispatchQueue.main.async {
          call.resolve([
            "saved": saved,
            "failed": failed,
            "permission": permission,
            "album": useAlbum ? MessengerPhotoLibraryPlugin.saveAlbumTitle : "camera_roll",
          ])
        }
      }
    }
  }

  private func requestAddOnlyAuthorization(_ completion: @escaping (Bool, String) -> Void) {
    let current = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    switch current {
    case .authorized, .limited:
      completion(true, "granted")
    case .denied, .restricted:
      completion(false, "denied")
    case .notDetermined:
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        DispatchQueue.main.async {
          let ok = status == .authorized || status == .limited
          completion(ok, ok ? "granted" : "denied")
        }
      }
    @unknown default:
      completion(false, "denied")
    }
  }

  private func downloadImageData(_ url: URL) -> Data? {
    var request = URLRequest(url: url)
    request.timeoutInterval = 30
    let semaphore = DispatchSemaphore(value: 0)
    var result: Data?
    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      defer { semaphore.signal() }
      guard error == nil, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
      result = data
    }
    task.resume()
    if semaphore.wait(timeout: .now() + 45) == .timedOut {
      task.cancel()
      return nil
    }
    return result
  }

  /// Photos 가 원본 바이트 그대로 받는 형식(UTI). 메신저 썸네일·프리뷰(원본 없는 옛 메시지의 저장 대상)와
  /// WebP 원본은 여기 없다 — PHAssetCreationRequest 가 WebP 리소스를 거부할 수 있어(OS 버전별 상이)
  /// JPEG/PNG 로 변환해 저장한다. Android(MediaStore)는 WebP 를 그대로 저장한다.
  private static let photosDirectTypes: Set<String> = [
    "public.jpeg", "public.png", "public.heic", "public.heif", "com.compuserve.gif",
  ]

  /**
   * 사진첩 저장 진입점 — 직접 지원 형식은 원본 바이트 그대로(화질·메타데이터 유지),
   * 그 외(WebP 등)는 JPEG(알파 있으면 PNG)로 변환해 저장. 직접 저장이 save_failed 면 변환본으로 1회 재시도.
   * 타임아웃은 커밋 여부를 알 수 없으므로 재시도하지 않는다(중복 저장 방지).
   */
  private func addImageToLibrary(_ data: Data, source: CGImageSource, fileName: String, useAlbum: Bool) -> String? {
    let type = CGImageSourceGetType(source) as String? ?? ""
    if MessengerPhotoLibraryPlugin.photosDirectTypes.contains(type) {
      let direct = addImageDataToLibrary(data, fileName: fileName, useAlbum: useAlbum)
      if direct == nil || direct == "save_timeout" { return direct }
    }
    guard let converted = transcodeForPhotos(source) else { return "encode_failed" }
    let base = (fileName as NSString).deletingPathExtension
    let name = (base.isEmpty ? "DIBAY_\(Int(Date().timeIntervalSince1970))" : base) + "." + converted.ext
    return addImageDataToLibrary(converted.data, fileName: name, useAlbum: useAlbum)
  }

  /// 첫 프레임을 JPEG(불투명) / PNG(알파) 로 인코딩. EXIF 방향은 원본 속성에서 그대로 옮긴다.
  private func transcodeForPhotos(_ source: CGImageSource) -> (data: Data, ext: String)? {
    guard let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
    let hasAlpha: Bool
    switch image.alphaInfo {
    case .none, .noneSkipFirst, .noneSkipLast:
      hasAlpha = false
    default:
      hasAlpha = true
    }
    let type = hasAlpha ? UTType.png : UTType.jpeg
    let out = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(out as CFMutableData, type.identifier as CFString, 1, nil) else {
      return nil
    }
    var props: [CFString: Any] = [:]
    if !hasAlpha {
      props[kCGImageDestinationLossyCompressionQuality] = 0.95
    }
    if let sourceProps = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
       let orientation = sourceProps[kCGImagePropertyOrientation] {
      props[kCGImagePropertyOrientation] = orientation
    }
    CGImageDestinationAddImage(destination, image, props as CFDictionary)
    guard CGImageDestinationFinalize(destination), out.length > 0 else { return nil }
    return (out as Data, hasAlpha ? "png" : "jpg")
  }

  /// 원본 데이터를 그대로 자산으로 추가. 실패 시 reason, 성공 시 nil.
  /// useAlbum 이면 같은 performChanges 안에서 "DIBAY" 앨범(없으면 생성)에도 넣는다.
  /// 앨범 단계가 실패하면 자산만 카메라 롤에 저장하는 기본 경로로 1회 재시도한다(저장 성공으로 집계).
  private func addImageDataToLibrary(_ data: Data, fileName: String, useAlbum: Bool) -> String? {
    if useAlbum {
      saveAlbumLock.lock()
      let albumResult = performAssetCreation(data, fileName: fileName, useAlbum: true)
      saveAlbumLock.unlock()
      if albumResult == nil || albumResult == "save_timeout" {
        /** 성공, 또는 타임아웃(커밋 여부 불명 — 재시도하면 중복 저장 위험) → 그대로 반환. */
        return albumResult
      }
      /** performChanges 는 원자적: 실패 시 자산도 추가되지 않았다 → 카메라 롤 전용으로 재시도. */
    }
    return performAssetCreation(data, fileName: fileName, useAlbum: false)
  }

  private func performAssetCreation(_ data: Data, fileName: String, useAlbum: Bool) -> String? {
    let semaphore = DispatchSemaphore(value: 0)
    var failure: String? = "save_failed"
    let existingAlbum: PHAssetCollection? = useAlbum ? fetchSaveAlbum() : nil
    PHPhotoLibrary.shared().performChanges({
      let request = PHAssetCreationRequest.forAsset()
      let options = PHAssetResourceCreationOptions()
      if !fileName.isEmpty {
        options.originalFilename = fileName
      }
      request.addResource(with: .photo, data: data, options: options)
      guard useAlbum, let placeholder = request.placeholderForCreatedAsset else { return }
      let albumRequest: PHAssetCollectionChangeRequest?
      if let album = existingAlbum {
        albumRequest = PHAssetCollectionChangeRequest(for: album)
      } else {
        albumRequest = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
          withTitle: MessengerPhotoLibraryPlugin.saveAlbumTitle
        )
      }
      albumRequest?.addAssets([placeholder] as NSArray)
    }, completionHandler: { success, _ in
      failure = success ? nil : "save_failed"
      semaphore.signal()
    })
    if semaphore.wait(timeout: .now() + 60) == .timedOut {
      return "save_timeout"
    }
    return failure
  }

  @objc func getPermissionState(_ call: CAPPluginCall) {
    call.resolve(["state": permissionStateJs()])
  }

  @objc func requestPermission(_ call: CAPPluginCall) {
    if #available(iOS 14, *) {
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] _ in
        DispatchQueue.main.async {
          call.resolve(["state": self?.permissionStateJs() ?? "denied"])
        }
      }
    } else {
      PHPhotoLibrary.requestAuthorization { [weak self] _ in
        DispatchQueue.main.async {
          call.resolve(["state": self?.permissionStateJs() ?? "denied"])
        }
      }
    }
  }

  @objc func getRecentPhotos(_ call: CAPPluginCall) {
    let limit = max(1, min(call.getInt("limit") ?? 24, 40))
    let state = permissionStateJs()
    if state == "denied" || state == "prompt" {
      call.resolve(["photos": [], "state": state])
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      let photos = self.fetchRecentThumbs(limit: limit)
      DispatchQueue.main.async {
        call.resolve(["photos": photos, "state": self.permissionStateJs()])
      }
    }
  }

  @objc func pickPhotos(_ call: CAPPluginCall) {
    let maxCount = max(1, min(call.getInt("max") ?? 10, 10))
    DispatchQueue.main.async {
      if self.pendingPickCall != nil {
        call.reject("picker_busy")
        return
      }
      self.pendingPickCall = call
      let includeVideos = call.getBool("includeVideos") ?? false
      self.pendingPickIncludesVideos = includeVideos
      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = includeVideos ? .any(of: [.images, .videos]) : .images
      config.selectionLimit = maxCount
      if #available(iOS 15, *) {
        config.selection = .ordered
      }
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = self
      guard let vc = self.bridge?.viewController else {
        self.pendingPickCall = nil
        call.reject("no_view_controller")
        return
      }
      vc.present(picker, animated: true)
    }
  }


  // MARK: 채팅 영상 메서드 (설계 messenger-video-send-audit-design-2026-11-24)

  /// 압축(또는 복사) + 썸네일. resolve {handle, sizeBytes, durationMs, width, height, transcoded}
  @objc func prepareVideo(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("bad_args")
      return
    }
    videoPrep.prepare(id) { entry, error in
      guard let e = entry, let video = e.video else {
        call.reject(error ?? "prepare_failed")
        return
      }
      let meta = self.videoPrep.outputMeta(video)
      call.resolve([
        "handle": e.id,
        "sizeBytes": self.videoPrep.fileSize(video),
        "durationMs": meta.0 > 0 ? meta.0 : e.durationMs,
        "width": meta.1 > 0 ? meta.1 : e.width,
        "height": meta.2 > 0 ? meta.2 : e.height,
        "transcoded": e.transcoded,
      ])
    }
  }

  /// 서명 URL 로 썸네일·영상 직접 PUT. resolve {ok, cancelled}
  @objc func uploadPreparedVideo(_ call: CAPPluginCall) {
    guard let handle = call.getString("handle"),
          let v = call.getString("videoSignedUrl").flatMap({ URL(string: $0) }),
          let t = call.getString("thumbSignedUrl").flatMap({ URL(string: $0) })
    else {
      call.reject("bad_args")
      return
    }
    let contentType = call.getString("videoContentType") ?? "video/mp4"
    videoPrep.upload(handle, videoURL: v, thumbURL: t, videoContentType: contentType) { ok, cancelled in
      call.resolve(["ok": ok, "cancelled": cancelled])
    }
  }

  @objc func cancelVideo(_ call: CAPPluginCall) {
    videoPrep.cancel(call.getString("id"))
    call.resolve()
  }

  @objc func releaseVideo(_ call: CAPPluginCall) {
    videoPrep.release(call.getString("id"))
    call.resolve()
  }

  @objc func resolvePhotos(_ call: CAPPluginCall) {
    guard let ids = call.getArray("ids", String.self), !ids.isEmpty else {
      call.resolve(["photos": []])
      return
    }
    let state = permissionStateJs()
    if state == "denied" {
      call.reject("permission_denied")
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      var photos: [[String: Any]] = []
      var failed: [[String: Any]] = []
      for (idx, id) in ids.enumerated() {
        let localId = id.hasPrefix("phasset:") ? String(id.dropFirst("phasset:".count)) : id
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil).firstObject else {
          failed.append(["index": idx, "id": id, "reason": "asset_not_found"])
          continue
        }
        guard let payload = self.encodeFullAsset(asset, baseName: "recent-\(idx)") else {
          failed.append(["index": idx, "id": id, "reason": "decode_failed"])
          continue
        }
        var row = payload
        row["id"] = id
        photos.append(row)
      }
      DispatchQueue.main.async {
        call.resolve(["photos": photos, "failed": failed])
      }
    }
  }

  public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let call = pendingPickCall else { return }
    pendingPickCall = nil
    let includeVideos = pendingPickIncludesVideos
    pendingPickIncludesVideos = false
    if results.isEmpty {
      call.resolve(["photos": [], "cancelled": true])
      return
    }
    let group = DispatchGroup()
    var ordered: [(Int, [String: Any])] = []
    var failedRows: [(Int, String)] = []
    var videoRows: [(Int, [String: Any])] = []
    let lock = NSLock()
    for (idx, result) in results.enumerated() {
      let provider = result.itemProvider
      if includeVideos && provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
        group.enter()
        provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, _ in
          // 임시 파일은 이 콜백 안에서만 유효 — register 가 작업 폴더로 복사한다.
          let registered = url.flatMap { self.videoPrep.register(tempFile: $0) }
          lock.lock()
          if let (entry, thumb) = registered {
            videoRows.append((idx, [
              "id": entry.id,
              "durationMs": entry.durationMs,
              "width": entry.width,
              "height": entry.height,
              "sizeBytes": entry.sourceBytes,
              "thumbnailDataUrl": thumb,
            ]))
          } else {
            failedRows.append((idx, "video_unreadable"))
          }
          lock.unlock()
          group.leave()
        }
        continue
      }
      group.enter()
      loadPickedImagePayload(result.itemProvider, baseName: "pick-\(idx)") { payload, reason in
        lock.lock()
        if let payload = payload {
          ordered.append((idx, payload))
        } else {
          failedRows.append((idx, reason ?? "decode_failed"))
        }
        lock.unlock()
        group.leave()
      }
    }
    group.notify(queue: .main) {
      let photos = ordered.sorted { $0.0 < $1.0 }.map { $0.1 }
      let failed: [[String: Any]] = failedRows
        .sorted { $0.0 < $1.0 }
        .map { ["index": $0.0, "reason": $0.1] }
      var out: [String: Any] = [
        "photos": photos,
        "failed": failed,
        "cancelled": photos.isEmpty && failed.isEmpty && videoRows.isEmpty,
      ]
      if includeVideos {
        out["videos"] = videoRows.sorted { $0.0 < $1.0 }.map { $0.1 }
      }
      call.resolve(out)
    }
  }

  /// UIImage (fast path) → file representation + ImageIO (iCloud-only / HEIC / Live Photo fallback).
  /// completion is called exactly once, with either a payload or a failure reason.
  private func loadPickedImagePayload(
    _ provider: NSItemProvider,
    baseName: String,
    completion: @escaping ([String: Any]?, String?) -> Void
  ) {
    if provider.canLoadObject(ofClass: UIImage.self) {
      provider.loadObject(ofClass: UIImage.self) { object, _ in
        if let image = object as? UIImage,
           let payload = self.encodeFullUIImage(image, id: baseName, baseName: baseName)
        {
          completion(payload, nil)
          return
        }
        self.loadPickedImageFile(provider, baseName: baseName, firstReason: "load_object_failed", completion: completion)
      }
    } else {
      loadPickedImageFile(provider, baseName: baseName, firstReason: "unsupported_type", completion: completion)
    }
  }

  private func loadPickedImageFile(
    _ provider: NSItemProvider,
    baseName: String,
    firstReason: String,
    completion: @escaping ([String: Any]?, String?) -> Void
  ) {
    let typeId = UTType.image.identifier
    guard provider.hasItemConformingToTypeIdentifier(typeId) else {
      completion(nil, firstReason)
      return
    }
    provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, _ in
      // The temporary file is only valid inside this callback — decode synchronously here.
      guard let url = url else {
        completion(nil, "file_load_failed")
        return
      }
      guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
            let payload = self.encodeImageSource(source, id: baseName, baseName: baseName)
      else {
        completion(nil, "decode_failed")
        return
      }
      completion(payload, nil)
    }
  }

  private func permissionStateJs() -> String {
    let status: PHAuthorizationStatus
    if #available(iOS 14, *) {
      status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    } else {
      status = PHPhotoLibrary.authorizationStatus()
    }
    switch status {
    case .authorized:
      return "authorized"
    case .limited:
      return "limited"
    case .denied, .restricted:
      return "denied"
    case .notDetermined:
      return "prompt"
    @unknown default:
      return "denied"
    }
  }

  private func fetchRecentThumbs(limit: Int) -> [[String: Any]] {
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = limit
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    var photos: [[String: Any]] = []
    let target = CGSize(width: thumbMaxPx, height: thumbMaxPx)
    let requestOptions = PHImageRequestOptions()
    requestOptions.isSynchronous = true
    requestOptions.deliveryMode = .fastFormat
    requestOptions.resizeMode = .fast
    requestOptions.isNetworkAccessAllowed = true
    assets.enumerateObjects { asset, _, stop in
      if photos.count >= limit {
        stop.pointee = true
        return
      }
      var outImage: UIImage?
      PHImageManager.default().requestImage(
        for: asset,
        targetSize: target,
        contentMode: .aspectFill,
        options: requestOptions
      ) { image, _ in
        outImage = image
      }
      guard let image = outImage, let data = image.jpegData(compressionQuality: 0.7) else { return }
      let b64 = data.base64EncodedString()
      photos.append([
        "id": "phasset:\(asset.localIdentifier)",
        "thumbnailDataUrl": "data:image/jpeg;base64,\(b64)",
        "width": asset.pixelWidth,
        "height": asset.pixelHeight,
      ])
    }
    return photos
  }

  private func encodeFullAsset(_ asset: PHAsset, baseName: String) -> [String: Any]? {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .exact
    options.isNetworkAccessAllowed = true
    let w = CGFloat(asset.pixelWidth)
    let h = CGFloat(asset.pixelHeight)
    let edge = max(w, h)
    let scale = edge > fullMaxEdge ? fullMaxEdge / edge : 1
    let target = CGSize(width: max(1, w * scale), height: max(1, h * scale))
    var outImage: UIImage?
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFit,
      options: options
    ) { image, _ in
      outImage = image
    }
    let id = "phasset:\(asset.localIdentifier)"
    if let image = outImage, let payload = encodeFullUIImage(image, id: id, baseName: baseName) {
      return payload
    }
    // Fallback: original data (iCloud / HEIC) decoded through ImageIO with EXIF transform applied.
    let dataOptions = PHImageRequestOptions()
    dataOptions.isSynchronous = true
    dataOptions.deliveryMode = .highQualityFormat
    dataOptions.isNetworkAccessAllowed = true
    var outData: Data?
    PHImageManager.default().requestImageDataAndOrientation(for: asset, options: dataOptions) { data, _, _, _ in
      outData = data
    }
    guard let data = outData,
          let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary)
    else { return nil }
    return encodeImageSource(source, id: id, baseName: baseName)
  }

  /// ImageIO downsample (max edge = fullMaxEdge) with EXIF orientation baked in.
  private func encodeImageSource(_ source: CGImageSource, id: String, baseName: String) -> [String: Any]? {
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: Int(fullMaxEdge),
    ]
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    let image = UIImage(cgImage: cgImage, scale: 1, orientation: .up)
    // Trust the container's own HasAlpha flag when present (decoders may report padded alpha for opaque photos).
    let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let sourceHasAlpha = (props?[kCGImagePropertyHasAlpha] as? Bool)
    return encodeFullUIImage(image, id: id, baseName: baseName, alphaHint: sourceHasAlpha)
  }

  /// JPEG for opaque photos (unchanged policy); PNG when the source carries alpha so transparency survives.
  private func encodeFullUIImage(
    _ image: UIImage,
    id: String,
    baseName: String,
    alphaHint: Bool? = nil
  ) -> [String: Any]? {
    let hasAlpha = alphaHint ?? imageHasAlpha(image)
    // PNG carries no EXIF orientation → bake orientation in when encoding PNG.
    let scaled = scaleImage(
      image,
      maxEdge: fullMaxEdge,
      opaque: !hasAlpha,
      forceRedraw: hasAlpha && image.imageOrientation != .up
    )
    let data: Data?
    let mimeType: String
    let ext: String
    if hasAlpha {
      data = scaled.pngData()
      mimeType = "image/png"
      ext = "png"
    } else {
      data = scaled.jpegData(compressionQuality: 0.85)
      mimeType = "image/jpeg"
      ext = "jpg"
    }
    guard let encoded = data else { return nil }
    return [
      "id": id,
      "fileName": "\(baseName).\(ext)",
      "mimeType": mimeType,
      "base64": encoded.base64EncodedString(),
    ]
  }

  private func imageHasAlpha(_ image: UIImage) -> Bool {
    guard let alphaInfo = image.cgImage?.alphaInfo else { return false }
    switch alphaInfo {
    case .first, .last, .premultipliedFirst, .premultipliedLast, .alphaOnly:
      return true
    default:
      return false
    }
  }

  private func scaleImage(_ image: UIImage, maxEdge: CGFloat, opaque: Bool, forceRedraw: Bool) -> UIImage {
    let size = image.size
    let edge = max(size.width, size.height)
    guard edge > 0 else { return image }
    if edge <= maxEdge && !forceRedraw { return image }
    let scale = edge > maxEdge ? maxEdge / edge : 1
    let newSize = CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
    UIGraphicsBeginImageContextWithOptions(newSize, opaque, 1)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let out = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return out ?? image
  }
}

// MARK: - 채팅 영상 (docs/audit/messenger-video-send-audit-design-2026-11-24.md §3-4·§3-6 · Owner 2026-11-24 승인 O1)
//
// 고른 영상 등록 · 압축(AVAssetReader/Writer, H.264 2Mbps · 긴 변 1280 · AAC 128kbps mp4) · 썸네일 JPEG · 서명 URL 직접 PUT.
// 값은 웹 SSOT `lib/community-messenger/upload/messenger-video-upload-policy.ts` 와 같다.
// 누수 계약: 영상 바이트는 웹(브리지)으로 넘기지 않는다. 임시 파일은 tmp/messenger-video 아래에만 두고 releaseVideo 에서 지운다.
// 앱 시작 때 1시간 지난 남은 파일도 지운다(앱 종료로 release 를 못 한 경우).

final class MessengerVideoPrep: NSObject {
  static let maxLongEdge: CGFloat = 1280
  static let videoBitrate = 2_000_000
  static let audioBitrate = 128_000
  static let thumbMaxEdge: CGFloat = 480
  static let thumbMaxBytes = 512 * 1024
  static let pickThumbEdge: CGFloat = 256
  /// 이 이하(바이트/초)인 H.264 mp4 는 다시 인코딩하지 않고 복사만 — 영상 2Mbps + 음성 128kbps + 10% 여유
  static let passthroughMaxBytesPerSec = Double(videoBitrate + audioBitrate) / 8 * 1.1
  private static let staleSeconds: TimeInterval = 60 * 60

  final class Entry {
    let id: String
    let source: URL
    let sourceExt: String
    let sourceBytes: Int64
    let durationMs: Int64
    let width: Int
    let height: Int
    var video: URL?
    var thumb: URL?
    var transcoded = false
    var cancelled = false
    var reader: AVAssetReader?
    var writer: AVAssetWriter?
    var task: URLSessionTask?

    init(id: String, source: URL, sourceExt: String, sourceBytes: Int64, durationMs: Int64, width: Int, height: Int) {
      self.id = id
      self.source = source
      self.sourceExt = sourceExt
      self.sourceBytes = sourceBytes
      self.durationMs = durationMs
      self.width = width
      self.height = height
    }
  }

  private var entries: [String: Entry] = [:]
  private let lock = NSLock()
  private let emit: (String, String, Double) -> Void
  private let work = DispatchQueue(label: "dibay.messenger.video", qos: .userInitiated)
  private var progressObservations: [String: NSKeyValueObservation] = [:]

  init(emit: @escaping (String, String, Double) -> Void) {
    self.emit = emit
    super.init()
    work.async { self.deleteStaleFiles() }
  }

  private func workDir() -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("messenger-video", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func deleteStaleFiles() {
    let dir = workDir()
    guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
    let cutoff = Date().addingTimeInterval(-MessengerVideoPrep.staleSeconds)
    for f in files {
      let m = (try? f.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
      if m < cutoff { try? FileManager.default.removeItem(at: f) }
    }
  }

  func get(_ id: String?) -> Entry? {
    guard let id = id else { return nil }
    lock.lock()
    defer { lock.unlock() }
    return entries[id]
  }

  /// 선택기 임시 파일(콜백 안에서만 유효)을 작업 폴더로 복사하고 메타·작은 썸네일을 읽는다.
  func register(tempFile: URL) -> (Entry, String)? {
    let id = UUID().uuidString.lowercased()
    let ext = tempFile.pathExtension.lowercased().isEmpty ? "mov" : tempFile.pathExtension.lowercased()
    let dest = workDir().appendingPathComponent("\(id).src.\(ext)")
    do {
      try FileManager.default.copyItem(at: tempFile, to: dest)
    } catch {
      return nil
    }
    let asset = AVURLAsset(url: dest)
    let seconds = CMTimeGetSeconds(asset.duration)
    guard seconds.isFinite, seconds > 0, let track = asset.tracks(withMediaType: .video).first else {
      try? FileManager.default.removeItem(at: dest)
      return nil
    }
    let size = track.naturalSize.applying(track.preferredTransform)
    let w = Int(abs(size.width).rounded())
    let h = Int(abs(size.height).rounded())
    guard let thumb = frame(asset, maxEdge: MessengerVideoPrep.pickThumbEdge),
          let data = thumb.jpegData(compressionQuality: 0.72)
    else {
      try? FileManager.default.removeItem(at: dest)
      return nil
    }
    let bytes = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.int64Value ?? 0
    let e = Entry(id: id, source: dest, sourceExt: ext, sourceBytes: bytes, durationMs: Int64(seconds * 1000), width: w, height: h)
    lock.lock()
    entries[id] = e
    lock.unlock()
    return (e, "data:image/jpeg;base64,\(data.base64EncodedString())")
  }

  private func frame(_ asset: AVAsset, maxEdge: CGFloat) -> UIImage? {
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.maximumSize = CGSize(width: maxEdge, height: maxEdge)
    let t = CMTime(seconds: min(0.1, max(0, CMTimeGetSeconds(asset.duration) / 100)), preferredTimescale: 600)
    guard let cg = try? gen.copyCGImage(at: t, actualTime: nil) else { return nil }
    return UIImage(cgImage: cg)
  }

  private func isH264(_ track: AVAssetTrack) -> Bool {
    guard let desc = track.formatDescriptions.first else { return false }
    // swiftlint:disable:next force_cast
    return CMFormatDescriptionGetMediaSubType(desc as! CMFormatDescription) == kCMVideoCodecType_H264
  }

  /// 압축(또는 복사) + 썸네일. completion 은 메인 스레드.
  func prepare(_ id: String, completion: @escaping (Entry?, String?) -> Void) {
    guard let e = get(id) else {
      completion(nil, "not_found")
      return
    }
    if let v = e.video, let t = e.thumb, FileManager.default.fileExists(atPath: v.path), FileManager.default.fileExists(atPath: t.path) {
      completion(e, nil)
      return
    }
    e.cancelled = false
    work.async {
      let out = self.workDir().appendingPathComponent("\(e.id).mp4")
      try? FileManager.default.removeItem(at: out)
      let asset = AVURLAsset(url: e.source)
      guard let vTrack = asset.tracks(withMediaType: .video).first else {
        DispatchQueue.main.async { completion(nil, "no_video_track") }
        return
      }
      let bytesPerSec = e.durationMs > 0 ? Double(e.sourceBytes) * 1000 / Double(e.durationMs) : .infinity
      let passthrough = e.sourceExt == "mp4"
        && CGFloat(max(e.width, e.height)) <= MessengerVideoPrep.maxLongEdge
        && bytesPerSec <= MessengerVideoPrep.passthroughMaxBytesPerSec
        && self.isH264(vTrack)
      var ok: Bool
      if passthrough {
        ok = (try? FileManager.default.copyItem(at: e.source, to: out)) != nil
        e.transcoded = false
      } else {
        ok = self.transcode(e, asset: asset, videoTrack: vTrack, out: out)
        e.transcoded = true
      }
      if ok && !e.cancelled { ok = self.writeThumb(e, video: out) }
      if ok && !e.cancelled {
        e.video = out
      } else {
        try? FileManager.default.removeItem(at: out)
      }
      let err: String? = (ok && !e.cancelled) ? nil : (e.cancelled ? "cancelled" : "transcode_failed")
      DispatchQueue.main.async { completion(err == nil ? e : nil, err) }
    }
  }

  private func transcode(_ e: Entry, asset: AVAsset, videoTrack: AVAssetTrack, out: URL) -> Bool {
    guard let reader = try? AVAssetReader(asset: asset),
          let writer = try? AVAssetWriter(outputURL: out, fileType: .mp4)
    else { return false }
    e.reader = reader
    e.writer = writer
    defer {
      e.reader = nil
      e.writer = nil
    }
    let natural = videoTrack.naturalSize
    let longEdge = max(natural.width, natural.height)
    let scale = min(1, MessengerVideoPrep.maxLongEdge / max(1, longEdge))
    func even(_ v: CGFloat) -> Int { let i = max(2, Int(v.rounded())); return i % 2 == 0 ? i : i - 1 }
    let tw = even(natural.width * scale)
    let th = even(natural.height * scale)

    let vOut = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    vOut.alwaysCopiesSampleData = false
    guard reader.canAdd(vOut) else { return false }
    reader.add(vOut)
    let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: tw,
      AVVideoHeightKey: th,
      AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: MessengerVideoPrep.videoBitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    vIn.expectsMediaDataInRealTime = false
    /// 회전은 메타데이터로 유지(재생기가 적용) — 픽셀을 돌리지 않는다.
    vIn.transform = videoTrack.preferredTransform
    guard writer.canAdd(vIn) else { return false }
    writer.add(vIn)

    var aOut: AVAssetReaderTrackOutput?
    var aIn: AVAssetWriterInput?
    if let aTrack = asset.tracks(withMediaType: .audio).first {
      var channels = 2
      if let d = aTrack.formatDescriptions.first,
         // swiftlint:disable:next force_cast
         let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(d as! CMAudioFormatDescription)?.pointee
      {
        channels = max(1, min(2, Int(asbd.mChannelsPerFrame)))
      }
      let ro = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: channels,
      ])
      let wi = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: channels,
        AVEncoderBitRateKey: MessengerVideoPrep.audioBitrate,
      ])
      wi.expectsMediaDataInRealTime = false
      if reader.canAdd(ro) && writer.canAdd(wi) {
        reader.add(ro)
        writer.add(wi)
        aOut = ro
        aIn = wi
      }
    }
    writer.shouldOptimizeForNetworkUse = true
    guard reader.startReading(), writer.startWriting() else { return false }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    let total = max(0.001, CMTimeGetSeconds(asset.duration))
    var lastPct = -1
    group.enter()
    let vq = DispatchQueue(label: "dibay.messenger.video.v")
    vIn.requestMediaDataWhenReady(on: vq) {
      while vIn.isReadyForMoreMediaData {
        if e.cancelled {
          reader.cancelReading()
          vIn.markAsFinished()
          group.leave()
          return
        }
        guard let sample = vOut.copyNextSampleBuffer() else {
          vIn.markAsFinished()
          group.leave()
          return
        }
        let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
        let pct = Int(min(1, max(0, pts / total)) * 100)
        if pct != lastPct {
          lastPct = pct
          self.emit(e.id, "transcode", Double(pct) / 100)
        }
        if !vIn.append(sample) {
          reader.cancelReading()
          vIn.markAsFinished()
          group.leave()
          return
        }
      }
    }
    if let aOut = aOut, let aIn = aIn {
      group.enter()
      let aq = DispatchQueue(label: "dibay.messenger.video.a")
      aIn.requestMediaDataWhenReady(on: aq) {
        while aIn.isReadyForMoreMediaData {
          if e.cancelled {
            aIn.markAsFinished()
            group.leave()
            return
          }
          guard let sample = aOut.copyNextSampleBuffer() else {
            aIn.markAsFinished()
            group.leave()
            return
          }
          if !aIn.append(sample) {
            aIn.markAsFinished()
            group.leave()
            return
          }
        }
      }
    }
    group.wait()
    if e.cancelled || reader.status == .failed {
      writer.cancelWriting()
      return false
    }
    let sem = DispatchSemaphore(value: 0)
    writer.finishWriting { sem.signal() }
    sem.wait()
    return writer.status == .completed
  }

  /// 썸네일 JPEG(긴 변 480 이하, 512KB 이하) — 결과 영상의 0.1초 지점.
  private func writeThumb(_ e: Entry, video: URL) -> Bool {
    guard let img = frame(AVURLAsset(url: video), maxEdge: MessengerVideoPrep.thumbMaxEdge) else { return false }
    var data: Data?
    for q in [0.8, 0.6, 0.4] {
      data = img.jpegData(compressionQuality: CGFloat(q))
      if let d = data, d.count <= MessengerVideoPrep.thumbMaxBytes { break }
    }
    guard let d = data, d.count <= MessengerVideoPrep.thumbMaxBytes else { return false }
    let url = workDir().appendingPathComponent("\(e.id).thumb.jpg")
    do {
      try d.write(to: url, options: .atomic)
    } catch {
      return false
    }
    e.thumb = url
    return true
  }

  /// 결과 영상의 길이(ms)·표시 크기
  func outputMeta(_ video: URL) -> (Int64, Int, Int) {
    let asset = AVURLAsset(url: video)
    let s = CMTimeGetSeconds(asset.duration)
    guard let t = asset.tracks(withMediaType: .video).first else { return (0, 0, 0) }
    let size = t.naturalSize.applying(t.preferredTransform)
    return (s.isFinite ? Int64(s * 1000) : 0, Int(abs(size.width).rounded()), Int(abs(size.height).rounded()))
  }

  func fileSize(_ url: URL) -> Int64 {
    (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
  }

  /// 서명 URL 로 썸네일 → 영상 PUT. 진행률 videoProgress {id, phase:"upload"}. completion(ok, cancelled) 메인 스레드.
  func upload(_ id: String, videoURL: URL, thumbURL: URL, videoContentType: String, completion: @escaping (Bool, Bool) -> Void) {
    guard let e = get(id), let video = e.video, let thumb = e.thumb else {
      completion(false, false)
      return
    }
    e.cancelled = false
    put(e, url: thumbURL, file: thumb, contentType: "image/jpeg", report: false) { ok in
      guard ok, !e.cancelled else {
        DispatchQueue.main.async { completion(false, e.cancelled) }
        return
      }
      self.put(e, url: videoURL, file: video, contentType: videoContentType, report: true) { ok2 in
        DispatchQueue.main.async { completion(ok2 && !e.cancelled, e.cancelled) }
      }
    }
  }

  private func put(_ e: Entry, url: URL, file: URL, contentType: String, report: Bool, done: @escaping (Bool) -> Void) {
    var req = URLRequest(url: url)
    req.httpMethod = "PUT"
    req.setValue(contentType, forHTTPHeaderField: "content-type")
    req.setValue("false", forHTTPHeaderField: "x-upsert")
    req.timeoutInterval = 60
    let task = URLSession.shared.uploadTask(with: req, fromFile: file) { _, resp, err in
      self.lock.lock()
      self.progressObservations[e.id] = nil
      self.lock.unlock()
      e.task = nil
      let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
      done(err == nil && code >= 200 && code < 300)
    }
    if report {
      var lastPct = -1
      let obs = task.progress.observe(\.fractionCompleted) { p, _ in
        let pct = Int(p.fractionCompleted * 100)
        if pct != lastPct {
          lastPct = pct
          self.emit(e.id, "upload", Double(pct) / 100)
        }
      }
      lock.lock()
      progressObservations[e.id] = obs
      lock.unlock()
    }
    e.task = task
    task.resume()
  }

  func cancel(_ id: String?) {
    guard let e = get(id) else { return }
    e.cancelled = true
    e.task?.cancel()
    e.reader?.cancelReading()
  }

  func release(_ id: String?) {
    guard let id = id else { return }
    lock.lock()
    let e = entries.removeValue(forKey: id)
    progressObservations[id] = nil
    lock.unlock()
    guard let entry = e else { return }
    entry.cancelled = true
    entry.task?.cancel()
    entry.reader?.cancelReading()
    work.async {
      for u in [entry.video, entry.thumb, entry.source] {
        if let u = u { try? FileManager.default.removeItem(at: u) }
      }
      try? FileManager.default.removeItem(at: self.workDir().appendingPathComponent("\(entry.id).mp4"))
    }
  }
}
