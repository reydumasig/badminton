-- ============================================================
-- Dizer Badminton Academy – Auth Schema
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Link bookings to Supabase Auth users (nullable for guest bookings)
alter table bookings
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists bookings_user_id_idx on bookings (user_id);

-- Allow authenticated users to read their own bookings
create policy "Users can read own bookings"
  on bookings for select
  using (auth.uid() = user_id);

-- Allow authenticated users to cancel (update status) their own bookings
create policy "Users can update own bookings"
  on bookings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
