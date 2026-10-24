# Royal Bites — Supabase setup

This package is a Supabase-based starter. It contains the public menu (`index.html`), admin dashboard (`admin.html`), Supabase client logic (`admin.js`), public menu connector (`public-supabase.js`), starter products (`seed-products.json`), and SQL setup (`supabase-setup.sql`).

## 1. Create Supabase project
1. Open https://supabase.com/dashboard and create a project.
2. In Project Settings → API, copy the Project URL and the publishable/anon key. Never put a `service_role` key in browser code.
3. Put those two values in `config.js` as `supabaseUrl` and `supabaseAnonKey`.

## 2. Create tables and image storage
1. Open Supabase → SQL Editor.
2. Open `supabase-setup.sql`, copy all of it into a new query, and Run.
3. This creates `admins` and `products`, enables RLS, adds policies, and creates the public `product-images` storage bucket.

## 3. Create and approve admin
1. In Supabase → Authentication → Users, add an admin user with email and password (or enable the sign-up method and create one).
2. Copy that user's UUID.
3. In SQL Editor run this, replacing the UUID with your user's UUID: `insert into public.admins (user_id, enabled) values ('YOUR-USER-UUID', true) on conflict (user_id) do update set enabled = true;`
4. Do not share your password or service-role key.

## 4. Test
Serve the folder using a static web host or local development server (ES modules may not work when opening files directly via `file://`). Open `admin.html`, sign in, import starter products, and test changing one product's price, image, and stock. Then open `index.html` and confirm it reads from the same Supabase project.

## Important limitations
- The dashboard login and product editing use Supabase.
- The SQL setup does not create a complete order-processing backend. Do not assume checkout will securely reserve/decrement stock until a Supabase Edge Function or trusted server-side order flow is implemented and tested.
- Public website live syncing and checkout behavior must be tested on your deployed site; a successful admin login alone does not prove the whole site is connected.
