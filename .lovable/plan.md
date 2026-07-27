# Pełna instrukcja użytkowania BiokrApp (Word + screenshoty)

Wygeneruję nowy plik `BiokrApp-Instrukcja_v3.docx` w `/mnt/documents/`, który krok po kroku prowadzi użytkownika przez całą aplikację — od logowania, przez codzienne raporty operatora, aż po pełny panel kierownika. Każda funkcja opisana słownie i zilustrowana zrzutem ekranu.

## Zakres treści (spis rozdziałów)

1. **Czym jest BiokrApp** — cel systemu (cyfrowe raporty zmianowe, harmonogram, dokumentacja urządzeń dla oczyszczalni), architektura (2 zmiany, role), zasady bezpieczeństwa danych.
2. **Role kont** — Operator, Kierownik, Zarządca (prezes), Administrator: co każdy widzi i co może zrobić (tabela uprawnień).
3. **Logowanie i pierwsze uruchomienie** — ekran logowania, wymuszona zmiana hasła, jak zmienić hasło później.
4. **Dodawanie pracowników (kierownik/zarządca)** — zakładka Zespół: formularz „Dodaj pracownika", automatyczny login, jednorazowe hasło, reset hasła, ograniczenia (kto może nadać rolę kierownika/zarządcy/admina).
5. **Pulpit operatora i pasek dyżuru** — checklista dnia, DutyBar (kto ma zmianę), powiadomienia.
6. **Raport zmianowy — operator**
   - Jak wypełnić raport (parametry, notatki, załączniki).
   - Zapis roboczy vs wysłanie.
   - Przekazanie zmiany (handover) — kto przejmuje.
7. **Zmiany i harmonogram tygodniowy** — zakładka Zmiany: przypisywanie operatorów na dni, edycja przez kierownika.
8. **Harmonogram roczny czynności eksploatacyjnych**
   - Widok kalendarza rocznego.
   - Dodawanie zadań cyklicznych (szablony miesięczne) i wyjątków dla konkretnych miesięcy.
   - Oznaczanie zmian (1, 2, 1;2) na dany dzień.
   - Eksport do PDF i Excel (jedna strona A4 poziomo).
9. **Raporty kierownika**
   - Widok dzienny / miesięczny / roczny + wykresy.
   - Podgląd raportu zmianowego, przekazań, historii edycji.
   - **Jak poprawić raport błędnie utworzony przez pracownika** (edycja, kto widzi historię zmian).
   - Eksport do Excela i PDF.
10. **Obiekty i urządzenia**
    - Struktura: obiekty → urządzenia → dokumentacja/zdjęcia/schematy/serwis.
    - Podgląd plików bez pobierania.
    - Dodawanie i edycja (kierownik).
11. **Powiadomienia** — dzwoneczek, przekierowania do źródła, „oznacz jako przeczytane", „wyczyść wszystkie".
12. **Ustawienia zmian** — konfiguracja godzin 1. i 2. zmiany.
13. **Zmiana hasła i wylogowanie**.
14. **FAQ / rozwiązywanie problemów** — brak dostępu, zapomniane hasło, brak podglądu pliku, brak powiadomień.

## Jak to zrobię (technicznie)

1. Uruchomię Playwright na aktualnie zalogowanej sesji preview i zrobię brakujące/odświeżone zrzuty (`dashboard`, `shift_report` z wypełnionymi polami, `shift_handover`, `shifts`, `schedule`, `schedule_tasks` — dodawanie zadania, `equipment` — lista + karta urządzenia + podgląd pliku, `manager_reports` — dzień/miesiąc/rok + wykres + eksport, `team` — lista + modal „Nowy pracownik" + modal z hasłem, `settings_shifts`, `notifications-bell` otwarty, `change-password`, `auth`).
2. Jeżeli obecna sesja nie jest kierownikiem (poprzednio `/manager/reports` przekierowywało), poproszę o zalogowanie jako `kierownik / Kier123!` **przed** generacją, żeby wszystkie zrzuty zawierały panel kierownika. Jeśli będą braki — opiszę je tekstem i wstawię placeholder do uzupełnienia.
3. Skryptem Node + `docx` zbuduję dokument A4, styl spójny z v2 (Arial, nagłówki 1–3, tabele uprawnień, ImageRun dla zrzutów, podpisy pod obrazkami, spis treści na początku).
4. Walidacja: konwersja do PDF przez LibreOffice + `pdftoppm`, przegląd każdej strony pod kątem przycięć/pustych stron; poprawki i ponowna generacja aż do czystego wyniku.
5. Zapis do `/mnt/documents/BiokrApp-Instrukcja_v3.docx` i emisja `<presentation-artifact>`.

## Pytanie kontrolne przed startem

Czy mam **teraz** korzystać z Twojej obecnej sesji preview (jeśli jesteś zalogowany jako kierownik), czy najpierw zalogujesz się jako `kierownik / Kier123!` i napiszesz „gotowe"? Bez roli kierownika sekcje 7–9 (Zmiany, Harmonogram roczny, Raporty kierownika) będą miały zrzuty operatora zamiast panelu kierownika.
