DROP POLICY IF EXISTS "Aktualizacja powiadomień" ON public.shift_notifications;
CREATE POLICY "Aktualizacja powiadomień"
ON public.shift_notifications
FOR UPDATE
TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND has_role(auth.uid(), recipient_role))
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND has_role(auth.uid(), recipient_role))
  OR has_role(auth.uid(), 'admin'::app_role)
);