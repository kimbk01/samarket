package com.dibay.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;

@CapacitorPlugin(
  name = "MessengerPhotoLibrary",
  permissions = {
    @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = MessengerPhotoLibraryPlugin.ALIAS_PHOTOS),
    @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = MessengerPhotoLibraryPlugin.ALIAS_LEGACY_PHOTOS),
  }
)
public class MessengerPhotoLibraryPlugin extends Plugin {
  static final String ALIAS_PHOTOS = "photos";
  static final String ALIAS_LEGACY_PHOTOS = "legacyPhotos";
  private static final int THUMBNAIL_SIZE_PX = 256;
  private static final int FULL_MAX_EDGE = 1920;

  @PluginMethod
  public void getPermissionState(PluginCall call) {
    JSObject result = new JSObject();
    result.put("state", permissionStateJs());
    call.resolve(result);
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (hasPhotoPermission()) {
      resolvePermission(call, "authorized");
      return;
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      resolvePermission(call, "authorized");
      return;
    }
    requestPermissionForAlias(permissionAlias(), call, "permissionCallback");
  }

  @PluginMethod
  public void getRecentPhotos(PluginCall call) {
    int limit = Math.max(1, Math.min(call.getInt("limit", 24), 40));
    String state = permissionStateJs();
    if (!"authorized".equals(state)) {
      JSObject result = new JSObject();
      result.put("state", state);
      result.put("photos", new JSArray());
      call.resolve(result);
      return;
    }

    JSArray photos = new JSArray();
    ContentResolver resolver = getContext().getContentResolver();
    String[] projection = new String[] {
      MediaStore.Images.Media._ID,
      MediaStore.Images.Media.WIDTH,
      MediaStore.Images.Media.HEIGHT,
    };
    String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC LIMIT " + limit;
    try (
      Cursor cursor = resolver.query(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        projection,
        null,
        null,
        sortOrder
      )
    ) {
      if (cursor != null) {
        int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
        int widthCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
        int heightCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);
        while (cursor.moveToNext() && photos.length() < limit) {
          long mediaId = cursor.getLong(idCol);
          Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, mediaId);
          Bitmap thumbnail = loadThumbnail(resolver, uri, mediaId);
          if (thumbnail == null) continue;
          JSObject item = new JSObject();
          item.put("id", uri.toString());
          item.put("thumbnailDataUrl", "data:image/jpeg;base64," + bitmapToBase64(thumbnail, 72));
          item.put("width", cursor.getInt(widthCol));
          item.put("height", cursor.getInt(heightCol));
          photos.put(item);
        }
      }
    } catch (Exception ignored) {
      // Return the photos that were readable; JS can fall back to the picker.
    }

    JSObject result = new JSObject();
    result.put("state", permissionStateJs());
    result.put("photos", photos);
    call.resolve(result);
  }

  @PluginMethod
  public void pickPhotos(PluginCall call) {
    int max = Math.max(1, Math.min(call.getInt("max", 10), 10));
    Intent intent;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
      intent.setType("image/*");
      intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(max, MediaStore.getPickImagesMaxLimit()));
    } else {
      intent = new Intent(Intent.ACTION_GET_CONTENT);
      intent.setType("image/*");
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    }
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivityForResult(call, intent, "pickPhotosCallback");
  }

  @PluginMethod
  public void resolvePhotos(PluginCall call) {
    JSArray ids = call.getArray("ids");
    JSArray photos = new JSArray();
    if (ids == null || ids.length() == 0) {
      JSObject result = new JSObject();
      result.put("photos", photos);
      call.resolve(result);
      return;
    }
    if (!hasPhotoPermission()) {
      call.reject("permission_denied");
      return;
    }

    JSArray failed = new JSArray();
    for (int i = 0; i < ids.length(); i++) {
      String id = null;
      try {
        id = ids.getString(i);
        EncodeOutcome outcome = encodeUriPayload(Uri.parse(id), "recent-" + i, id);
        if (outcome.payload != null) {
          photos.put(outcome.payload);
        } else {
          failed.put(failureRow(i, id, outcome.reason));
        }
      } catch (Exception e) {
        // Keep resolving the rest in selection order; report this row instead of dropping it silently.
        failed.put(failureRow(i, id, "invalid_id"));
      }
    }

    JSObject result = new JSObject();
    result.put("photos", photos);
    result.put("failed", failed);
    call.resolve(result);
  }

  @ActivityCallback
  private void pickPhotosCallback(PluginCall call, ActivityResult activityResult) {
    JSArray photos = new JSArray();
    if (call == null) return;
    if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
      JSObject result = new JSObject();
      result.put("photos", photos);
      result.put("cancelled", true);
      call.resolve(result);
      return;
    }

    ArrayList<Uri> uris = readPickedUris(activityResult.getData());
    JSArray failed = new JSArray();
    for (int i = 0; i < uris.size(); i++) {
      EncodeOutcome outcome = encodeUriPayload(uris.get(i), "pick-" + i, uris.get(i).toString());
      if (outcome.payload != null) {
        photos.put(outcome.payload);
      } else {
        failed.put(failureRow(i, null, outcome.reason));
      }
    }

    JSObject result = new JSObject();
    result.put("photos", photos);
    result.put("failed", failed);
    result.put("cancelled", photos.length() == 0 && failed.length() == 0);
    call.resolve(result);
  }

  @PermissionCallback
  private void permissionCallback(PluginCall call) {
    resolvePermission(call, hasPhotoPermission() ? "authorized" : "denied");
  }

  private String permissionStateJs() {
    return hasPhotoPermission() ? "authorized" : "prompt";
  }

  private boolean hasPhotoPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
    String permission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
      ? Manifest.permission.READ_MEDIA_IMAGES
      : Manifest.permission.READ_EXTERNAL_STORAGE;
    return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
  }

  private String permissionAlias() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? ALIAS_PHOTOS : ALIAS_LEGACY_PHOTOS;
  }

  private void resolvePermission(PluginCall call, String state) {
    JSObject result = new JSObject();
    result.put("state", state);
    call.resolve(result);
  }

  private Bitmap loadThumbnail(ContentResolver resolver, Uri uri, long mediaId) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        return resolver.loadThumbnail(uri, new Size(THUMBNAIL_SIZE_PX, THUMBNAIL_SIZE_PX), null);
      }
      return MediaStore.Images.Thumbnails.getThumbnail(
        resolver,
        mediaId,
        MediaStore.Images.Thumbnails.MINI_KIND,
        null
      );
    } catch (Exception ignored) {
      return null;
    }
  }

  private ArrayList<Uri> readPickedUris(Intent data) {
    LinkedHashSet<Uri> ordered = new LinkedHashSet<>();
    if (data.getClipData() != null) {
      for (int i = 0; i < data.getClipData().getItemCount(); i++) {
        Uri uri = data.getClipData().getItemAt(i).getUri();
        if (uri != null) ordered.add(uri);
      }
    }
    if (data.getData() != null) ordered.add(data.getData());
    return new ArrayList<>(ordered);
  }

  private static final class EncodeOutcome {
    final JSObject payload;
    final String reason;

    EncodeOutcome(JSObject payload, String reason) {
      this.payload = payload;
      this.reason = reason;
    }
  }

  private JSObject failureRow(int index, String id, String reason) {
    JSObject row = new JSObject();
    row.put("index", index);
    if (id != null) row.put("id", id);
    row.put("reason", reason);
    return row;
  }

  /**
   * Two-pass decode: bounds → inSampleSize (targets FULL_MAX_EDGE) → decode → EXIF rotate → exact scale.
   * OutOfMemoryError is an Error (not Exception) and is caught explicitly per item.
   */
  private EncodeOutcome encodeUriPayload(Uri uri, String baseName, String id) {
    ContentResolver resolver = getContext().getContentResolver();
    Bitmap decoded = null;
    Bitmap oriented = null;
    Bitmap scaled = null;
    try {
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      try (InputStream input = resolver.openInputStream(uri)) {
        if (input == null) return new EncodeOutcome(null, "open_failed");
        BitmapFactory.decodeStream(input, null, bounds);
      }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return new EncodeOutcome(null, "decode_failed");

      BitmapFactory.Options decodeOptions = new BitmapFactory.Options();
      decodeOptions.inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, FULL_MAX_EDGE);
      try (InputStream input = resolver.openInputStream(uri)) {
        if (input == null) return new EncodeOutcome(null, "open_failed");
        decoded = BitmapFactory.decodeStream(input, null, decodeOptions);
      }
      if (decoded == null) return new EncodeOutcome(null, "decode_failed");

      oriented = applyExifOrientation(decoded, readExifOrientation(resolver, uri));
      scaled = scaleBitmap(oriented, FULL_MAX_EDGE);
      boolean hasAlpha = scaled.hasAlpha();
      String base64 = hasAlpha ? bitmapToPngBase64(scaled) : bitmapToBase64(scaled, 86);
      JSObject payload = new JSObject();
      payload.put("id", id);
      payload.put("fileName", baseName + (hasAlpha ? ".png" : ".jpg"));
      payload.put("mimeType", hasAlpha ? "image/png" : "image/jpeg");
      payload.put("base64", base64);
      return new EncodeOutcome(payload, null);
    } catch (OutOfMemoryError oom) {
      return new EncodeOutcome(null, "out_of_memory");
    } catch (SecurityException se) {
      return new EncodeOutcome(null, "permission_denied");
    } catch (Exception e) {
      return new EncodeOutcome(null, "decode_failed");
    } finally {
      if (scaled != null && scaled != oriented) scaled.recycle();
      if (oriented != null && oriented != decoded) oriented.recycle();
      if (decoded != null) decoded.recycle();
    }
  }

  private int computeInSampleSize(int width, int height, int maxEdge) {
    int sample = 1;
    int edge = Math.max(width, height);
    // Largest power of two that keeps the decoded edge >= maxEdge (final exact scale happens afterwards).
    while (edge / (sample * 2) >= maxEdge) {
      sample *= 2;
    }
    return sample;
  }

  private int readExifOrientation(ContentResolver resolver, Uri uri) {
    try (InputStream input = resolver.openInputStream(uri)) {
      if (input == null) return ExifInterface.ORIENTATION_NORMAL;
      ExifInterface exif = new ExifInterface(input);
      return exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
    } catch (IOException | RuntimeException ignored) {
      return ExifInterface.ORIENTATION_NORMAL;
    }
  }

  private Bitmap applyExifOrientation(Bitmap source, int orientation) {
    Matrix matrix = new Matrix();
    switch (orientation) {
      case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
        matrix.setScale(-1, 1);
        break;
      case ExifInterface.ORIENTATION_ROTATE_180:
        matrix.setRotate(180);
        break;
      case ExifInterface.ORIENTATION_FLIP_VERTICAL:
        matrix.setRotate(180);
        matrix.postScale(-1, 1);
        break;
      case ExifInterface.ORIENTATION_TRANSPOSE:
        matrix.setRotate(90);
        matrix.postScale(-1, 1);
        break;
      case ExifInterface.ORIENTATION_ROTATE_90:
        matrix.setRotate(90);
        break;
      case ExifInterface.ORIENTATION_TRANSVERSE:
        matrix.setRotate(-90);
        matrix.postScale(-1, 1);
        break;
      case ExifInterface.ORIENTATION_ROTATE_270:
        matrix.setRotate(-90);
        break;
      default:
        return source;
    }
    return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
  }

  private Bitmap scaleBitmap(Bitmap source, int maxEdge) {
    int width = source.getWidth();
    int height = source.getHeight();
    int edge = Math.max(width, height);
    if (edge <= maxEdge || edge <= 0) return source;
    float scale = (float) maxEdge / (float) edge;
    int targetWidth = Math.max(1, Math.round(width * scale));
    int targetHeight = Math.max(1, Math.round(height * scale));
    return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
  }

  private String bitmapToBase64(Bitmap bitmap, int quality) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
  }

  private String bitmapToPngBase64(Bitmap bitmap) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
  }
}
