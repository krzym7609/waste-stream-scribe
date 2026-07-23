
-- ============================================
-- A. Pomocnicze funkcje ról
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin_role(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','zarzadca'))
$$;

CREATE OR REPLACE FUNCTION public.is_manager_role(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','zarzadca','kierownik'))
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_role(uuid) TO authenticated;

-- ============================================
-- B. Obiekty oczyszczalni
-- ============================================
CREATE TABLE public.plant_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_objects TO authenticated;
GRANT ALL ON public.plant_objects TO service_role;
ALTER TABLE public.plant_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą obiekty" ON public.plant_objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Kierownik/zarządca zarządza obiektami" ON public.plant_objects FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));
CREATE TRIGGER trg_plant_objects_touch BEFORE UPDATE ON public.plant_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.plant_objects (code, name, sort_order) VALUES
 ('KRA','Budynek krat',1),
 ('PIA','Piaskowniki i odtłuszczacze',2),
 ('ZUS','Zbiornik uśredniająco-sedymentacyjny',3),
 ('POW','Przepompownia osadu wstępnego',4),
 ('DMU','Stacja dmuchaw',5),
 ('KNE','Komora neutralizacji (Selektor)',6),
 ('KOCZ','Komora osadu czynnego (KOCZ)',7),
 ('PRC','Przepompownia recyrkulacyjna i osadu nadmiernego/czynnego',8),
 ('OSW','Osadniki wtórne',9),
 ('PCP','Przepompownia części pływających',10),
 ('KPO','Punkt kontrolno-pomiarowy ścieków oczyszczonych',11),
 ('ZAG','Zagęszczacze osadu',12),
 ('SMO','Stacja mechanicznego odwadniania osadu',13),
 ('PWP','Przepompownia wód poosadowych',14);

-- ============================================
-- C. Urządzenia: przypisanie do obiektu + reset danych
-- ============================================
ALTER TABLE public.equipment ADD COLUMN object_id uuid REFERENCES public.plant_objects(id) ON DELETE SET NULL;
CREATE INDEX idx_equipment_object ON public.equipment(object_id);

-- Kasowanie starych rekordów urządzeń (kaskadowo także eventy i załączniki)
DELETE FROM public.equipment;

-- Wprowadzenie urządzeń wg dokumentacji
INSERT INTO public.equipment (object_id, name, code, location, status, active)
SELECT po.id, x.name, x.code, po.name, 'sprawne', true FROM public.plant_objects po
JOIN (VALUES
  ('KRA','Krata mechaniczna schodkowa OZ-C','KRA-KM'),
  ('KRA','Krata ręczna awaryjna','KRA-KR'),
  ('KRA','Podajnik skratek PH-220','KRA-PS'),
  ('KRA','Wentylator W1','KRA-W1'),
  ('KRA','Wentylator W2','KRA-W2'),
  ('KRA','Wentylator W3','KRA-W3'),
  ('KRA','Wentylator W4','KRA-W4'),

  ('PIA','Zgarniacz piaskownika','PIA-ZP'),
  ('PIA','Zgarniacz części pływających','PIA-ZCP'),
  ('PIA','Pompa piasku PP1','PIA-PP1'),
  ('PIA','Pompa piasku PP2','PIA-PP2'),
  ('PIA','Pompa tłuszczy PP3','PIA-PP3'),

  ('ZUS','Zgarniacz osadu','ZUS-ZO'),

  ('POW','Pompa osadu wstępnego','POW-PO'),

  ('DMU','Dmuchawa GM25S nr 1','DMU-D1'),
  ('DMU','Dmuchawa GM25S nr 2','DMU-D2'),
  ('DMU','Dmuchawa GM35S nr 3','DMU-D3'),
  ('DMU','Dmuchawa GM35S nr 4','DMU-D4'),
  ('DMU','Dmuchawa GM25S nr 5','DMU-D5'),
  ('DMU','Wentylator W1','DMU-W1'),
  ('DMU','Wentylator W2','DMU-W2'),
  ('DMU','Wentylator W3','DMU-W3'),
  ('DMU','Wentylator W4','DMU-W4'),
  ('DMU','Wentylator W5','DMU-W5'),

  ('KNE','Mieszadło','KNE-M'),

  ('KOCZ','Mieszadło 1','KOCZ-M1'),
  ('KOCZ','Mieszadło 2','KOCZ-M2'),
  ('KOCZ','Aparatura pomiarowa (sondy)','KOCZ-AP'),
  ('KOCZ','Membrany napowietrzające','KOCZ-MEM'),

  ('PRC','Pompa Sulzer 1','PRC-S1'),
  ('PRC','Pompa Sulzer 2','PRC-S2'),
  ('PRC','Pompa Pumpex KF-84','PRC-KF84'),

  ('OSW','Zgarniacz osadnika','OSW-ZO'),

  ('PCP','Pompa osadnika (części pływające)','PCP-PO'),

  ('KPO','Aparatura pomiarowa (sondy)','KPO-AP'),
  ('KPO','Sampler','KPO-SM'),

  ('ZAG','Mieszadła zagęszczaczy','ZAG-M'),

  ('SMO','Stacja dawkowania polielektrolitu','SMO-POL'),
  ('SMO','Pompa ssąco-tłocząca osadu zagęszczonego','SMO-PST'),
  ('SMO','Zbiornik wstępnej koagulacji','SMO-ZWK'),
  ('SMO','Prasa DEWA','SMO-DEWA'),
  ('SMO','Układ pomp wody płuczącej (Filtrakon)','SMO-FIL'),
  ('SMO','Silos na wapno','SMO-SIL'),

  ('PWP','Pompa','PWP-P'),
  ('PWP','Przepływomierz','PWP-PM'),
  ('PWP','Sonda ultradźwiękowa poziomu','PWP-SP')
) AS x(obj, name, code) ON x.obj = po.code;

-- ============================================
-- D. Ustawienia zmian (singleton)
-- ============================================
CREATE TABLE public.shift_settings (
  id boolean PRIMARY KEY DEFAULT true,
  shift1_start time NOT NULL DEFAULT '06:00',
  shift1_end   time NOT NULL DEFAULT '14:00',
  shift2_start time NOT NULL DEFAULT '14:00',
  shift2_end   time NOT NULL DEFAULT '22:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT shift_settings_singleton CHECK (id = true)
);
GRANT SELECT ON public.shift_settings TO authenticated;
GRANT INSERT, UPDATE ON public.shift_settings TO authenticated;
GRANT ALL ON public.shift_settings TO service_role;
ALTER TABLE public.shift_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą ustawienia zmian" ON public.shift_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Kierownik/zarządca edytuje ustawienia zmian" ON public.shift_settings FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));
CREATE TRIGGER trg_ss_touch BEFORE UPDATE ON public.shift_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.shift_settings (id) VALUES (true);

-- Realtime dla synchronizacji
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_settings;

-- ============================================
-- E. RLS: dodanie roli `zarzadca` wszędzie
-- ============================================
-- user_roles: zarządca zarządza rolami kierownik/zarzadca (admin nadal działa)
DROP POLICY IF EXISTS "Admin zarządza rolami" ON public.user_roles;
CREATE POLICY "Admin/zarządca zarządza rolami" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid())) WITH CHECK (public.is_admin_role(auth.uid()));

-- shift_reports: zarządca może edytować wszystko, nawet zablokowane
DROP POLICY IF EXISTS "Operator edytuje własny raport" ON public.shift_reports;
CREATE POLICY "Operator/kierownik/zarządca edytuje raport" ON public.shift_reports FOR UPDATE TO authenticated
  USING (((submitted_by = auth.uid()) AND (locked_at IS NULL)) OR public.is_manager_role(auth.uid()))
  WITH CHECK (((submitted_by = auth.uid()) AND (locked_at IS NULL)) OR public.is_manager_role(auth.uid()));
DROP POLICY IF EXISTS "Operator tworzy własny raport" ON public.shift_reports;
CREATE POLICY "Operator/kierownik/zarządca tworzy raport" ON public.shift_reports FOR INSERT TO authenticated
  WITH CHECK ((submitted_by = auth.uid()) OR public.is_manager_role(auth.uid()));

-- shift_report_items
DROP POLICY IF EXISTS "Operator zarządza pozycjami swojego raportu" ON public.shift_report_items;
CREATE POLICY "Operator/kierownik/zarządca zarządza pozycjami" ON public.shift_report_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shift_reports r WHERE r.id=shift_report_items.report_id
                 AND (r.submitted_by=auth.uid() OR public.is_manager_role(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shift_reports r WHERE r.id=shift_report_items.report_id
                 AND (r.submitted_by=auth.uid() OR public.is_manager_role(auth.uid()))));

-- shifts
DROP POLICY IF EXISTS "Kierownik zarządza zmianami" ON public.shifts;
CREATE POLICY "Kierownik/zarządca zarządza zmianami" ON public.shifts FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));
DROP POLICY IF EXISTS "Operator tworzy swoje zmiany" ON public.shifts;
CREATE POLICY "Operator/kierownik/zarządca tworzy zmiany" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid() OR public.is_manager_role(auth.uid()));

-- equipment / kategorie / eventy / załączniki
DROP POLICY IF EXISTS "Kierownik zarządza urządzeniami" ON public.equipment;
CREATE POLICY "Kierownik/zarządca zarządza urządzeniami" ON public.equipment FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Kierownik zarządza kategoriami" ON public.equipment_categories;
CREATE POLICY "Kierownik/zarządca zarządza kategoriami" ON public.equipment_categories FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Kierownik aktualizuje załączniki" ON public.equipment_attachments;
CREATE POLICY "Kierownik/zarządca aktualizuje załączniki" ON public.equipment_attachments FOR UPDATE TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));
DROP POLICY IF EXISTS "Kierownik lub autor usuwa załącznik" ON public.equipment_attachments;
CREATE POLICY "Kierownik/zarządca lub autor usuwa załącznik" ON public.equipment_attachments FOR DELETE TO authenticated
  USING (public.is_manager_role(auth.uid()) OR auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "events_delete_manager_or_author" ON public.equipment_events;
CREATE POLICY "events_delete_manager_or_author" ON public.equipment_events FOR DELETE TO authenticated
  USING (public.is_manager_role(auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "events_update_manager_or_author" ON public.equipment_events;
CREATE POLICY "events_update_manager_or_author" ON public.equipment_events FOR UPDATE TO authenticated
  USING (public.is_manager_role(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_manager_role(auth.uid()) OR created_by = auth.uid());

-- schedule_*: zarządca pełne prawa
DROP POLICY IF EXISTS "Kierownik zarządza zadaniami harmonogramu" ON public.schedule_tasks;
CREATE POLICY "Kierownik/zarządca zarządza zadaniami harmonogramu" ON public.schedule_tasks FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Kierownik zarządza overrides harmonogramu" ON public.schedule_month_overrides;
CREATE POLICY "Kierownik/zarządca zarządza overrides miesiąca" ON public.schedule_month_overrides FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Kierownik zarządza wyjątkami harmonogramu" ON public.schedule_overrides;
CREATE POLICY "Kierownik/zarządca zarządza wyjątkami" ON public.schedule_overrides FOR ALL TO authenticated
  USING (public.is_manager_role(auth.uid())) WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Kierownik usuwa wykonania" ON public.schedule_executions;
CREATE POLICY "Kierownik/zarządca usuwa wykonania" ON public.schedule_executions FOR DELETE TO authenticated
  USING (public.is_manager_role(auth.uid()));

-- duty_sessions
DROP POLICY IF EXISTS "Pracownik zamyka własny dyżur" ON public.duty_sessions;
CREATE POLICY "Pracownik/kierownik/zarządca zamyka dyżur" ON public.duty_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_manager_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_manager_role(auth.uid()));

-- handover_reports
DROP POLICY IF EXISTS "Operator aktualizuje przekazanie" ON public.handover_reports;
CREATE POLICY "Operator/kierownik/zarządca aktualizuje przekazanie" ON public.handover_reports FOR UPDATE TO authenticated
  USING ((from_user_id=auth.uid() AND locked_at IS NULL)
      OR (to_user_id=auth.uid() AND locked_at IS NULL)
      OR (to_user_id IS NULL AND accepted_at IS NULL AND locked_at IS NULL AND from_user_id <> auth.uid())
      OR public.is_manager_role(auth.uid()))
  WITH CHECK ((from_user_id=auth.uid() AND locked_at IS NULL)
      OR (to_user_id=auth.uid() AND locked_at IS NULL)
      OR (to_user_id IS NULL AND accepted_at IS NULL AND locked_at IS NULL AND from_user_id <> auth.uid())
      OR public.is_manager_role(auth.uid()));

-- shift_notifications: zarządca też
DROP POLICY IF EXISTS "Aktualizacja powiadomień" ON public.shift_notifications;
CREATE POLICY "Aktualizacja powiadomień" ON public.shift_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id=auth.uid()
      OR (recipient_role IS NOT NULL AND public.has_role(auth.uid(), recipient_role))
      OR public.is_admin_role(auth.uid()))
  WITH CHECK (recipient_user_id=auth.uid()
      OR (recipient_role IS NOT NULL AND public.has_role(auth.uid(), recipient_role))
      OR public.is_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Odbiorca widzi powiadomienia" ON public.shift_notifications;
CREATE POLICY "Odbiorca widzi powiadomienia" ON public.shift_notifications FOR SELECT TO authenticated
  USING (recipient_user_id=auth.uid()
      OR (recipient_role IS NOT NULL AND public.has_role(auth.uid(), recipient_role))
      OR public.is_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Tworzenie powiadomień" ON public.shift_notifications;
CREATE POLICY "Tworzenie powiadomień" ON public.shift_notifications FOR INSERT TO authenticated
  WITH CHECK (recipient_role IS NOT NULL OR public.is_manager_role(auth.uid()));
