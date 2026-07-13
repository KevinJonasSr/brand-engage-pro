-- Auto-promote known emails to super-admin on signup.
-- Fires after a new row is inserted into auth.users.
-- Add or remove emails from the array below to manage the list.

create or replace function public.auto_promote_superadmin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  superadmin_emails text[] := array[
    'go4it@jonasgroup.com',
    'kevinjonassr@gmail.com',
    'kevin.jonas@jonasgroup.com',
    'syncnatra@gmail.com',
    'hanaproductmanager@gmail.com',
    'aiassistant@jonasgroup.com',
    'carla@jonasgroup.com',
    'raymond@jonasgroup.com'
  ];
begin
  if lower(new.email) = any(superadmin_emails) then
    insert into public.admin_users (user_id, community_id, role)
    values (new.id, '*', 'owner')
    on conflict (user_id, community_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_promote_superadmin on auth.users;
create trigger trg_auto_promote_superadmin
  after insert on auth.users
  for each row
  execute function public.auto_promote_superadmin();
