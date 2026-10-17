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
  ]

  private var pendingPickCall: CAPPluginCall?
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
      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = .images
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
    if results.isEmpty {
      call.resolve(["photos": [], "cancelled": true])
      return
    }
    let group = DispatchGroup()
    var ordered: [(Int, [String: Any])] = []
    var failedRows: [(Int, String)] = []
    let lock = NSLock()
    for (idx, result) in results.enumerated() {
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
      call.resolve([
        "photos": photos,
        "failed": failed,
        "cancelled": photos.isEmpty && failed.isEmpty,
      ])
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
