create table if not exists public.vadix_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  domain text not null,
  provider text not null check (provider in ('github','gitlab')),
  repository_owner text not null,
  repository_name text not null,
  default_branch text not null default 'main',
  project_root text not null default '/',
  sitemap_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vadix_site_assignments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.vadix_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','viewer')),
  created_at timestamptz not null default now(),
  unique(site_id, user_id)
);

create index if not exists vadix_site_assignments_user_idx
  on public.vadix_site_assignments(user_id);

create index if not exists vadix_sites_slug_idx
  on public.vadix_sites(slug);

alter table public.vadix_sites enable row level security;
alter table public.vadix_site_assignments enable row level security;

drop policy if exists "Assigned users can view Vadix sites" on public.vadix_sites;
create policy "Assigned users can view Vadix sites"
  on public.vadix_sites for select to authenticated
  using (
    exists (
      select 1 from public.vadix_site_assignments a
      where a.site_id = id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view their Vadix assignments" on public.vadix_site_assignments;
create policy "Users can view their Vadix assignments"
  on public.vadix_site_assignments for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.vadix_sites to authenticated;
grant select on public.vadix_site_assignments to authenticated;
