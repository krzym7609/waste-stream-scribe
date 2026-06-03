
-- ============ schedule_executions ============
CREATE TABLE public.schedule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.schedule_tasks(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_shift shift_type NOT NULL,
  duty_session_id uuid REFERENCES public.duty_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','deferred')),
  completed_at timestamptz,
  completed_by uuid,
  deferred_from_session_id uuid REFERENCES public.duty_sessions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, scheduled_date, scheduled_shift)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_executions TO authenticated;
GRANT ALL ON public.schedule_executions TO service_role;
ALTER TABLE public.schedule_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą wykonania" ON public.schedule_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operator edytuje wykonania zmiany" ON public.schedule_executions FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Operator aktualizuje wykonania zmiany" ON public.schedule_executions FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Kierownik usuwa wykonania" ON public.schedule_executions FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_se_touch BEFORE UPDATE ON public.schedule_executions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_se_date_shift ON public.schedule_executions(scheduled_date, scheduled_shift);
CREATE INDEX idx_se_session ON public.schedule_executions(duty_session_id);

-- ============ shift_reports ============
CREATE TABLE public.shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_session_id uuid NOT NULL UNIQUE REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  energia_start numeric,
  energia_end numeric,
  flokulant_proszkowy_kg numeric,
  flokulant_emulsyjny_l numeric,
  wapno_kg numeric,
  chlorek_zelaza_l numeric,
  sm_osadu_zageszcz numeric,
  sm_osadu_odwwapn numeric,
  opady boolean NOT NULL DEFAULT false,
  uwagi text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_reports TO authenticated;
GRANT ALL ON public.shift_reports TO service_role;
ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą raporty" ON public.shift_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operator tworzy własny raport" ON public.shift_reports FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'));
CREATE POLICY "Operator edytuje własny raport" ON public.shift_reports FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))
  WITH CHECK (submitted_by = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_sr_touch BEFORE UPDATE ON public.shift_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ shift_report_items ============
CREATE TABLE public.shift_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.shift_reports(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES public.report_objects(id) ON DELETE CASCADE,
  ocena_status text NOT NULL DEFAULT 'ok' CHECK (ocena_status IN ('ok','problem')),
  ocena_opis text,
  harmonogram_status text NOT NULL DEFAULT 'ok' CHECK (harmonogram_status IN ('ok','nie_wykonano')),
  harmonogram_opis text,
  proponowany_termin date,
  inne_czynnosci text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, object_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_report_items TO authenticated;
GRANT ALL ON public.shift_report_items TO service_role;
ALTER TABLE public.shift_report_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą pozycje raportu" ON public.shift_report_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operator zarządza pozycjami swojego raportu" ON public.shift_report_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shift_reports r WHERE r.id = report_id AND (r.submitted_by = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shift_reports r WHERE r.id = report_id AND (r.submitted_by = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))));
CREATE TRIGGER trg_sri_touch BEFORE UPDATE ON public.shift_report_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ handover_reports ============
CREATE TABLE public.handover_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_session_from_id uuid NOT NULL REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
  duty_session_to_id uuid REFERENCES public.duty_sessions(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  uwagi_ogolne text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_reports TO authenticated;
GRANT ALL ON public.handover_reports TO service_role;
ALTER TABLE public.handover_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą przekazania" ON public.handover_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operator tworzy przekazanie" ON public.handover_reports FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'));
CREATE POLICY "Operator aktualizuje przekazanie" ON public.handover_reports FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))
  WITH CHECK (from_user_id = auth.uid() OR to_user_id = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_hr_touch BEFORE UPDATE ON public.handover_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ handover_report_items ============
CREATE TABLE public.handover_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES public.handover_reports(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES public.handover_objects(id) ON DELETE CASCADE,
  uwagi_przekazujacego text,
  uwagi_przyjmujacego text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(handover_id, object_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_report_items TO authenticated;
GRANT ALL ON public.handover_report_items TO service_role;
ALTER TABLE public.handover_report_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą pozycje przekazania" ON public.handover_report_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Edycja pozycji przekazania" ON public.handover_report_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.handover_reports h WHERE h.id = handover_id AND (h.from_user_id = auth.uid() OR h.to_user_id = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.handover_reports h WHERE h.id = handover_id AND (h.from_user_id = auth.uid() OR h.to_user_id = auth.uid() OR has_role(auth.uid(),'kierownik') OR has_role(auth.uid(),'admin'))));
CREATE TRIGGER trg_hri_touch BEFORE UPDATE ON public.handover_report_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ shift_notifications ============
CREATE TABLE public.shift_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid,
  recipient_role app_role,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  related_session_id uuid REFERENCES public.duty_sessions(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_notifications TO authenticated;
GRANT ALL ON public.shift_notifications TO service_role;
ALTER TABLE public.shift_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Odbiorca widzi powiadomienia" ON public.shift_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR (recipient_role IS NOT NULL AND has_role(auth.uid(), recipient_role)) OR has_role(auth.uid(),'admin'));
CREATE POLICY "Tworzenie powiadomień" ON public.shift_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Aktualizacja powiadomień" ON public.shift_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (recipient_user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE INDEX idx_sn_recipient ON public.shift_notifications(recipient_user_id, read_at);
