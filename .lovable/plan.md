# Plan zmian

## 1. Checklista pracownika (`/shift/checklist`) — jedno miejsce na wszystko

Pracownik widzi listę zaplanowanych pozycji na bieżącą zmianę:

- **Zadania harmonogramu** (jak dziś) — pobierane z `schedule_template_entries` + `schedule_overrides`, filtrowane po dacie/zmianie.
- **Raport zmianowy** — jedna pozycja "Raport zmiany" prowadząca do formularza (`/shift/report`), z podpozycjami:
  - Dane eksploatacyjne (energia, flokulanty, wapno, FeCl₃, SM osadu)
  - Ocena obiektów (10 pozycji ze `shift_report_items`)
  - Uwagi / opady
  Pozycja oznacza się jako "zrobione" gdy `shift_reports` dla bieżącej `duty_session` istnieje i wszystkie wymagane pola są wypełnione.
- **Przekazanie zmiany** — pozycja "Przekazanie zmiany" → `/shift/handover`, zaznacza się jako wykonana po `submitted_at`.

Pozycje renderowane w jednolitej liście z ikoną statusu (pending / done) i przyciskiem "Wypełnij" / "Otwórz".

## 2. Roczny harmonogram (kierownik)

Już istnieje `schedule_template_entries` (day_of_month + shifts) — to jest właśnie **szablon roczny** (powtarzalny co miesiąc). Dodam stronę `/schedule/yearly` dla kierownika:

- Widok kalendarza rocznego (12 miesięcy × dni) z nałożonymi zadaniami z szablonu i wyjątkami.
- Filtr: rok, zadanie, zmiana.
- Eksport CSV (opcjonalnie później).

## 3. Podgląd raportów dla kierownika

Nowa sekcja `/manager/reports` z trzema zakładkami:

- **Dziennie** — wybór daty → lista wszystkich `shift_reports` + `handover_reports` + `schedule_executions` dla tego dnia (3 zmiany).
- **Miesięcznie** — agregaty: suma energii, zużycie chemii (flokulanty, wapno, FeCl₃), średnie SM osadu, liczba wykonanych/niewykonanych zadań, liczba przekazań.
- **Rocznie** — to samo co miesięcznie ale w rozbiciu na miesiące + wykres trendu (recharts).

Dostęp tylko dla `kierownik` / `admin`.

## 4. Nawigacja

- Operator: Pulpit (checklista) — bez zmian, ale checklista zawiera teraz wszystkie pozycje.
- Kierownik: dodaje pozycje **Harmonogram roczny** i **Raporty** (zamiast obecnego `Harmonogram` rozbudowujemy o widok roczny i podsumowania).

## Szczegóły techniczne

- Brak nowych tabel — wykorzystujemy istniejące (`shift_reports`, `handover_reports`, `schedule_template_entries`, `schedule_executions`).
- Komponent `ChecklistItem` jednolity dla zadań harmonogramu, raportu i przekazania (warianty po `type`).
- Agregacje miesięczne/roczne robione po stronie klienta przez `useQuery` (datasetów jest mało: ~90 raportów/miesiąc max).
- Wykresy: `recharts` (już w projekcie? — sprawdzę, jeśli nie, dodam).

Czy zatwierdzasz? Czy są elementy do poprawki (np. inny zakres podsumowań, dodatkowe metryki, eksport PDF)?
