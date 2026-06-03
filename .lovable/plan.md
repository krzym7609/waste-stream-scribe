
# Moduł raportowo-harmonogramowy

## 1. Słowniki (edytowane przez kierownika, jednorazowo)

**`report_objects`** — 8 obiektów raportu zmianowego (z obrazka 1):
1. Część mechan.: Kratownia, piaskownik, zbior. uśr-sed z przepomp. osadu wstęp.
2. Stacja dmuchaw, rozdzielnia, budynek chemiczny, magazyny
3. KOCZ z pompownią osadu recyrk. i nadmiernego i wstępną komorą beztlen. (selektor)
4. Osadniki wtórne, pompownie: cz. pływając., Packprofil, melioracyjna, wód poosad.
5. Stacja odwadniania i wapnowania osadów. Zagęszczacze grawitacyjne
6. Urządzenia kontrolno-pomiarowe i AKP
7. Urządzenia ogólnozakładowe i inne

**`handover_objects`** — 10 obiektów przekazania zmiany (z obrazka 2):
Kratownia i urz. piaskownika; Zbiornik uśr-sedym.; Budynek stacji dmuchaw; Blok biologiczny; Osadniki wtórne; Przepompownia ścieków; Zagęszczacze osadu; Stacja odwadniania; Warsztat; Urządzenia kontrolno-pomiarowe; Inne.

**`schedule_tasks`** — 35 zadań eksploatacyjnych (numer + nazwa, z obrazka 3, wpisuję wszystkie do seedu).

Kierownik może edytować nazwy, dodawać, usuwać, ustawiać sort_order.

## 2. Harmonogram roczny (szablon + wyjątki)

**`schedule_template_entries`** — bazowy szablon:
- `task_id`, `day_of_month` (1–31), `shifts` (array: `rano`/`popoludnie`/`noc`), `note` (opcjonalny, np. „1p", „1z", „<1,2>")
- domyślnie obowiązuje co miesiąc

**`schedule_overrides`** — wyjątki na konkretną datę:
- `task_id`, `date`, `shifts` (nadpisuje szablon), `skip` (bool — pomiń w tym dniu)

UI dla kierownika: widok kalendarza miesięcznego × 35 zadań (jak na zdjęciu), edycja kliknięciem komórki → wybór zmian.

## 3. Checklista zmiany (auto-generowana)

Gdy operator przejmie dyżur, system wylicza listę zadań na ten konkretny dzień + zmianę:
- z `schedule_template_entries` (filtr: `day_of_month` = dziś, `shift_type` w `shifts`)
- nadpisane przez `schedule_overrides`
- + zaległości: zadania niewykonane z poprzednich zmian

**`schedule_executions`** — log wykonań:
- `task_id`, `scheduled_date`, `scheduled_shift`, `duty_session_id`, `status` (`done`/`deferred`/`pending`), `completed_at`, `completed_by`, `deferred_from_session_id`, `note`

Operator zaznacza fajeczką wykonane. Jeśli zatwierdza zmianę bez wykonania — dialog „Następujące zadania nie wykonane: […]. Zatwierdzić bez wykonania?". Po potwierdzeniu:
- niewykonane → `status='deferred'` + automatyczny insert nowego rekordu `pending` przypisanego do następnej zmiany
- powiadomienie kierownika (tabela `notifications` lub flaga widoczna w jego dashboardzie)

Przyjmujący zmianę widzi badge „Zadania zaległe: X" + listę.

## 4. Raport zmianowy

**`shift_reports`** (per `duty_session`):
- dane wejściowe: `energia_start`, `energia_end`, `flokulant_proszkowy_kg`, `flokulant_emulsyjny_l`, `wapno_kg`, `chlorek_zelaza_l`, `sm_osadu_zageszcz`, `sm_osadu_odwwapn`, `opady` (bool)
- `submitted_at`, `submitted_by`

**`shift_report_items`** (jeden wiersz na obiekt z `report_objects`):
- `object_id`
- `ocena_status` — `ok` / `problem`; jeśli `problem` → wymagany `ocena_opis`
- `harmonogram_status` — `ok` / `nie_wykonano`; jeśli `nie_wykonano` → wymagany `harmonogram_opis` + `proponowany_termin`
- `inne_czynnosci` (free text, opcjonalny)

Podpis automatyczny: imię + nazwisko operatora wiodącego z `profiles`.

## 5. Raport przekazania zmiany

**`handover_reports`**:
- `duty_session_from_id`, `duty_session_to_id` (nullable do momentu przejęcia)
- `from_user_id`, `to_user_id`, `submitted_at`, `accepted_at`

**`handover_report_items`** (jeden wiersz na obiekt z `handover_objects`):
- `object_id`
- `uwagi_przekazujacego` (jeśli puste = „brak uwag")
- `uwagi_przyjmujacego` (uzupełnia drugi operator po przejęciu)

Powiązany z istniejącym mechanizmem „Przejmij dyżur" — formularz przekazania uzupełnia przekazujący przed klikiem „Zakończ zmianę", przyjmujący widzi uwagi i może dopisać własne.

## 6. Routing i UI

Nowe trasy (wszystko pod `_authenticated/`):
- `/schedule` — kalendarz roczny (kierownik edytuje, operator tylko podgląd)
- `/schedule/tasks` — lista 35 zadań (kierownik: CRUD)
- `/shift/checklist` — checklista bieżącej zmiany operatora (fajeczki + zaległości)
- `/shift/report` — formularz raportu zmianowego (per duty_session)
- `/shift/handover` — formularz przekazania + akceptacji
- `/reports` — historia raportów (filtr: data, operator, typ); kierownik widzi wszystkie

Rozszerzenie `DutyBar`:
- liczba niewykonanych zadań z checklisty (badge)
- przycisk „Zakończ zmianę" → wymusza wypełnienie raportu i przekazania

Rozszerzenie dashboardu kierownika:
- powiadomienia o niewykonanych zadaniach
- log przejęć dyżuru z godzinami i flagą `outside_window`

## 7. Uprawnienia (RLS)

- `report_objects`, `handover_objects`, `schedule_tasks`, `schedule_template_entries`, `schedule_overrides` — SELECT all auth, ALL tylko kierownik/admin
- `schedule_executions`, `shift_reports`, `shift_report_items`, `handover_reports`, `handover_report_items` — SELECT all auth, INSERT/UPDATE własne lub kierownik

## Etapowanie

Z uwagi na rozmiar zrobię to w 3 wdrożeniach (każde to oddzielna migracja + paczka kodu):

**Etap A** — Słowniki + harmonogram (tabele 1–2 + UI `/schedule` i `/schedule/tasks`, seed 35 zadań i obiektów).
**Etap B** — Checklista zmiany + zaległości + powiadomienia kierownika (tabela `schedule_executions`, `/shift/checklist`, rozszerzenie DutyBar).
**Etap C** — Raporty (raport zmianowy + przekazanie, `/shift/report`, `/shift/handover`, `/reports`).

Po każdym etapie pokażę co działa i ruszamy dalej. Czy zaczynam od **Etapu A**?
