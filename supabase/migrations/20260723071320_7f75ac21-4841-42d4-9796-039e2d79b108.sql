
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'zarzadca';

UPDATE public.shifts SET shift_type = 'popoludnie' WHERE shift_type = 'noc';
UPDATE public.duty_sessions SET shift_type = 'popoludnie' WHERE shift_type = 'noc';
UPDATE public.schedule_executions SET scheduled_shift = 'popoludnie' WHERE scheduled_shift = 'noc';

-- Tablice: usuń 'noc' i dodaj 'popoludnie' jeśli brak
UPDATE public.schedule_template_entries
  SET shifts = (SELECT ARRAY(SELECT DISTINCT unnest(array_replace(shifts, 'noc'::shift_type, 'popoludnie'::shift_type))))
  WHERE 'noc' = ANY(shifts);

UPDATE public.schedule_overrides
  SET shifts = (SELECT ARRAY(SELECT DISTINCT unnest(array_replace(shifts, 'noc'::shift_type, 'popoludnie'::shift_type))))
  WHERE 'noc' = ANY(shifts);

UPDATE public.schedule_month_overrides
  SET shifts = (SELECT ARRAY(SELECT DISTINCT unnest(array_replace(shifts, 'noc'::shift_type, 'popoludnie'::shift_type))))
  WHERE 'noc' = ANY(shifts);
