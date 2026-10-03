-- Just enough of Supabase for the migrations to run in PGlite: the roles, an
-- auth.users table, and auth.uid() reading the JWT claims the way PostgREST
-- sets them.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text
);

create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
