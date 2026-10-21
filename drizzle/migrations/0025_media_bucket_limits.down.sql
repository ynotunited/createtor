-- migrate:no-transaction
-- ========== ROLLBACK for 0025_media_bucket_limits ==========
-- Restores the bucket to "no explicit limit" (the platform default). The client
-- uploader keeps checking size and MIME, so code does not need to be reverted.

update storage.buckets
set file_size_limit = null, allowed_mime_types = null
where id = 'media';
