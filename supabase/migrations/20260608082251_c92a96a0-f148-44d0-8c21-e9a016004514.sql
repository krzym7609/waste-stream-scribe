
-- Equipment events: timeline of breakdowns, repairs, services, inspections
CREATE TYPE public.equipment_event_kind AS ENUM ('awaria','naprawa','serwis','przeglad','inne');

CREATE TABLE public.equipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  kind public.equipment_event_kind NOT NULL,
  title TEXT,
  description TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX equipment_events_equipment_idx ON public.equipment_events(equipment_id, performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_events TO authenticated;
GRANT ALL ON public.equipment_events TO service_role;

ALTER TABLE public.equipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_authenticated" ON public.equipment_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "events_insert_authenticated" ON public.equipment_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "events_update_manager_or_author" ON public.equipment_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'kierownik') OR created_by = auth.uid());

CREATE POLICY "events_delete_manager_or_author" ON public.equipment_events
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik') OR created_by = auth.uid());

-- Update breakdown notify trigger to include description from most-recent 'awaria' event
CREATE OR REPLACE FUNCTION public.notify_equipment_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desc text;
BEGIN
  IF NEW.status = 'awaria' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT description INTO v_desc
    FROM public.equipment_events
    WHERE equipment_id = NEW.id AND kind = 'awaria'
    ORDER BY performed_at DESC
    LIMIT 1;

    INSERT INTO public.shift_notifications (recipient_role, kind, title, body)
    VALUES (
      'kierownik',
      'equipment_breakdown',
      'Awaria urządzenia: ' || NEW.name,
      COALESCE('Lokalizacja: ' || NEW.location, '') ||
      CASE WHEN NEW.code IS NOT NULL THEN ' (kod ' || NEW.code || ')' ELSE '' END ||
      CASE WHEN v_desc IS NOT NULL AND length(v_desc) > 0 THEN E'\nOpis: ' || v_desc ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$function$;
