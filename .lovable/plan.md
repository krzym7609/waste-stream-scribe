# Plan wdrożenia

Realizujemy w 4 etapach, w kolejności którą wybrałeś. FEKO+ pomijamy do czasu doprecyzowania źródła danych.

## Etap 1 — Baza urządzeń + załączniki

### Schemat bazy
- `equipment_categories(id, name, sort_order)` — np. „Pompy", „Dmuchawy", „Krata", „Piaskownik", „Aparatura elektryczna" itd.
- `equipment(id, category_id, name, code, location, manufacturer, model, serial_number, installed_at, notes, active)`
- `equipment_attachments(id, equipment_id, kind enum('documentation','photo','schema','service'), file_path, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)`
- Storage bucket prywatny `equipment-files`, polityki RLS: odczyt dla zalogowanych, zapis tylko dla kierownika.

### UI
- `/equipment` — lista urządzeń (filtr po kategorii, wyszukiwarka po nazwie/kodzie/lokalizacji). Karta urządzenia z 4 zakładkami załączników (Dokumentacja PDF, Zdjęcia, Schematy, Inne pliki serwisowe).
- `/equipment/$id` — szczegóły + upload/usuwanie załączników (kierownik), przegląd (operator).
- `/equipment/manage` — CRUD urządzeń i kategorii (tylko kierownik).
- W sidebarze nowa pozycja „Urządzenia" dla wszystkich, „Zarządzaj urządzeniami" dla kierownika.

## Etap 2 — Powiadomienia w aplikacji dla administratora

### Schemat
- `admin_notifications(id, kind enum('shift_report_submitted','handover_submitted','handover_accepted','report_edited','equipment_added','service_report_submitted'), title, body, ref_table, ref_id, created_for_user_id, read_at, created_at)`
- Trigger po insert w `shift_reports`, `handover_reports`, `report_edit_history` → wstawia powiadomienie dla każdego użytkownika z rolą `manager`.

### UI
- Dzwoneczek w topbarze (`DutyBar`) z badge ilości nieprzeczytanych — tylko dla kierownika.
- Popover z listą ostatnich 20 powiadomień, klik → przejście do raportu, oznaczenie jako przeczytane.
- `/notifications` — pełna lista z filtrowaniem, „oznacz wszystkie jako przeczytane".
- Realtime subskrypcja na `admin_notifications` przez `supabase_realtime` (toast „Nowy raport od X").

## Etap 3 — Szkielet „Raport utrzymania ruchu elektrycznego"

### Schemat
- `electrical_maintenance_reports(id, author_id, report_date, shift, status enum('draft','submitted'), notes, created_at, updated_at)`
- `electrical_maintenance_items(id, report_id, label, value text, ok boolean, notes)` — generyczne pole klucz/wartość, wypełnimy listę pozycji gdy dostarczysz wzór.

### UI
- `/reports/electrical/new` — pusty formularz: data, zmiana, lista pozycji (na razie 5 placeholderów), notatki, „Zapisz/Wyślij".
- `/reports/electrical` — lista raportów (operator widzi swoje, kierownik wszystkie).
- Wpięte w „Raporty" w sidebarze kierownika jako nowa zakładka.
- Komentarz w kodzie: `// TODO: podmienić listę pozycji wg wzoru kierownika`.

## Etap 4 — Szkielet raportu serwisowego per urządzenie

### Schemat
- `service_reports(id, equipment_id, author_id, performed_at, kind text (np. 'wymiana oleju', 'przegląd', 'naprawa'), description, parts_used text, hours_worked numeric, status enum('draft','submitted'), created_at, updated_at)`
- `service_report_attachments(id, report_id, file_path, original_name, mime_type, size_bytes)` — protokoły, faktury.
- Sekcja „Historia serwisu" na karcie urządzenia (`/equipment/$id`) — lista wszystkich `service_reports`.

### UI
- Z karty urządzenia przycisk „Nowy raport serwisowy" → `/equipment/$id/service/new`.
- `/reports/service` — pełna lista (kierownik), filtr po urządzeniu.
- Pusty szablon pól (typowe pola: rodzaj czynności, opis, użyte części, czas, załączniki). Konkretne listy zadań serwisowych dodamy gdy dostarczysz wzór.

## FEKO+ — odłożone
Wracamy gdy określisz źródło (API/eksport/SQL). Plan zostawiam pusty.

## Etapy migracji bazy (kolejność)
1. `equipment_categories`, `equipment`, `equipment_attachments` + bucket + RLS + GRANT.
2. `admin_notifications` + triggery + realtime publication.
3. `electrical_maintenance_reports` + items + RLS + GRANT.
4. `service_reports` + attachments + RLS + GRANT.

## Pytania kontrolne
1. Czy operator może **tylko czytać** bazę urządzeń, czy także dodawać zdjęcia z telefonu (np. zdjęcie awarii)?
2. Powiadomienia: tylko in-app czy także e-mail do kierownika? (e-mail wymaga konfiguracji Resend)
3. Czy raport utrzymania ruchu elektrycznego jest **dzienny / na zmianę / tygodniowy**?
4. Czy chcesz żebym zaczął od **całego Etapu 1** w jednym kroku (baza + UI + upload), czy najpierw sam schemat i UI listy, a upload w kolejnej iteracji?
