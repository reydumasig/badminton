-- ============================================================
-- Dizer Badminton Academy – Content Tables
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Programs
create table if not exists programs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  description text not null,
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- Coaches
create table if not exists coaches (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  role          text not null,         -- e.g. "Coaching Director"
  name          text not null,
  credential    text not null,         -- e.g. "BWF Accredited Coach"
  education     text,
  school        text,
  career_notes  text,                  -- free text for career highlights
  sort_order    int not null default 0,
  active        boolean not null default true
);

-- RLS
alter table programs enable row level security;
alter table coaches  enable row level security;

-- Public read policy (programs and coaches are shown on the public site)
create policy "Public can read programs"
  on programs for select using (true);

create policy "Public can read coaches"
  on coaches for select using (true);

-- ============================================================
-- Seed Data – Programs
-- ============================================================
insert into programs (title, description, sort_order) values
  ('Junior Development',           'Foundation training for athletes.',                              1),
  ('High-Performance',             'Advanced training for competitive players.',                     2),
  ('Sponsored Athletes',           'Full or partial support for selected trainees.',                 3),
  ('Corporate and Adult Training', 'Custom programs for working professionals.',                     4)
on conflict do nothing;

-- ============================================================
-- Seed Data – Coaches
-- ============================================================
insert into coaches (role, name, credential, education, school, career_notes, sort_order) values
  (
    'Coaching Director',
    'Ryan Garreth Dizer',
    'BWF Accredited Coach',
    'Bachelor of Physical Education',
    'University of the Philippines, Diliman',
    'Montessori Integrated School of Antipolo | Roots Academy | St. Clare',
    1
  ),
  (
    'Head Coach',
    'Reinald Greg Dizer',
    'BWF Accredited Coach',
    'Bachelor of Science, Physical Therapy',
    'University of Sto. Tomas',
    'Registered Physiotherapist | Physiotherapist in Singapore, 2016-2018 | Strength and Conditioning Coach',
    2
  )
on conflict do nothing;
