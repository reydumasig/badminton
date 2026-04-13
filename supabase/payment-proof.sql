-- ============================================================
-- Payment Proof Feature — Migration
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Add payment proof URL column to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

-- 2. Fix court_number constraint to allow courts 1–3 only
--    (drop any old constraint and set the correct one)
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_court_number_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_court_number_check
  CHECK (court_number BETWEEN 1 AND 3);

-- ============================================================
-- Storage Bucket Setup
-- Run AFTER the SQL above. Create the bucket via the Storage
-- tab in the Supabase Dashboard, then apply these policies.
--
-- Steps:
--   1. Go to Storage → New Bucket
--   2. Name: payment-proofs
--   3. Public bucket: YES  (so URLs are directly viewable)
--   4. Allowed MIME types: image/jpeg, image/png, image/webp,
--      image/gif, image/heic
--   5. Max file size: 5 MB
--
-- Then run this SQL to lock down direct writes to the bucket
-- (uploads go through our API routes which use the service key):
-- ============================================================

-- Only service role can insert/update/delete objects.
-- Public read is allowed (bucket is public).
-- No anon or authenticated user can write directly.
CREATE POLICY "Service role only write" ON storage.objects
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
