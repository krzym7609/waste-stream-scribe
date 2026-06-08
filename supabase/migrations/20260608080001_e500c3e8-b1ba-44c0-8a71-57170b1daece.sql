
CREATE TABLE public.equipment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_categories TO authenticated;
GRANT ALL ON public.equipment_categories TO service_role;
ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą kategorie" ON public.equipment_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Kierownik zarządza kategoriami" ON public.equipment_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik'))
  WITH CHECK (public.has_role(auth.uid(), 'kierownik'));
CREATE TRIGGER trg_equipment_categories_updated_at
  BEFORE UPDATE ON public.equipment_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.equipment_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  location text,
  manufacturer text,
  model text,
  serial_number text,
  installed_at date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą urządzenia" ON public.equipment
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Kierownik zarządza urządzeniami" ON public.equipment
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik'))
  WITH CHECK (public.has_role(auth.uid(), 'kierownik'));
CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_equipment_category ON public.equipment(category_id);
CREATE INDEX idx_equipment_active ON public.equipment(active);

CREATE TYPE public.equipment_attachment_kind AS ENUM ('documentation','photo','schema','service');

CREATE TABLE public.equipment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  kind public.equipment_attachment_kind NOT NULL,
  file_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_attachments TO authenticated;
GRANT ALL ON public.equipment_attachments TO service_role;
ALTER TABLE public.equipment_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zalogowani widzą załączniki" ON public.equipment_attachments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Zalogowani dodają załączniki" ON public.equipment_attachments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Kierownik aktualizuje załączniki" ON public.equipment_attachments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik'))
  WITH CHECK (public.has_role(auth.uid(), 'kierownik'));
CREATE POLICY "Kierownik lub autor usuwa załącznik" ON public.equipment_attachments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'kierownik') OR auth.uid() = uploaded_by);
CREATE INDEX idx_equipment_attachments_equipment ON public.equipment_attachments(equipment_id);

CREATE POLICY "Zalogowani czytają equipment-files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipment-files');
CREATE POLICY "Zalogowani uploadują do equipment-files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipment-files' AND owner = auth.uid());
CREATE POLICY "Kierownik lub autor usuwa equipment-files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipment-files' AND (public.has_role(auth.uid(), 'kierownik') OR owner = auth.uid()));

INSERT INTO public.equipment_categories (name, sort_order) VALUES
  ('Pompy', 10),
  ('Dmuchawy', 20),
  ('Krata i podajnik', 30),
  ('Piaskownik', 40),
  ('Osadniki', 50),
  ('Aparatura elektryczna', 60),
  ('Aparatura kontrolno-pomiarowa', 70),
  ('Inne', 999);
