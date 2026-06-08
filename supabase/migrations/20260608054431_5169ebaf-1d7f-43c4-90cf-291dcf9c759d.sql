
-- Tighten shift_notifications INSERT: only allow role-targeted broadcast notifications from clients
DROP POLICY IF EXISTS "Tworzenie powiadomień" ON public.shift_notifications;
CREATE POLICY "Tworzenie powiadomień"
ON public.shift_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  recipient_role IS NOT NULL
  OR has_role(auth.uid(), 'kierownik'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Tighten schedule_executions: require authenticated user (no more bare TRUE)
DROP POLICY IF EXISTS "Operator edytuje wykonania zmiany" ON public.schedule_executions;
CREATE POLICY "Operator edytuje wykonania zmiany"
ON public.schedule_executions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Operator aktualizuje wykonania zmiany" ON public.schedule_executions;
CREATE POLICY "Operator aktualizuje wykonania zmiany"
ON public.schedule_executions
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Lock down handle_new_user SECURITY DEFINER (trigger only; should not be callable by clients)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
