ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employment_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_employment_status_check
  CHECK (employment_status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_profiles_employment_status ON public.profiles(employment_status);

UPDATE public.profiles
SET employment_status = 'active'
WHERE employment_status IS NULL;