## Cel

Przygotować jeden, kompletny dokument **DOCX** w języku polskim zawierający pełną dokumentację projektową systemu dla oczyszczalni ścieków — gotowy do pobrania, druku i przekazania interesariuszom (kierownik zakładu, dział IT, wykonawca).

Dokument NIE jest aplikacją — to materiał analityczno-projektowy. Implementację systemu można uruchomić w osobnym kroku po akceptacji dokumentacji.

## Struktura dokumentu

Dokument będzie miał stronę tytułową, spis treści i 12 rozdziałów:

1. **Streszczenie zarządcze** — cel, korzyści, kluczowe założenia (lokalny serwer w zakładzie, zastąpienie papieru, 2 role).
2. **Analiza biznesowa**
   - Stan obecny (papierowe formularze, harmonogram, problemy: brak śladu audytowego, gubienie dokumentów, brak alertów).
   - Stan docelowy i mierzalne korzyści.
   - Interesariusze, ograniczenia (offline-first, dane lokalne, brak chmury), ryzyka.
3. **Wymagania funkcjonalne i niefunkcjonalne** — pełna lista z priorytetami MoSCoW.
4. **Role i uprawnienia** — Operator vs Kierownik, macierz uprawnień (CRUD na zasobach).
5. **Diagram przypadków użycia** (Mermaid) — aktorzy + use cases pogrupowane: Zmiany, Zadania, Raporty, Awarie, Nadzór.
6. **Diagram klas** (Mermaid classDiagram) — User, Shift, Task, TaskInstance, ShiftReport, HandoverReport, Failure, ScheduleTemplate, Notification, PdfDocument, AuditLog.
7. **Diagram ERD bazy danych** (Mermaid erDiagram) — relacje między tabelami z kluczami obcymi.
8. **Struktura tabel SQL** (PostgreSQL) — pełne `CREATE TABLE` dla:
   - `users`, `user_roles`
   - `shifts` (kalendarz zmian)
   - `schedule_templates` (harmonogram bazowy z przypisaniem do zmiany 1/2/3)
   - `task_instances` (zadania wygenerowane na konkretny dzień + status, przeniesienia, historia)
   - `task_carryover_log`
   - `shift_reports` + sekcje (`report_mechanical`, `report_technological`, `report_failures`, `report_notes`)
   - `handover_reports` + `object_status`
   - `failures`
   - `notifications`
   - `pdf_archive`
   - `audit_log`
   - Indeksy i ograniczenia integralności.
9. **Makiety ekranów** (opisowe wireframe'y ASCII + opis każdego ekranu):
   - Logowanie
   - Pulpit operatora (lista zadań zmiany + szybki dostęp)
   - Formularz wykonania zadania (checkbox + uwagi)
   - Formularz raportu zmianowego (7 sekcji 1:1 z dokumentem papierowym)
   - Formularz przekazania zmiany
   - Zgłoszenie awarii
   - Pulpit kierownika (KPI, alerty)
   - Przegląd zadań niewykonanych / przeniesionych
   - Archiwum i wyszukiwarka raportów
   - Edytor harmonogramu
10. **Workflow systemu** (diagramy Mermaid flowchart):
    - Workflow zmiany operatora (login → lista zadań → wykonanie → raport → przekazanie → wylogowanie)
    - Workflow zadania (zaplanowane → wykonane / niewykonane → carryover → eskalacja)
    - Workflow raportu zmianowego z generowaniem PDF
    - Workflow powiadomień dla kierownika
11. **Opis modułów** — Auth, Harmonogram, Zadania, Raport zmianowy, Przekazanie zmiany, Awarie, Powiadomienia, Generator PDF (układ identyczny z papierem), Archiwum/wyszukiwarka, Panel kierownika, Audyt.
12. **Plan wdrożenia, technologie, harmonogram**
    - Etapy (MVP → Pilotaż → Pełne wdrożenie → Utrzymanie).
    - Proponowany stack: **Frontend** React + TypeScript + Tailwind; **Backend** Node.js (NestJS) lub Python (FastAPI) — rekomendacja + uzasadnienie; **Baza** PostgreSQL; **PDF** pdfmake / WeasyPrint; **Hosting** lokalny serwer Linux (Docker Compose), kopie zapasowe na NAS; **Auth** lokalne konta + bcrypt + JWT.
    - Harmonogram tygodniowy (12 tygodni z kamieniami milowymi).
    - Szacunek pracochłonności (osobodni per moduł).
    - Plan szkolenia operatorów i kierownika, plan migracji z papieru.

## Sposób realizacji

1. Wygenerowanie dokumentu skryptem Node.js z biblioteką `docx` (pełna kontrola formatowania, tabel, nagłówków, spisu treści).
2. Diagramy Mermaid renderowane do PNG i osadzone w dokumencie jako obrazy (czytelne na wydruku).
3. Wszystkie tabele (macierz uprawnień, schemat SQL, harmonogram tygodniowy, struktura sekcji raportu) jako natywne tabele DOCX.
4. Stopka z numeracją stron, nagłówek z tytułem projektu.
5. Walidacja: konwersja DOCX → PDF → przegląd każdej strony obrazkowo, lista znalezionych problemów, poprawki, ponowna walidacja.
6. Plik finalny zapisany jako `/mnt/documents/Analiza_System_Oczyszczalnia_Sciekow.docx` i udostępniony przez `<presentation-artifact>`.

## Szczegóły techniczne (dla działu IT)

- Format strony: A4, marginesy 2 cm, czcionka Arial 11 pt (body), 16 pt (H1), 13 pt (H2).
- Diagramy: Mermaid CLI (`@mermaid-js/mermaid-cli`) → PNG 150 DPI.
- Spis treści generowany z poziomów nagłówków (TOC field w DOCX).
- Wstępny rozmiar dokumentu: ~40–60 stron.

## Co NIE wchodzi w zakres tego kroku

- Implementacja kodu aplikacji.
- Konfiguracja serwera w zakładzie.
- Utworzenie projektu Lovable Cloud / bazy danych.

Te elementy mogą zostać uruchomione w kolejnym kroku po akceptacji dokumentu.
