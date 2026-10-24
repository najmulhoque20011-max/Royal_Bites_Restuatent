# Royal Bites — Supabase starter

This package replaces the previous Firebase-based admin setup with Supabase Auth, Postgres, Row Level Security, and Storage.

Quick start: read `SETUP.md`, configure `config.js` with your Supabase Project URL and publishable/anon key, run `supabase-setup.sql` in Supabase SQL Editor, create an Auth user, and approve its UUID in `public.admins`.

Never put a Supabase `service_role` key in browser code. Checkout stock deduction is not fully implemented as a trusted server-side flow in this starter; test before using it for real orders.
