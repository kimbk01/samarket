package com.dibay.app;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;
import com.google.common.collect.ImmutableList;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 채팅 영상 보내기 — 고른 영상 등록 · 압축(Media3 Transformer, H.264/AAC mp4) · 썸네일(JPEG) · 서명 URL 직접 PUT.
 * 설계: docs/audit/messenger-video-send-audit-design-2026-11-24.md §3-4·§3-6 (Owner 2026-11-24 승인 O1).
 * 값은 웹 SSOT `lib/community-messenger/upload/messenger-video-upload-policy.ts` 와 같다.
 *
 * 누수 계약: 영상 바이트는 웹(브리지)으로 넘기지 않는다. 임시 파일은 cacheDir/messenger-video 아래에만 두고
 * releaseVideo(성공·포기) 에서 지운다. 앱 시작 때 1시간 지난 남은 파일도 지운다(앱 종료로 release 를 못 한 경우).
 */
@UnstableApi
final class MessengerVideoPrep {
  private static final String TAG = "MessengerVideoPrep";
  static final int MAX_LONG_EDGE = 1280;
  static final int VIDEO_BITRATE = 2_000_000;
  static final int THUMB_MAX_EDGE = 480;
  static final int THUMB_MAX_BYTES = 512 * 1024;
  static final int PICK_THUMB_EDGE = 256;
  /** 이 이하(바이트/초)인 mp4 는 다시 인코딩하지 않고 복사만 — 영상 2Mbps + 음성 128kbps + 10% 여유 */
  static final long PASSTHROUGH_MAX_BYTES_PER_SEC = (long) ((VIDEO_BITRATE + 128_000) / 8 * 1.1);
  private static final long STALE_FILE_MS = 60L * 60L * 1000L;

  interface ProgressSink {
    void emit(String id, String phase, double progress);
  }

  static final class Entry {
    final String id;
    final Uri source;
    final String sourceMime;
    final long sourceBytes;
    final long durationMs;
    final int width;
    final int height;
    volatile File video;
    volatile File thumb;
    /** OS 대표 사진(고를 때 고객이 본 사진). 있으면 말풍선·저장 사진 모두 이것을 쓴다. */
    volatile Bitmap poster;
    volatile boolean cancelled;
    volatile boolean transcoded;
    /** 마지막 실패 원인 코드(진단용 — 웹이 서버 진단 로그로 보낸다) */
    volatile String lastError;
    volatile Transformer transformer;
    volatile HttpURLConnection connection;

    Entry(String id, Uri source, String sourceMime, long sourceBytes, long durationMs, int width, int height) {
      this.id = id;
      this.source = source;
      this.sourceMime = sourceMime;
      this.sourceBytes = sourceBytes;
      this.durationMs = durationMs;
      this.width = width;
      this.height = height;
    }
  }

  static final class Picked {
    final Entry entry;
    final String thumbnailDataUrl;

    Picked(Entry entry, String thumbnailDataUrl) {
      this.entry = entry;
      this.thumbnailDataUrl = thumbnailDataUrl;
    }
  }

  interface PrepareCallback {
    void done(Entry entry, boolean transcoded, String error);
  }

  private final Context context;
  private final ProgressSink sink;
  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());

  MessengerVideoPrep(Context context, ProgressSink sink) {
    this.context = context.getApplicationContext();
    this.sink = sink;
    io.execute(this::deleteStaleFiles);
  }

  private File workDir() {
    File dir = new File(context.getCacheDir(), "messenger-video");
    //noinspection ResultOfMethodCallIgnored
    dir.mkdirs();
    return dir;
  }

  private void deleteStaleFiles() {
    File[] files = workDir().listFiles();
    if (files == null) return;
    long cutoff = System.currentTimeMillis() - STALE_FILE_MS;
    for (File f : files) {
      if (f.lastModified() < cutoff) {
        //noinspection ResultOfMethodCallIgnored
        f.delete();
      }
    }
  }

  /** 선택기에서 돌아온 영상 URI 등록 — 길이·표시 크기·작은 썸네일만 읽는다(압축은 보낼 때). */
  Picked register(Uri uri) {
    MediaMetadataRetriever r = new MediaMetadataRetriever();
    try {
      r.setDataSource(context, uri);
      long durationMs = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
      int w = (int) parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
      int h = (int) parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
      int rot = (int) parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
      if (rot == 90 || rot == 270) {
        int t = w;
        w = h;
        h = t;
      }
      if (durationMs <= 0) return null;
      Bitmap poster = loadPoster(uri);
      Bitmap frame = poster != null ? poster : bestFrame(r, durationMs);
      if (frame == null) return null;
      Bitmap small = scale(frame, PICK_THUMB_EDGE);
      String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(jpeg(small, 72), Base64.NO_WRAP);
      String mime = context.getContentResolver().getType(uri);
      Entry e = new Entry(UUID.randomUUID().toString(), uri, mime == null ? "" : mime, querySize(uri), durationMs, w, h);
      e.poster = poster;
      entries.put(e.id, e);
      return new Picked(e, dataUrl);
    } catch (Exception ex) {
      Log.w(TAG, "register failed", ex);
      return null;
    } finally {
      try {
        r.release();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
  }

  /** OS 대표 사진(최근 줄·사진 선택기와 같은 사진, 긴 변 480). Android 10 미만·실패면 null. */
  private Bitmap loadPoster(Uri uri) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null;
    try {
      Bitmap b = context.getContentResolver().loadThumbnail(uri, new Size(THUMB_MAX_EDGE, THUMB_MAX_EDGE), null);
      Log.i(TAG, "poster ok " + (b == null ? "null" : b.getWidth() + "x" + b.getHeight()));
      return b == null ? null : scale(b, THUMB_MAX_EDGE);
    } catch (Exception ex) {
      Log.i(TAG, "poster unavailable: " + ex.getClass().getSimpleName());
      return null;
    }
  }

  /** 이 밝기(0~255) 이상이면 「어둡지 않은 장면」 */
  static final double MIN_FRAME_LUMA = 24;

  /** 후보 시점(마이크로초): 0.1초 → 1초 → 길이 10% → 길이 50%. 길이를 넘는 시점·중복은 뺀다. */
  static long[] frameCandidatesUs(long durationMs) {
    long d = Math.max(0, durationMs) * 1000L;
    long[] raw = { Math.min(100_000L, d / 100), 1_000_000L, d / 10, d / 2 };
    long[] out = new long[raw.length];
    int n = 0;
    for (long t : raw) {
      if (t < 0 || (d > 0 && t >= d)) continue;
      boolean dup = false;
      for (int i = 0; i < n; i++) if (Math.abs(out[i] - t) < 50_000L) dup = true;
      if (!dup) out[n++] = t;
    }
    if (n == 0) return new long[] { 0 };
    long[] res = new long[n];
    System.arraycopy(out, 0, res, 0, n);
    return res;
  }

  /** 16×16 로 줄인 평균 밝기(0~255) */
  static double averageLuma(Bitmap b) {
    Bitmap s = Bitmap.createScaledBitmap(b, 16, 16, true);
    int[] px = new int[256];
    s.getPixels(px, 0, 16, 0, 0, 16, 16);
    double sum = 0;
    for (int c : px) {
      sum += 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
    }
    if (s != b) s.recycle();
    return sum / 256.0;
  }

  /** 어둡지 않은 첫 장면. 모두 어두우면 가장 밝은 장면. */
  private static Bitmap bestFrame(MediaMetadataRetriever r, long durationMs) {
    Bitmap best = null;
    double bestLuma = -1;
    for (long t : frameCandidatesUs(durationMs)) {
      Bitmap f = r.getFrameAtTime(t, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
      if (f == null) continue;
      double luma = averageLuma(f);
      if (luma >= MIN_FRAME_LUMA) return f;
      if (luma > bestLuma) {
        best = f;
        bestLuma = luma;
      }
    }
    return best;
  }

  private long querySize(Uri uri) {
    ContentResolver resolver = context.getContentResolver();
    try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
      if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
    } catch (Exception ignored) {
      /* ignore */
    }
    return 0;
  }

  Entry get(String id) {
    return id == null ? null : entries.get(id);
  }

  /** 압축(또는 복사) + 썸네일. 콜백은 메인 스레드. */
  void prepare(String id, PrepareCallback cb) {
    Entry e = entries.get(id);
    if (e == null) {
      cb.done(null, false, "not_found");
      return;
    }
    if (e.video != null && e.thumb != null && e.video.exists() && e.thumb.exists()) {
      cb.done(e, e.transcoded, null);
      return;
    }
    e.cancelled = false;
    File out = new File(workDir(), e.id + ".mp4");
    io.execute(() -> {
      long bytesPerSec = e.durationMs > 0 ? (e.sourceBytes * 1000L) / e.durationMs : Long.MAX_VALUE;
      boolean passthrough =
        "video/mp4".equals(e.sourceMime) &&
        Math.max(e.width, e.height) <= MAX_LONG_EDGE &&
        e.sourceBytes > 0 &&
        bytesPerSec <= PASSTHROUGH_MAX_BYTES_PER_SEC &&
        isH264(e.source);
      if (!passthrough) {
        main.post(() -> startTranscode(e, out, cb));
        return;
      }
      boolean ok = copy(e.source, out);
      if (ok && !e.cancelled) ok = writeThumb(e, out);
      final boolean fin = ok && !e.cancelled;
      if (fin) {
        e.video = out;
        e.transcoded = false;
      } else {
        //noinspection ResultOfMethodCallIgnored
        out.delete();
      }
      main.post(() -> cb.done(fin ? e : null, false, fin ? null : (e.cancelled ? "cancelled" : "copy_failed")));
    });
  }

  /** 영상 트랙이 H.264(video/avc) 인가 — HEVC 등은 일부 기기·브라우저가 재생 못 해 복사 대상에서 뺀다 */
  private boolean isH264(Uri uri) {
    android.media.MediaExtractor ex = new android.media.MediaExtractor();
    try {
      ex.setDataSource(context, uri, null);
      for (int i = 0; i < ex.getTrackCount(); i++) {
        String mime = ex.getTrackFormat(i).getString(android.media.MediaFormat.KEY_MIME);
        if (mime != null && mime.startsWith("video/")) return MimeTypes.VIDEO_H264.equals(mime);
      }
      return false;
    } catch (Exception e) {
      return false;
    } finally {
      ex.release();
    }
  }

  private void startTranscode(Entry e, File out, PrepareCallback cb) {
    if (e.cancelled) {
      cb.done(null, false, "cancelled");
      return;
    }
    double scale = Math.min(1.0, (double) MAX_LONG_EDGE / Math.max(1, Math.max(e.width, e.height)));
    int tw = even((int) Math.round(e.width * scale));
    int th = even((int) Math.round(e.height * scale));
    EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(e.source))
      .setEffects(
        new Effects(
          ImmutableList.of(),
          ImmutableList.of(Presentation.createForWidthAndHeight(tw, th, Presentation.LAYOUT_SCALE_TO_FIT))
        )
      )
      .build();
    DefaultEncoderFactory encoders = new DefaultEncoderFactory.Builder(context)
      .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(VIDEO_BITRATE).build())
      .setEnableFallback(true)
      .build();
    Transformer transformer = new Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .setEncoderFactory(encoders)
      .addListener(
        new Transformer.Listener() {
          @Override
          public void onCompleted(@NonNull Composition composition, @NonNull ExportResult result) {
            e.transformer = null;
            io.execute(() -> {
              boolean ok = !e.cancelled && writeThumb(e, out);
              if (ok) {
                e.video = out;
                e.transcoded = true;
              } else {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
              }
              main.post(() -> cb.done(ok ? e : null, true, ok ? null : "thumb_failed"));
            });
          }

          @Override
          public void onError(
            @NonNull Composition composition,
            @NonNull ExportResult result,
            @NonNull ExportException exception
          ) {
            e.transformer = null;
            Log.w(TAG, "transcode failed", exception);
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            cb.done(null, false, e.cancelled ? "cancelled" : "transcode_failed_" + exception.getErrorCodeName());
          }
        }
      )
      .build();
    e.transformer = transformer;
    transformer.start(item, out.getAbsolutePath());
    final ProgressHolder holder = new ProgressHolder();
    main.postDelayed(
      new Runnable() {
        @Override
        public void run() {
          Transformer t = e.transformer;
          if (t == null) return;
          int state = t.getProgress(holder);
          if (state == Transformer.PROGRESS_STATE_AVAILABLE) sink.emit(e.id, "transcode", holder.progress / 100.0);
          main.postDelayed(this, 300);
        }
      },
      300
    );
  }

  /** 썸네일 JPEG(긴 변 480 이하, 512KB 이하) — 대표 사진이 있으면 그것, 없으면 결과 영상의 어둡지 않은 장면. */
  private boolean writeThumb(Entry e, File video) {
    MediaMetadataRetriever r = new MediaMetadataRetriever();
    try {
      Bitmap frame = e.poster;
      if (frame == null) {
        r.setDataSource(video.getAbsolutePath());
        frame = bestFrame(r, parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)));
      }
      if (frame == null) return false;
      Bitmap small = scale(frame, THUMB_MAX_EDGE);
      byte[] bytes = null;
      for (int q : new int[] { 80, 60, 40 }) {
        bytes = jpeg(small, q);
        if (bytes.length <= THUMB_MAX_BYTES) break;
      }
      if (bytes == null || bytes.length > THUMB_MAX_BYTES) return false;
      File thumb = new File(workDir(), e.id + ".thumb.jpg");
      try (OutputStream os = new FileOutputStream(thumb)) {
        os.write(bytes);
      }
      e.thumb = thumb;
      return true;
    } catch (Exception ex) {
      Log.w(TAG, "thumb failed", ex);
      return false;
    } finally {
      try {
        r.release();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
  }

  /** 결과 영상의 표시 크기·길이 */
  long[] outputMeta(File video) {
    MediaMetadataRetriever r = new MediaMetadataRetriever();
    try {
      r.setDataSource(video.getAbsolutePath());
      long d = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
      long w = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
      long h = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
      long rot = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
      if (rot == 90 || rot == 270) return new long[] { d, h, w };
      return new long[] { d, w, h };
    } catch (Exception ex) {
      return new long[] { 0, 0, 0 };
    } finally {
      try {
        r.release();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
  }

  interface UploadCallback {
    void done(boolean ok, boolean cancelled, String error);
  }

  /** 서명 URL 로 썸네일 → 영상 PUT(백그라운드). 진행률 videoProgress {id, phase:"upload"}. */
  void upload(String id, String videoUrl, String thumbUrl, String videoContentType, UploadCallback cb) {
    Entry e = entries.get(id);
    if (e == null || e.video == null || e.thumb == null) {
      cb.done(false, false, "not_prepared");
      return;
    }
    e.cancelled = false;
    e.lastError = null;
    io.execute(() -> {
      boolean ok = put(e, thumbUrl, e.thumb, "image/jpeg", false, "thumb") && put(e, videoUrl, e.video, videoContentType, true, "video");
      final boolean cancelled = e.cancelled;
      final String err = ok ? null : e.lastError;
      main.post(() -> cb.done(ok && !cancelled, cancelled, err));
    });
  }

  private boolean put(Entry e, String url, File file, String contentType, boolean report, String label) {
    if (e.cancelled) return false;
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) new URL(url).openConnection();
      e.connection = conn;
      conn.setRequestMethod("PUT");
      conn.setDoOutput(true);
      conn.setConnectTimeout(20_000);
      conn.setReadTimeout(60_000);
      conn.setRequestProperty("content-type", contentType);
      conn.setRequestProperty("x-upsert", "false");
      long total = file.length();
      conn.setFixedLengthStreamingMode(total);
      long sent = 0;
      int lastPct = -1;
      try (InputStream in = new FileInputStream(file); OutputStream os = conn.getOutputStream()) {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) {
          if (e.cancelled) return false;
          os.write(buf, 0, n);
          sent += n;
          int pct = (int) (sent * 100 / Math.max(1, total));
          if (report && pct != lastPct) {
            lastPct = pct;
            sink.emit(e.id, "upload", pct / 100.0);
          }
        }
      }
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) e.lastError = label + "_http_" + code;
      return code >= 200 && code < 300;
    } catch (Exception ex) {
      if (!e.cancelled) Log.w(TAG, "put failed", ex);
      e.lastError = label + "_network_" + ex.getClass().getSimpleName();
      return false;
    } finally {
      e.connection = null;
      if (conn != null) conn.disconnect();
    }
  }

  void cancel(String id) {
    Entry e = entries.get(id);
    if (e == null) return;
    e.cancelled = true;
    HttpURLConnection c = e.connection;
    if (c != null) {
      io.execute(c::disconnect);
    }
    main.post(() -> {
      Transformer t = e.transformer;
      if (t != null) {
        try {
          t.cancel();
        } catch (Exception ignored) {
          /* ignore */
        }
        e.transformer = null;
      }
    });
  }

  void release(String id) {
    Entry e = entries.remove(id);
    if (e == null) return;
    cancel(id);
    e.cancelled = true;
    io.execute(() -> {
      if (e.video != null) {
        //noinspection ResultOfMethodCallIgnored
        e.video.delete();
      }
      if (e.thumb != null) {
        //noinspection ResultOfMethodCallIgnored
        e.thumb.delete();
      }
      //noinspection ResultOfMethodCallIgnored
      new File(workDir(), e.id + ".mp4").delete();
    });
  }

  private boolean copy(Uri source, File out) {
    try (InputStream in = context.getContentResolver().openInputStream(source); OutputStream os = new FileOutputStream(out)) {
      if (in == null) return false;
      byte[] buf = new byte[64 * 1024];
      int n;
      while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
      return true;
    } catch (Exception ex) {
      Log.w(TAG, "copy failed", ex);
      //noinspection ResultOfMethodCallIgnored
      out.delete();
      return false;
    }
  }

  private static Bitmap scale(Bitmap src, int maxEdge) {
    int w = src.getWidth();
    int h = src.getHeight();
    int edge = Math.max(w, h);
    if (edge <= maxEdge) return src;
    double s = (double) maxEdge / edge;
    return Bitmap.createScaledBitmap(src, Math.max(1, (int) Math.round(w * s)), Math.max(1, (int) Math.round(h * s)), true);
  }

  private static byte[] jpeg(Bitmap b, int q) {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    b.compress(Bitmap.CompressFormat.JPEG, q, bos);
    return bos.toByteArray();
  }

  private static int even(int v) {
    int x = Math.max(2, v);
    return x % 2 == 0 ? x : x - 1;
  }

  private static long parseLong(String s) {
    try {
      return s == null ? 0 : Long.parseLong(s.trim());
    } catch (NumberFormatException e) {
      return 0;
    }
  }
}
