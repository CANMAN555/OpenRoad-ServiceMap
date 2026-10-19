-- "Add a vendor" requests from the map, saved in the same Supabase project as the Post Board.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Every request then shows up in Dashboard > Table Editor > vr_requests, with no GitHub account needed to send one.
--
-- How it is locked down:
--   * vr_requests has row level security on and no policies, so the public (anon) key cannot touch the table directly.
--   * The map calls vr_submit(), which checks every field and refuses floods (more than 60 requests in an hour,
--     or the same phone number twice in a day).
--   * vr_pending() lists requests Claude has not looked at yet. It returns only what the form asks for, which is
--     public business information (name, address, phone), never who sent it.

create table if not exists vr_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 2 and 100),
  section text not null check (section in ('Towing', 'Other Vendors')),
  services text not null default '' check (length(services) <= 200),
  address text not null check (length(address) between 3 and 120),
  city text not null check (length(city) between 2 and 60),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip text not null default '' check (zip ~ '^(\d{5}(-\d{4})?)?$'),
  phone text not null check (phone ~ '^\d{10}$'),
  notes text not null default '' check (length(notes) <= 600),
  -- new = waiting for Claude; sent = turned into a GitHub request (see issue_url); skipped = not added (see note)
  status text not null default 'new' check (status in ('new', 'sent', 'skipped')),
  issue_url text,
  note text
);
create index if not exists vr_requests_new on vr_requests (created_at) where status = 'new';

alter table vr_requests enable row level security;
revoke all on vr_requests from anon, authenticated;

-- Saves one request. Returns {"ok": true, "id": n} or {"error": "..."} in plain words for the form to show.
create or replace function vr_submit(name text, section text, services text, address text, city text, state text,
                                     zip text, phone text, notes text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(phone, ''), '\D', '', 'g');
  st text := upper(btrim(coalesce(state, '')));
  z text := btrim(coalesce(zip, ''));
  new_id bigint;
begin
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(btrim(coalesce(name, ''))) < 2 then return jsonb_build_object('error', 'The business name is missing.'); end if;
  if section not in ('Towing', 'Other Vendors') then return jsonb_build_object('error', 'Pick a section.'); end if;
  if length(btrim(coalesce(address, ''))) < 3 or length(btrim(coalesce(city, ''))) < 2 or st !~ '^[A-Z]{2}$' then
    return jsonb_build_object('error', 'The street address, city and 2-letter state are all needed.');
  end if;
  if length(d) <> 10 then return jsonb_build_object('error', 'The phone number must be 10 digits.'); end if;
  if z !~ '^(\d{5}(-\d{4})?)?$' then return jsonb_build_object('error', 'The ZIP code should be 5 digits.'); end if;
  if (select count(*) from vr_requests where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'Too many requests right now. Please try again later.');
  end if;
  if exists (select 1 from vr_requests r where r.phone = d and r.created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into vr_requests (name, section, services, address, city, state, zip, phone, notes)
  values (left(btrim(name), 100), section, left(btrim(coalesce(services, '')), 200), left(btrim(address), 120),
          left(btrim(city), 60), st, z, d, left(btrim(coalesce(notes, '')), 600))
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

-- Requests still waiting for Claude, oldest first.
create or replace function vr_pending() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at, 'name', name, 'section', section,
    'services', services, 'address', address, 'city', city, 'state', state, 'zip', zip, 'phone', phone, 'notes', notes)
    order by created_at), '[]'::jsonb)
  from vr_requests where status = 'new'
$$;

grant execute on function vr_submit(text, text, text, text, text, text, text, text, text), vr_pending() to anon;
