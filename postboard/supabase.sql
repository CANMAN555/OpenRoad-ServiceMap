-- Post Board database for Supabase.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.
--
-- How it is locked down:
--   * The tables have row level security on and no policies, so the public (anon) key cannot read or write them.
--   * The page only calls the pb_* functions below. Each one checks the PIN first.
--   * After 20 wrong PINs in 10 minutes, every call is refused until the 10 minutes pass.
--
-- The PIN starts as 1234. To change it later, run:
--   update pb_settings set v = extensions.crypt('NEW-PIN', extensions.gen_salt('bf')) where k = 'pin_hash';

create extension if not exists pgcrypto with schema extensions;

create sequence if not exists pb_seq;

create table if not exists pb_docs (
  col text not null check (col in ('units', 'posts', 'events', 'links')),
  id text not null check (length(id) between 1 and 64),
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  seq bigint not null default nextval('pb_seq'),
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists pb_docs_seq on pb_docs (seq);

create table if not exists pb_settings (k text primary key, v text not null);
create table if not exists pb_fails (at timestamptz not null default now());

alter table pb_docs enable row level security;
alter table pb_settings enable row level security;
alter table pb_fails enable row level security;
revoke all on pb_docs, pb_settings, pb_fails from anon, authenticated;

insert into pb_settings (k, v) values ('pin_hash', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (k) do nothing;

-- 'ok', 'bad_pin' or 'locked'. Wrong PINs are counted (no exception, so the count is kept).
create or replace function pb_check(pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if (select count(*) from pb_fails where at > now() - interval '10 minutes') >= 20 then return 'locked'; end if;
  select v into h from pb_settings where k = 'pin_hash';
  if pin is null or h is null or h <> crypt(pin, h) then
    insert into pb_fails default values;
    delete from pb_fails where at < now() - interval '1 day';
    return 'bad_pin';
  end if;
  return 'ok';
end $$;

create or replace function pb_login(pin text) returns text
language sql security definer set search_path = public, extensions as $$ select pb_check(pin) $$;

-- Everything that changed after the given sequence number (deleted documents come back with deleted = true).
create or replace function pb_changes(pin text, since bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s text := pb_check(pin);
begin
  if s <> 'ok' then return jsonb_build_object('error', s); end if;
  return jsonb_build_object(
    'seq', (select coalesce(max(seq), 0) from pb_docs),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('col', col, 'id', id, 'data', data, 'deleted', deleted) order by seq)
                      from pb_docs where seq > coalesce(since, 0)), '[]'::jsonb));
end $$;

-- Create or change one document. merge = true keeps fields the update leaves out.
create or replace function pb_put(pin text, col text, id text, data jsonb, merge boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s text := pb_check(pin);
begin
  if s <> 'ok' then return jsonb_build_object('error', s); end if;
  if pg_column_size(data) > 20000 then return jsonb_build_object('error', 'That entry is too long to save.'); end if;
  insert into pb_docs as d (col, id, data) values (pb_put.col, pb_put.id, pb_put.data)
  on conflict on constraint pb_docs_pkey do update
    set data = case when pb_put.merge and not d.deleted then d.data || excluded.data else excluded.data end,
        deleted = false, seq = nextval('pb_seq'), updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function pb_del(pin text, col text, id text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s text := pb_check(pin);
begin
  if s <> 'ok' then return jsonb_build_object('error', s); end if;
  update pb_docs d set deleted = true, data = '{}'::jsonb, seq = nextval('pb_seq'), updated_at = now()
  where d.col = pb_del.col and d.id = pb_del.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function pb_check(text) from public, anon, authenticated;
grant execute on function pb_login(text), pb_changes(text, bigint), pb_put(text, text, text, jsonb, boolean), pb_del(text, text, text) to anon;
