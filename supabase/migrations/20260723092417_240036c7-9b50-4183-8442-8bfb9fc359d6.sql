DROP POLICY IF EXISTS "Kierownik zarządza szablonem harmonogramu" ON public.schedule_template_entries;
CREATE POLICY "Kierownictwo zarządza szablonem harmonogramu"
  ON public.schedule_template_entries FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid()))
  WITH CHECK (public.is_manager_role(auth.uid()));