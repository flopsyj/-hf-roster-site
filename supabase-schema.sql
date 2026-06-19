-- High Functioning Roster — Supabase schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New Query)

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  passcode text,
  class_name text not null default 'Barbarian',
  role text not null default 'Member',
  combat_power numeric,
  resonance numeric,
  team text not null default 'Unassigned',
  shadow_war_active boolean not null default true,
  notes text,
  strength numeric,
  fortitude numeric,
  willpower numeric,
  intelligence numeric,
  vitality numeric,
  crit_chance numeric,
  crit_damage numeric,
  armor numeric,
  potency numeric,
  resistance numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  week_key text not null,
  thursday boolean not null default false,
  saturday boolean not null default false,
  unique (member_id, week_key)
);

create table if not exists app_settings (
  key text primary key,
  value text not null
);

insert into app_settings (key, value)
values ('owner_passcode', 'hf2026')
on conflict (key) do nothing;

-- Row Level Security: open read/write via anon key.
-- This app has no real auth layer (it's a clan tool, not a bank),
-- so access control happens in the app UI via passcodes, not at the DB level.
alter table members enable row level security;
alter table attendance enable row level security;
alter table app_settings enable row level security;

create policy "public read members" on members for select using (true);
create policy "public write members" on members for insert with check (true);
create policy "public update members" on members for update using (true);
create policy "public delete members" on members for delete using (true);

create policy "public read attendance" on attendance for select using (true);
create policy "public write attendance" on attendance for insert with check (true);
create policy "public update attendance" on attendance for update using (true);
create policy "public delete attendance" on attendance for delete using (true);

create policy "public read settings" on app_settings for select using (true);
create policy "public update settings" on app_settings for update using (true);
