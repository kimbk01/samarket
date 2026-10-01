-- DIBAY Intro P3: GIF + MP4 assets. Non-destructive bucket configuration change only.
-- Size limit stays 5MB per object (images and, per Owner decision P3, each MP4).
-- Existing objects are untouched.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4'],
    file_size_limit = 5242880
where id in ('launch-intro-drafts', 'launch-intro-assets');
