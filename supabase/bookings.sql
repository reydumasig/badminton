-- ============================================================
-- Dizer Badminton Academy – Bookings Schema
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  date          date not null,
  start_time    time not null,            -- e.g. 08:00:00
  court_number  int not null check (court_number between 1 and 3),
  name          text not null,
  email         text not null,
  phone         text not null,
  status        text not null default 'confirmed',  -- confirmed | cancelled
  notes         text,

  -- Prevent double-booking at DB level
  unique (date, start_time, court_number)
);

-- Indexes
create index if not exists bookings_date_idx        on bookings (date);
create index if not exists bookings_status_idx      on bookings (status);
create index if not exists bookings_email_idx       on bookings (email);

-- RLS
alter table bookings enable row level security;
-- Only service role key (API routes) can read/write bookings
