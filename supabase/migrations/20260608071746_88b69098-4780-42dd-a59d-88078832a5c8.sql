
ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS requires_service_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequency_note text;

-- Month overrides table: per (task, year, month, day) shifts assignment
CREATE TABLE IF NOT EXISTS public.schedule_month_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.schedule_tasks(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  day_of_month integer NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  shifts shift_type[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, year, month, day_of_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_month_overrides TO authenticated;
GRANT ALL ON public.schedule_month_overrides TO service_role;

ALTER TABLE public.schedule_month_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą overrides harmonogramu"
  ON public.schedule_month_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Kierownik zarządza overrides harmonogramu"
  ON public.schedule_month_overrides FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'kierownik') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_schedule_month_overrides_updated
  BEFORE UPDATE ON public.schedule_month_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Wipe and reseed tasks (cascade clears template entries / overrides / executions linked to old tasks)
DELETE FROM public.schedule_tasks;

INSERT INTO public.schedule_tasks (task_number, name, requires_service_report, frequency_note) VALUES
(1,  'Przegląd konserwacja kraty i podajnika hydraulicznego', true, NULL),
(2,  'Przegląd konserwacja [urządzeń piaskownika *)]', true, '*) raz na 3 miesiące'),
(3,  'Przegląd i konserwacja separatora piasku z oprzyrządowaniem', true, NULL),
(4,  'Przegląd i konserwacja [zgarniaczy os. wtórnych *)], smarów łoż. głównego co miesiąc', true, '*) raz na 3 miesiące'),
(5,  'Przegląd i konserwacja Samplerów z czyszczeniem "ssawek" i węży ssawnych', true, NULL),
(6,  'Przegląd i konserwacja zgarniacza zbiornika uśredniającego', true, NULL),
(7,  'Przegląd mieszadeł KOCz, komory reakcji i komory koagulacji FeCl3', true, NULL),
(8,  'Przegląd i konserwacja urządzeń wapnowania osadu', true, NULL),
(9,  'Przegląd dmuchaw (paski, stan oleju i aeromaty co dzień na każdej zmianie)', true, NULL),
(10, 'Przegląd i konserwacja urządzeń odwad. osadu. kontr. oleju w przekładniach i pompach', true, NULL),
(11, 'Przegląd kontr. oleju i konserwacja [napędów mieszadeł zagęszcz. osadu *)]', true, '*) raz na 3 miesiące'),
(12, 'Usuwanie liści i zanieczyszczeń z "tunelu" za biurowcem (również śniegu po opadach)', false, NULL),
(13, 'Czyszczenie przelewów zagęszczacza i usuwanie kożucha z powierzchni', false, NULL),
(14, 'Usuwanie kożucha z komór pomp: cz.pływ., Dorrów, wód poosad. i recyrkulac.', false, NULL),
(15, 'Czyszcz. przelewów i usuwanie cz. pływ. z powierzchni osadników wtórnych', false, NULL),
(16, 'Mycie sond pomiarowych tlenu i redoks w KOCz oraz pH na wylocie', false, NULL),
(17, 'Mycie sondy pomiarowej Nitratax i sondy gęstości w KOCz', false, NULL),
(18, 'Czyszcz. sond redoks poza KOCz, udrażn. dopływu śc. miejskich do zbiorn. pomiarowego', false, NULL),
(19, 'Mycie sond pH i redoks: MT, miasto, za piaskown., za zbiorn. uśred., selektor', false, NULL),
(20, 'Przegląd i konserwacja karchera, [sprężarki tłokowej i wózka widłowego *)]', true, '*) raz na 3 miesiące'),
(21, 'Kontrola i czyszczenie pływaków sterow. wszystkich pomp', false, NULL),
(22, 'Usuwanie części flotujących z komór piaskownika i (lub) koryt zbiornika wstępnego', false, NULL),
(23, 'Dodatkowa kontrola poziomu oleju we wszystkich przekładniach', false, NULL),
(24, 'Pompowanie wody ze studzienek technologicznych i rewizyjnych', false, NULL),
(25, 'Przegląd i konserwacja pomp przenośnych, Mycie sondy pomiarowej jonoselektywnej', true, NULL),
(26, 'Przegląd i konserwacja [pomp dozujących kwas octowy i flokulant płynny *)]', true, '*) raz na 3 miesiące'),
(27, 'Czyszczenie separatora piasku', true, NULL),
(28, 'Przegląd czynnych pomp i armatury stacji chemicznej + ładowanie detektora Multican', false, NULL),
(29, 'Przegląd [palnika GLt-3 *)], [lewara DHP-5, nagrzewnicy olejowej i elektrycznej **)]', true, '*) raz na 3 miesiące, **) raz na 6 miesięcy'),
(30, 'Przegląd i konserwacja [odśnieżarki PF-S-00X *)] i [glebogryzarki KRUK 1500/3 ***)]', true, '*) raz na 3 miesiące, ***) raz na miesiąc — tylko w sezonie'),
(31, 'Przegląd i konserw. [wykaszarki, kosiarki spalinowej i kosiarki ciągnikowej ***)]', true, '***) raz na miesiąc — tylko w sezonie'),
(32, 'Sprawdz. klap zwrotnych pomp: Dorrów, wód poosad., recyrkul., os. wstępn. i nadm.', false, NULL),
(33, 'Kontrolne otw. obydwu zasuw by-pas z kom. zlewnej i czyszcz. kraty w kom. zlewn.', false, NULL),
(34, 'Ustawienie samplera na WIKu i pomiar fosforanów', false, NULL),
(35, 'Kontrolne otw. zasuw by-pas z kom. Metsa (bunkier)** Przepływomierz Papierniam KOCZ', false, NULL);
