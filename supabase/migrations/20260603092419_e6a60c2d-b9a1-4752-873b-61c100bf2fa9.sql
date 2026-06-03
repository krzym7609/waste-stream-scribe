
-- Snapshots for shift_reports edits by manager
CREATE TABLE public.shift_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.shift_reports(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  items_snapshot jsonb NOT NULL,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

GRANT SELECT, INSERT ON public.shift_report_snapshots TO authenticated;
GRANT ALL ON public.shift_report_snapshots TO service_role;

ALTER TABLE public.shift_report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą snapshoty raportów"
  ON public.shift_report_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik/admin tworzy snapshoty raportów"
  ON public.shift_report_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    edited_by = auth.uid()
    AND (has_role(auth.uid(), 'kierownik'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Snapshots for handover_reports edits by manager
CREATE TABLE public.handover_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES public.handover_reports(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  items_snapshot jsonb NOT NULL,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

GRANT SELECT, INSERT ON public.handover_report_snapshots TO authenticated;
GRANT ALL ON public.handover_report_snapshots TO service_role;

ALTER TABLE public.handover_report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą snapshoty przekazań"
  ON public.handover_report_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik/admin tworzy snapshoty przekazań"
  ON public.handover_report_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    edited_by = auth.uid()
    AND (has_role(auth.uid(), 'kierownik'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Add "locked" flag on shift_reports so operator cannot edit after shift end
ALTER TABLE public.shift_reports ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.handover_reports ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- Tighten UPDATE policies: operator only when not locked; manager always (creates snapshot client-side)
DROP POLICY IF EXISTS "Operator edytuje własny raport" ON public.shift_reports;
CREATE POLICY "Operator edytuje własny raport"
  ON public.shift_reports FOR UPDATE TO authenticated
  USING (
    (submitted_by = auth.uid() AND locked_at IS NULL)
    OR has_role(auth.uid(), 'kierownik'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (submitted_by = auth.uid() AND locked_at IS NULL)
    OR has_role(auth.uid(), 'kierownik'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Operator aktualizuje przekazanie" ON public.handover_reports;
CREATE POLICY "Operator aktualizuje przekazanie"
  ON public.handover_reports FOR UPDATE TO authenticated
  USING (
    (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())) AND locked_at IS NULL)
    OR has_role(auth.uid(), 'kierownik'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())) AND locked_at IS NULL)
    OR has_role(auth.uid(), 'kierownik'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
