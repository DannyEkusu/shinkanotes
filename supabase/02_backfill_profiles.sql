-- OPTIONAL one-time repair. Run ONLY if someone signed up BEFORE 01_auth_profiles.sql was run
-- (their profile row is missing, so choosing an avatar can't be saved).
-- Effect: adds a profile row for every existing auth user that doesn't have one. Inserts only;
-- it never updates, overwrites or deletes anything, and re-running it adds nothing extra.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
