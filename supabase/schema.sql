-- ============================================================
-- Dizer Badminton Academy – Supabase Schema
-- Run this once in your Supabase project:
-- Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Enrollment registrations
create table if not exists enrollments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  program     text not null,
  status      text not null default 'new'   -- new | contacted | enrolled | declined
);

-- Contact / inquiry messages
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  phone       text,
  message     text not null,
  status      text not null default 'new'   -- new | read | replied
);

-- Indexes for common query patterns
create index if not exists enrollments_created_at_idx on enrollments (created_at desc);
create index if not exists enrollments_status_idx     on enrollments (status);
create index if not exists contacts_created_at_idx    on contacts (created_at desc);
create index if not exists contacts_status_idx        on contacts (status);

-- Row Level Security: lock down public access.
-- The API routes use the service role key which bypasses RLS,
-- so these tables are safe even with RLS enabled.
alter table enrollments enable row level security;
alter table contacts     enable row level security;

-- No public read/write policies — only service role key can access.
