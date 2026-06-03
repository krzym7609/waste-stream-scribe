CREATE OR REPLACE FUNCTION public.username_to_email(_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(_username) || '@oczyszczalnia.local'
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.username_to_email(text) FROM PUBLIC, anon, authenticated;