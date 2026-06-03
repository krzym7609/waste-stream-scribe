
-- ============================================================
-- ETAP A: Słowniki + Harmonogram roczny
-- ============================================================

-- 1) Słownik obiektów raportu zmianowego
CREATE TABLE public.report_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_objects TO authenticated;
GRANT ALL ON public.report_objects TO service_role;

ALTER TABLE public.report_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą obiekty raportu"
  ON public.report_objects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza obiektami raportu"
  ON public.report_objects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_report_objects_updated
  BEFORE UPDATE ON public.report_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 2) Słownik obiektów przekazania zmiany
CREATE TABLE public.handover_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_objects TO authenticated;
GRANT ALL ON public.handover_objects TO service_role;

ALTER TABLE public.handover_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą obiekty przekazania"
  ON public.handover_objects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza obiektami przekazania"
  ON public.handover_objects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_handover_objects_updated
  BEFORE UPDATE ON public.handover_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 3) Słownik 35 zadań eksploatacyjnych
CREATE TABLE public.schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number integer NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_tasks TO authenticated;
GRANT ALL ON public.schedule_tasks TO service_role;

ALTER TABLE public.schedule_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą zadania harmonogramu"
  ON public.schedule_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza zadaniami harmonogramu"
  ON public.schedule_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_schedule_tasks_updated
  BEFORE UPDATE ON public.schedule_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 4) Szablon harmonogramu — pozycje powtarzające się co miesiąc
CREATE TABLE public.schedule_template_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.schedule_tasks(id) ON DELETE CASCADE,
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  shifts shift_type[] NOT NULL DEFAULT '{}',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, day_of_month)
);

CREATE INDEX idx_schedule_template_day ON public.schedule_template_entries(day_of_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_template_entries TO authenticated;
GRANT ALL ON public.schedule_template_entries TO service_role;

ALTER TABLE public.schedule_template_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą szablon harmonogramu"
  ON public.schedule_template_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza szablonem harmonogramu"
  ON public.schedule_template_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_schedule_template_updated
  BEFORE UPDATE ON public.schedule_template_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 5) Wyjątki na konkretną datę (nadpisują szablon)
CREATE TABLE public.schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.schedule_tasks(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  shifts shift_type[] NOT NULL DEFAULT '{}',
  skip boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, override_date)
);

CREATE INDEX idx_schedule_overrides_date ON public.schedule_overrides(override_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_overrides TO authenticated;
GRANT ALL ON public.schedule_overrides TO service_role;

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą wyjątki harmonogramu"
  ON public.schedule_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza wyjątkami harmonogramu"
  ON public.schedule_overrides FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_schedule_overrides_updated
  BEFORE UPDATE ON public.schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============================================================
-- SEED danych (8 obiektów raportu + 10 obiektów przekazania + 35 zadań)
-- ============================================================

INSERT INTO public.report_objects (code, name, sort_order) VALUES
  ('mech',     'Część mechan.: Kratownia, piaskownik, zbior. uśr-sed z przepomp. osadu wstęp.', 10),
  ('dmuchawy', 'Stacja dmuchaw, rozdzielnia, budynek chemiczny, magazyny', 20),
  ('kocz',     'KOCZ z pompownią osadu recyrk. i nadmiernego i wstępną komorą beztlen. (selektor)', 30),
  ('osadniki', 'Osadniki wtórne, pompownie: cz. pływając., Packprofil, melioracyjna, wód poosad.', 40),
  ('odwadnianie','Stacja odwadniania i wapnowania osadów. Zagęszczacze grawitacyjne', 50),
  ('akp',      'Urządzenia kontrolno-pomiarowe i AKP', 60),
  ('ogolne',   'Urządzenia ogólnozakładowe i inne', 70);

INSERT INTO public.handover_objects (code, name, sort_order) VALUES
  ('kratownia',  'Kratownia i urządzenia piaskownika z terenem przyległym', 10),
  ('zbiornik',   'Zbiornik uśr.-sedym. z korytem dopływowym, pompownią osadu wst. i terenem przyległym', 20),
  ('dmuchawy',   'Budynek stacji dmuchaw i dawkowania chem.', 30),
  ('bio',        'Blok biologiczny', 40),
  ('osadniki',   'Osadniki wtórne z korytem pomiarowym, pompownią części pływając. i terenem przyległym', 50),
  ('przepomp',   'Przepompownia ścieków z Packprofil, melioracyjna i wód poosadowych', 60),
  ('zageszczacze','Zagęszczacze osadu z terenem przyległym', 70),
  ('odwadnianie','Stacja odwadniania i wapnowania osadu', 80),
  ('warsztat',   'Warsztat z magazynem narzędzi i części zamiennych', 90),
  ('akp',        'Urządzenia kontrolno-pomiarowe i AKP', 100),
  ('inne',       'Inne', 110);

INSERT INTO public.schedule_tasks (task_number, name) VALUES
  (1,  'Przegląd konserwacja kraty i podajnika hydraulicznego'),
  (2,  'Przegląd konserwacja urządzeń piaskownika'),
  (3,  'Przegląd i konserwacja separatora piasku z opryzgadowaniem'),
  (4,  'Przegląd i konserwacja zgarniaczy os. wstórnych, smarów koz. głównego co miesiąc'),
  (5,  'Przegląd i konserwacja Sampterów z czyszczeniem "ssawek" i wyj. ssawnych'),
  (6,  'Przegląd i konserwacja zgarniacza zbiornika uśredniającego'),
  (7,  'Przegląd mieszadeł KOCZ, komory reakcji i komory koagulacji FeCl3'),
  (8,  'Przegląd mieszadeł odwadniania i wapnowania osadu'),
  (9,  'Przegląd dmuchaw (paski, stan oleju i aeromaty codzień na każdej zmianie)'),
  (10, 'Przegl. konserwacja urządzeń odwad. osadu, kontr. oleju w przekładniach i pompach'),
  (11, 'Przegl. kontr. oleju i konserwacja (napędów mieszadeł zagęszcz. osadu *)'),
  (12, 'Usuwanie liści zanieczyszczeń z "tuneli" za biurowcem (również śniegu po opadach)'),
  (13, 'Czyszczenie przelewów zagęszczacza i usuwanie kożucha z powierzchni'),
  (14, 'Usuwanie kożucha z komór pomp. cz. pływ. Dorrów, wód poosad i recyrkulac.'),
  (15, 'Czyszcz. przelewów i usuwanie cz. pływ. z powierzchni osadników wtórnych'),
  (16, 'Mycie sond pomiarowych Nitratax i redoks w KOCz oraz pH na wylocie'),
  (17, 'Mycie sond pomiarowych Nitratax i sondy gęstości w KOCZ'),
  (18, 'Mycie sond redoks poza KOCz, urządzeń dopływu ść. miejskich do zbiorn. pomiarowego'),
  (19, 'Czyszcz. sond redoks (powietrza) pH na piaskown., za zbiorn. uśred., selektor'),
  (20, 'Przegląd i konserwacja karchera, sprzęty ślokowy i wózka widłowego *)'),
  (21, 'Kontrola i czyszczenie pływaków sterów wszystkich pomp.'),
  (22, 'Usuwanie części flotujących z komór piaskownika i (lub) koryt zbiornika wstępnego'),
  (23, 'Dodatkowa kontrola poziomu oleju we wszystkich przekładniach'),
  (24, 'Pompowanie wody ze studzienek technologicznych i rewizyjnych'),
  (25, 'Przegląd i konserwacja pomp przenośnych, Mycie sondy pomiarowej jonoselektywnej'),
  (26, 'Przegląd i konserwacja (pomp dozujących kwas octowy i flokulant płynny*)'),
  (27, 'Czyszczenie separatora piasku'),
  (28, 'Przegląd czynnych pomp i armatury stacji chemicznej + ładowanie detektora Multican'),
  (29, 'Przegląd (palnika GLG-5*), (lewara DHP-5, naqrzewnicy olejowej i elektrycznej**)'),
  (30, 'Przegląd i konserwacja (odsnieżarki PT-S-OX*) i I (głębogryzarki KRUK 1500/3***)'),
  (31, 'Przegląd i konserw: (wykaszarki, kosiarki spalinowej, kosiatki ciągnikowej***)'),
  (32, 'Sprawdz. klap zwrotnych pomp: Dorrów, wód poosad., recyrkul., os. wstęp. i nadm.'),
  (33, 'Ustawienie samplera na WiKu i pomiar fosforanów'),
  (34, 'Kontrolne ow. obydwu zasuw by-pas z kom. dewnj, os. wstępn., i nadm.'),
  (35, 'Kontrolne ow. zasuw by-pas z kom. Messatbunkier, Przepływowmierz Papiernia, KOCZ');

