create table if not exists public.visual_editor_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null check (provider in ('github','gitlab')),
  repository_owner text not null,
  repository_name text not null,
  default_branch text not null default 'main',
  project_root text not null default '/',
  framework text not null default 'unknown',
  settings jsonb not null default '{}'::jsonb,
  last_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visual_editor_projects_owner_updated_idx
  on public.visual_editor_projects (owner_id, updated_at desc);

create table if not exists public.visual_editor_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.visual_editor_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Draft',
  status text not null default 'draft' check (status in ('draft','committed','published')),
  snapshot jsonb not null default '{}'::jsonb,
  changed_files jsonb not null default '[]'::jsonb,
  commit_sha text,
  created_at timestamptz not null default now()
);

create index if not exists visual_editor_revisions_project_created_idx
  on public.visual_editor_revisions (project_id, created_at desc);

alter table public.visual_editor_projects enable row level security;
alter table public.visual_editor_revisions enable row level security;

drop policy if exists "Users manage their visual editor projects" on public.visual_editor_projects;
create policy "Users manage their visual editor projects"
  on public.visual_editor_projects for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users manage their visual editor revisions" on public.visual_editor_revisions;
create policy "Users manage their visual editor revisions"
  on public.visual_editor_revisions for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.visual_editor_projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.visual_editor_projects to authenticated;
grant select, insert, update, delete on public.visual_editor_revisions to authenticated;
