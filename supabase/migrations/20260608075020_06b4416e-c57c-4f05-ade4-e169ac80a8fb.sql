DROP POLICY IF EXISTS "Operator aktualizuje przekazanie" ON public.handover_reports;

CREATE POLICY "Operator aktualizuje przekazanie"
ON public.handover_reports
FOR UPDATE
USING (
  (from_user_id = auth.uid() AND locked_at IS NULL)
  OR (to_user_id = auth.uid() AND locked_at IS NULL)
  OR (to_user_id IS NULL AND accepted_at IS NULL AND locked_at IS NULL AND from_user_id <> auth.uid())
  OR has_role(auth.uid(), 'kierownik'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (from_user_id = auth.uid() AND locked_at IS NULL)
  OR (to_user_id = auth.uid() AND locked_at IS NULL)
  OR has_role(auth.uid(), 'kierownik'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);