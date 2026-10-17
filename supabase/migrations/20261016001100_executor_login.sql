-- Canal servidor mínimo. La contraseña se provisiona fuera de migraciones.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'galcoa_exec_login') then
    create role galcoa_exec_login login inherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls connection limit 5 password null;
  end if;
end
$$;
grant galcoa_executor to galcoa_exec_login with inherit true, set false;
alter role galcoa_exec_login set search_path = '';
alter role galcoa_exec_login set statement_timeout = '5s';
alter role galcoa_exec_login set idle_in_transaction_session_timeout = '10s';
