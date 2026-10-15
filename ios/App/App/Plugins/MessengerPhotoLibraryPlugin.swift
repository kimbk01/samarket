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
  ]

  private var pendingPickCall: CAPPluginCall?
  private let thumbMaxPx: CGFloat = 256
  private let fullMaxEdge: CGFloat = 1920

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
