-- Dodaj kolumny do profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Zaktualizuj handle_new_user: czyta username, phone, role, must_change_password z metadanych
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, username, phone, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'phone',
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false)
  );

  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'operator'::app_role);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);

  RETURN NEW;
END;
$$;

-- Trigger na auth.users (jeśli jeszcze nie istnieje)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Funkcja pomocnicza: login -> email techniczny
CREATE OR REPLACE FUNCTION public.username_to_email(_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(_username) || '@oczyszczalnia.local'
$$;