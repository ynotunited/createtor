-- ========== media bucket upload limits — BACKSTOP ==========
--
-- The Media Library uploader checked file size and MIME type in the browser
-- only; the storage RLS policy checked folder ownership but not size or content
-- type, so a direct upload could store a 200 MB file or an SVG (a stored-XSS
-- risk when served back). These limits now live on the bucket itself, where the
-- Supabase storage API enforces them regardless of which client is talking.
--
-- The MIME allowlist mirrors the client allowlist and deliberately excludes
-- `image/svg+xml` and any wildcard that would accept it.
--
-- This file runs inside a transaction (no `migrate:no-transaction` directive).

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm'
  ]
where id = 'media';
