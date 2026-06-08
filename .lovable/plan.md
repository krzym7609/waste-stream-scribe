# Plan zmian

## 1. Harmonogram czynności eksploatacyjnych

### 1a. Dane zadań (seed)
- Wyczyścić `schedule_tasks` i wstawić 35 zadań z listy użytkownika w dokładnej kolejności i z dokładnymi nazwami.
- Dodać kolumnę `requires_service_report boolean default false` (oznacza „niebieska czcionka" — wymaga raportu serwisowego).
- Dodać kolumnę `frequency_note text` (np. `*) — raz na 3 m-ce`, `**) — raz na 6 m-cy`, `***) — raz na miesiąc, tylko w sezonie`) wyciągniętą z `[...]` w nazwie. Sama nazwa zostaje z `[...*)]` tak jak chce użytkownik (tak jest w oryginale).
- Renderować zadania „serwisowe" niebieską czcionką w tabeli oraz dodać pod tabelą legendę:
  > UWAGA! Czynności wypisane niebieską czcionką wymagają wypełnienia wewnętrznych raportów serwisowych.
  > [*)] — raz na trzy miesiące, [**)] — raz na sześć miesięcy, [***)] — raz na miesiąc, ale tylko w sezonie.

### 1b. Wybór roku i miesiąca
- Aktualny `schedule_template_entries` (szablon „dzień miesiąca → zmiany") zostawiamy jako bazę domyślną.
- Dodać tabelę `schedule_month_overrides(task_id, year, month, day_of_month, shifts text[])` — przypisanie zmian dla konkretnego miesiąca/roku.
- W UI `/schedule`: dodać selektor **rok + miesiąc** (domyślnie bieżące). Komórki tabeli czytane są z `month_overrides` jeżeli istnieją, w przeciwnym razie z szablonu (z indykatorem „z szablonu" — wyszarzone). Edycja zapisuje override dla wybranego miesiąca.
- Liczba dni dynamicznie z wybranego miesiąca (28–31).

### 1c. Edycja zadań (kierownik)
- Strona `/schedule/tasks` już istnieje — rozszerzyć: edycja nazwy, dodawanie nowych, usuwanie (soft `active=false`), checkbox „wymaga raportu serwisowego", pole `frequency_note`.

## 2. Edycja raportów przez kierownika + historia zmian

### 2a. Tabela historii
- `report_edit_history(id, report_kind enum('shift','handover'), report_id uuid, edited_by uuid, edited_at, reason text not null, diff jsonb)`.

### 2b. UI dla kierownika
- W `/manager/reports`: na każdym raporcie przycisk **Edytuj**. Otwiera formularz w trybie edycji (identyczny z formularzem operatora). Po `Zapisz` wymaga modala **„Powód zmiany"** (textarea, min 5 znaków) — dopiero potem zapisuje + tworzy wpis w `report_edit_history` z diffem (stare vs nowe pola/itemy).
- Pod każdym raportem sekcja **„Historia zmian"** z listą edycji: kto, kiedy, powód, lista zmienionych pól.

### 2c. Naprawa istniejącej historii
- Sprawdzić obecny mechanizm w `shift.report.tsx` / `shift.handover.tsx` — kierownik edytujący nie uruchamia wpisu historii. Podpiąć ten sam mechanizm (modal powodu + insert do `report_edit_history`) wszędzie, gdzie kierownik zapisuje cudzy raport.

## 3. Naprawa widoku „Przekazania zmiany" u kierownika
- W `/manager/reports` zakładka Przekazania zmiany: obecnie błędnie pokazuje pary przekazujący/przejmujący. Zmienić zapytanie żeby ciągnęło `from_user_id` (przekazujący = autor `uwagi_przekazujacego`) i `to_user_id` (przejmujący = autor `uwagi_przejmujacego` / ten kto zaakceptował). Wyświetlać oba imiona + nazwiska z `profiles`.

## Pliki do edycji / utworzenia
- Migracje:
  - `schedule_tasks` + kolumny `requires_service_report`, `frequency_note`
  - tabela `schedule_month_overrides` + GRANT + RLS + polityki
  - tabela `report_edit_history` + GRANT + RLS + polityki
  - czyszczenie i seed 35 zadań
- `src/routes/_authenticated/schedule.tsx` — selektor rok/miesiąc, czytanie overrides, kolorowanie, legenda
- `src/routes/_authenticated/schedule.tasks.tsx` — pełna edycja
- `src/routes/_authenticated/manager.reports.tsx` — edycja + historia + fix par przekazań
- `src/lib/report-history.ts` — helper diff + insert

## Pytania
Czy potwierdzasz zakres? Czy override miesięczny ma być **kopią szablonu przy pierwszej edycji** (kopiuje cały miesiąc, potem edytujesz), czy **per komórka** (zostawia resztę „z szablonu")? Proponuję **per komórka** — mniej śmieci w bazie.
