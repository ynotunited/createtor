-- ========== enums ==========
create type public.app_role as enum ('admin','user');
create type public.workspace_role as enum ('owner','admin','editor','viewer');
create type public.plan_tier as enum ('free','creator','pro','agency');
create type public.job_status as enum ('queued','processing','generating','rendering','completed','failed','cancelled');
create type public.project_status as enum ('draft','scripting','storyboard','generating','rendering','awaiting_approval','scheduled','published','failed');
create type public.platform as enum ('youtube','youtube_shorts','tiktok','instagram','facebook','x','threads');
create type public.credit_kind as enum ('purchase','grant','reserve','consume','refund');

-- ========== helpers ==========
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ========== profiles ==========
create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ========== roles ==========
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admins read roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- ========== workspaces ==========
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  slug text,
  plan public.plan_tier not null default 'free',
  white_label boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members (user_id);
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspaces to service_role;
grant all on public.workspace_members to service_role;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and w.owner_id = auth.uid()
  )
$$;

create policy "members read workspace" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "create own workspace" on public.workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update workspace" on public.workspaces for update to authenticated using (owner_id = auth.uid());
create policy "owner delete workspace" on public.workspaces for delete to authenticated using (owner_id = auth.uid());
create policy "members read members" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "owner manage members" on public.workspace_members for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();

-- ========== generic workspace-scoped tables ==========
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  niche text,
  audience text,
  content_style text,
  language text not null default 'en',
  voice_id uuid,
  visual_style text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan public.plan_tier not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_credits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade unique,
  balance integer not null default 0,
  reserved integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_consumed integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.credit_kind not null,
  amount integer not null,
  reason text,
  job_id uuid,
  created_at timestamptz not null default now()
);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  title text not null,
  hook text,
  topic text,
  target_audience text,
  suggested_format text,
  estimated_duration_seconds integer,
  emotional_angle text,
  suggested_cta text,
  visual_concept text,
  platform public.platform,
  tone text,
  language text default 'en',
  saved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.research_topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic text not null,
  category text,
  momentum text,
  rationale text,
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idea_id uuid references public.content_ideas(id) on delete set null,
  title text not null,
  hook text,
  introduction text,
  main_content text,
  turning_point text,
  payoff text,
  cta text,
  language text not null default 'en',
  tone text,
  word_count integer not null default 0,
  estimated_duration_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  age text,
  gender text,
  appearance text,
  hairstyle text,
  clothing text,
  personality text,
  voice_id uuid,
  reference_image_urls text[] not null default '{}',
  consistency_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.voices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  provider text not null default 'none',
  provider_voice_id text,
  language text not null default 'en',
  accent text,
  tone text,
  gender text,
  preview_url text,
  is_clone boolean not null default false,
  consent_confirmed boolean not null default false,
  consent_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  script_id uuid references public.scripts(id) on delete set null,
  title text not null,
  status public.project_status not null default 'draft',
  aspect_ratio text not null default '9:16',
  visual_style text,
  voice_id uuid references public.voices(id) on delete set null,
  music_track text,
  caption_style text not null default 'standard',
  duration_seconds integer,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_number integer not null,
  narration text,
  visual_description text,
  image_prompt text,
  video_prompt text,
  camera_movement text,
  character_id uuid references public.characters(id) on delete set null,
  emotion text,
  environment text,
  lighting text,
  duration_seconds numeric(6,2),
  transition text,
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.scenes (project_id, scene_number);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  name text not null,
  folder text,
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric(8,2),
  tags text[] not null default '{}',
  source text not null default 'upload',
  created_at timestamptz not null default now()
);

create table public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  kind text not null,
  provider text,
  status public.job_status not null default 'queued',
  progress integer not null default 0,
  attempts integer not null default 0,
  credits_reserved integer not null default 0,
  credits_consumed integer not null default 0,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.video_jobs (workspace_id, status);

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  platform public.platform,
  status public.job_status not null default 'queued',
  progress integer not null default 0,
  attempts integer not null default 0,
  output_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.platform not null,
  account_name text,
  external_account_id text,
  status text not null default 'disconnected',
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_account_id)
);

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform public.platform not null,
  title text,
  description text,
  hashtags text[] not null default '{}',
  cta text,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.scheduled_posts (workspace_id, scheduled_for);

create table public.published_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  platform public.platform not null,
  external_post_id text,
  external_url text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.analytics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  published_post_id uuid references public.published_posts(id) on delete cascade,
  platform public.platform,
  metric_date date not null default current_date,
  views integer not null default 0,
  watch_time_seconds integer not null default 0,
  avg_view_duration_seconds numeric(8,2) not null default 0,
  retention_percent numeric(5,2),
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  followers_gained integer not null default 0,
  click_through_rate numeric(5,2),
  created_at timestamptz not null default now()
);
create index on public.analytics (workspace_id, metric_date);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  category text not null,
  description text,
  default_aspect_ratio text not null default '9:16',
  default_duration_seconds integer,
  visual_style text,
  caption_style text,
  structure jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.autopilot_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  enabled boolean not null default false,
  mode text not null default 'review',
  niche text,
  audience text,
  language text not null default 'en',
  voice_id uuid references public.voices(id) on delete set null,
  visual_style text,
  platforms public.platform[] not null default '{}',
  videos_per_week integer not null default 3,
  posting_days text[] not null default '{}',
  posting_times text[] not null default '{}',
  video_duration_seconds integer not null default 45,
  content_categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  title text not null,
  body text,
  level text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  topic text,
  hook_type text,
  duration_seconds integer,
  visual_style text,
  voice_id uuid,
  posting_time text,
  platform public.platform,
  views integer not null default 0,
  engagement_rate numeric(6,3),
  retention_percent numeric(5,2),
  created_at timestamptz not null default now()
);

-- ========== grants + RLS for workspace-scoped tables ==========
do $$
declare t text;
begin
  foreach t in array array[
    'channels','subscriptions','usage_credits','credit_transactions','content_ideas','research_topics',
    'scripts','characters','voices','projects','scenes','media_assets','video_jobs','render_jobs',
    'social_accounts','scheduled_posts','published_posts','analytics','autopilot_configs',
    'notifications','audit_logs','content_feedback'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "workspace members access" on public.%I for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- templates: system templates readable by everyone, workspace ones scoped
grant select, insert, update, delete on public.templates to authenticated;
grant select on public.templates to anon;
grant all on public.templates to service_role;
alter table public.templates enable row level security;
create policy "read system templates" on public.templates for select using (is_system = true);
create policy "workspace templates" on public.templates for all to authenticated
  using (workspace_id is not null and public.is_workspace_member(workspace_id))
  with check (workspace_id is not null and public.is_workspace_member(workspace_id));

insert into public.templates (key, name, category, description, default_aspect_ratio, default_duration_seconds, visual_style, caption_style, is_system) values
  ('faceless_story','Faceless Storytelling','storytelling','Narrated story with cinematic b-roll and no on-camera presence.','9:16',60,'cinematic','karaoke',true),
  ('educational','Educational Explainer','educational','Clear teaching structure with on-screen key points.','16:9',180,'clean','standard',true),
  ('documentary','Documentary','storytelling','Slow cinematic pacing with archival-style visuals.','16:9',300,'documentary','minimal',true),
  ('motivational','Motivational','motivation','High-contrast visuals, punchy narration, emotional payoff.','9:16',45,'dramatic','bold',true),
  ('product_ad','Product Advertisement','marketing','Problem, product, proof, offer, call to action.','9:16',30,'bright','bold',true),
  ('talking_avatar','Talking Avatar','avatar','AI presenter delivers the script to camera.','9:16',60,'studio','social short',true),
  ('news','News Brief','news','Fast factual rundown with lower-third styling.','16:9',90,'newsroom','standard',true),
  ('listicle','Listicle','listicle','Countdown format with numbered beats.','9:16',60,'vibrant','karaoke',true),
  ('reaction','Reaction','reaction','Commentary layered over source moments.','9:16',45,'casual','social short',true),
  ('family_story','Fatherhood & Family Storytelling','storytelling','Warm personal narration with intimate visuals.','9:16',75,'warm','minimal',true),
  ('business_explainer','Business Explainer','business','Concise B2B explanation with data visuals.','16:9',150,'corporate','minimal',true);