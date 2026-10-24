-- Run in Supabase SQL Editor. After creating your first Auth user, follow the README to approve it.
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade, enabled boolean not null default false);
create table if not exists public.products (
 id text primary key, name text not null, category text not null, price text not null, description text not null default '',
 image_url text, active boolean not null default true, stock_available boolean not null default true,
 stock_quantity integer null check (stock_quantity is null or stock_quantity >= 0), updated_at timestamptz not null default now()
);
alter table public.admins enable row level security;
alter table public.products enable row level security;
-- Public visitors may read active products; only approved admins can write.
drop policy if exists "public can read active products" on public.products;
create policy "public can read active products" on public.products for select using (active = true or exists (select 1 from public.admins a where a.user_id = auth.uid() and a.enabled = true));
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products for all using (exists (select 1 from public.admins a where a.user_id = auth.uid() and a.enabled = true)) with check (exists (select 1 from public.admins a where a.user_id = auth.uid() and a.enabled = true));
drop policy if exists "admins read own approval" on public.admins;
create policy "admins read own approval" on public.admins for select using (user_id = auth.uid());
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('product-images','product-images',true,8388608,array['image/jpeg','image/png','image/webp','image/gif']) on conflict (id) do update set public=true;
drop policy if exists "public view product images" on storage.objects;
create policy "public view product images" on storage.objects for select using (bucket_id='product-images');
drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects for insert to authenticated with check (bucket_id='product-images' and exists(select 1 from public.admins a where a.user_id=auth.uid() and a.enabled=true));
drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects for update to authenticated using (bucket_id='product-images' and exists(select 1 from public.admins a where a.user_id=auth.uid() and a.enabled=true)) with check (bucket_id='product-images' and exists(select 1 from public.admins a where a.user_id=auth.uid() and a.enabled=true));
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects for delete to authenticated using (bucket_id='product-images' and exists(select 1 from public.admins a where a.user_id=auth.uid() and a.enabled=true));
