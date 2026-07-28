
CREATE OR REPLACE FUNCTION public.report_equipment_breakdown(_equipment_id uuid, _description text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.equipment_events (equipment_id, kind, description, performed_at, created_by)
  VALUES (_equipment_id, 'awaria', NULLIF(_description, ''), now(), auth.uid())
  RETURNING id INTO v_event_id;

  UPDATE public.equipment SET status = 'awaria' WHERE id = _equipment_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_equipment_breakdown(uuid, text) TO authenticated;
