-- Channel join nudges (24 Nov 2026, founder: get every student into the WhatsApp/Telegram channels for daily updates).
-- WhatsApp channels never reveal followers, so we record what students click in the dashboard popup/card instead.
create table if not exists public.channel_join_clicks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram')),
  action text not null default 'join' check (action in ('join','already')),
  place text not null default 'popup' check (place in ('popup','card','jobs')),
  created_at timestamptz not null default now()
);
create index if not exists channel_join_clicks_user_idx on public.channel_join_clicks (user_id, created_at desc);
alter table public.channel_join_clicks enable row level security;
revoke all on public.channel_join_clicks from anon, authenticated;
grant insert on public.channel_join_clicks to authenticated;
grant usage on sequence public.channel_join_clicks_id_seq to authenticated;
create policy "Students log own channel clicks" on public.channel_join_clicks for insert to authenticated
  with check (user_id = (select auth.uid()));

create or replace function public.admin_channel_joins(p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  return jsonb_build_object(
    'totals', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
       select channel, count(distinct user_id) n from public.channel_join_clicks group by channel) t),
    'students', (select count(distinct user_id) from public.channel_join_clicks),
    'rows', coalesce((select jsonb_agg(r order by r->>'last_at' desc) from (
       select jsonb_build_object('name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)), 'email', u.email,
         'city', p.city, 'career_track', p.career_track,
         'whatsapp', bool_or(c.channel = 'whatsapp'), 'telegram', bool_or(c.channel = 'telegram'),
         'said_already', bool_or(c.action = 'already'), 'last_at', max(c.created_at)) r
       from public.channel_join_clicks c join auth.users u on u.id = c.user_id left join public.profiles p on p.id = c.user_id
       group by c.user_id, u.email, p.full_name, p.city, p.career_track
       order by max(c.created_at) desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) s), '[]'::jsonb));
end $$;
revoke all on function public.admin_channel_joins(integer) from public, anon;
grant execute on function public.admin_channel_joins(integer) to authenticated;
