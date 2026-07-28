# Kompletna instrukcja użytkownika BiokrApp (Word) + scenariusze pracy + audyt pokrycia

Wygeneruję plik `/mnt/documents/BiokrApp-Instrukcja_Pelna.docx` — profesjonalną, kompletną instrukcję opartą na analizie **całego kodu** aplikacji, uzupełnioną o **scenariusze pracy end-to-end** oraz **audyt pokrycia 100%** przed finalizacją. Zamiast zrzutów wstawię wyraźne **czerwone pogrubione placeholdery** `[SCREENSHOT – ...]`.

## Struktura dokumentu

1. Strona tytułowa (tytuł, wersja, data)
2. Automatyczny spis treści (TOC pól Word)
3. Nagłówki H1–H3, stopka z numerem strony, styl Arial, tabele uprawnień/pól
4. Numeracja rozdziałów

## Część I — Wprowadzenie

1. **O systemie** — cel, model 2-zmianowy, architektura ról
2. **Role i uprawnienia** — tabela: Operator / Kierownik / Zarządca (prezes) / Administrator (kto co widzi i może)
3. **Nawigacja i układ ekranu** — sidebar, DutyBar, dzwonek powiadomień, stopka konta

## Część II — Scenariusze pracy (end-to-end, krok po kroku)

Każdy scenariusz opisuję jako spójny proces z rolami, warunkami wstępnymi, krokami, efektami, wyjątkami i placeholderami zrzutów.

### Scenariusze operatora
1. **Logowanie i pierwsze uruchomienie** — od `/auth` przez wymuszoną zmianę hasła po pulpit
2. **Rozpoczęcie zmiany** — DutyBar, „Rozpocznij zmianę", tryb poza-oknem, notatka startowa
3. **Przejęcie zmiany od poprzednika** — odbiór protokołu przekazania, akceptacja, uwagi przyjmującego
4. **Wykonanie checklisty dnia** — `/shift/checklist`, oznaczanie zadań, odroczenie, notatki, zaległości z poprzedniej zmiany
5. **Wypełnienie raportu zmianowego** — `/shift/report`, wszystkie pola parametrów, zapis roboczy vs wysłanie
6. **Zgłoszenie awarii urządzenia** — z listy obiektów lub karty urządzenia, opis awarii, efekt (status = awaria, powiadomienie kierownika)
7. **Dodanie zdarzenia serwisowego/naprawy/przeglądu** do urządzenia + załączniki
8. **Przygotowanie protokołu przekazania zmiany** — pozycje per obiekt, uwagi ogólne, wysłanie
9. **Zakończenie zmiany** — warunki (wysłany raport, wysłane przekazanie), notatka końcowa
10. **Zmiana własnego hasła**

### Scenariusze kierownika / zarządcy
11. **Poranny przegląd pulpitu** — KPI, bieżąca zmiana, awarie, ostatnie raporty
12. **Odbiór i obsługa zgłoszenia awarii** — z powiadomienia → karta urządzenia → planowanie naprawy → zmiana statusu → notatka
13. **Edycja raportu operatora** (poprawianie błędów) — otwarcie z pulpitu/„Raporty", override, snapshot historii, kto widzi zmiany
14. **Ręczna edycja / dokończenie protokołu przekazania** (tryb override z komentarzem)
15. **Planowanie serwisu / przeglądu urządzenia** — dodanie zdarzenia typu „serwis"/„przegląd", załączniki dokumentacji
16. **Dodanie nowego obiektu i urządzenia** — pełny formularz, kategoria, kod, lokalizacja, kartoteka
17. **Załadowanie dokumentacji, zdjęć, schematów** — upload, podgląd inline bez pobierania, usuwanie
18. **Zaplanowanie zadania cyklicznego w harmonogramie rocznym** — `/schedule/tasks`, szablon miesięczny (dni × zmiany), wyjątki dla wybranego miesiąca, notatka częstotliwości, „wymaga raportu serwisowego"
19. **Przegląd harmonogramu rocznego i eksport** — widok kalendarza, PDF A4 poziomo, Excel (spójne style)
20. **Analiza statystyk w Raportach** — widok dzienny/miesięczny/roczny, wykresy energii i chemii, formatowanie pl-PL, eksport Excel + PDF
21. **Pobranie protokołu przekazania w PDF**
22. **Dodanie pracownika** — `/team`, generowanie loginu, hasło jednorazowe, ekran z hasłem
23. **Edycja pracownika** — imię, nazwisko, telefon, rola (ograniczenia ról: kierownik tylko operatorów)
24. **Reset hasła / dezaktywacja konta**
25. **Konfiguracja godzin zmian** — `/settings/shifts`, skutki dla DutyBar i raportów
26. **Obsługa powiadomień** — dzwonek, oznaczanie jako przeczytane, „Wyczyść wszystkie", przekierowania do właściwych paneli

## Część III — Referencja funkcji (moduł po module)

Dla każdej funkcji jednolity układ: **Nazwa · Cel · Lokalizacja · Dostępność ról · Jak użyć (kroki) · Pola formularza (tabela: Nazwa/Typ/Wymagane/Opis) · Dostępne akcje · Efekt działania · Uwagi · Placeholder**.

Moduły do pełnego opisu:

- **Logowanie** (`/auth`), **Zmiana hasła** (`/change-password`)
- **DutyBar** (rozpocznij / przejmij / zakończ, tryb poza oknem, ukrycie dla managerów)
- **Pulpit operatora** (`/shift/checklist`) — checklista, zaległości, odroczenia, notatki
- **Pulpit kierownika/prezesa** (`/dashboard`) — kafelki KPI, bieżąca zmiana, ostatnie raporty (Edytuj/Przekazanie), awarie, skróty
- **Raport zmianowy** (`/shift/report`) — wszystkie pola (energia start/end, flokulant proszkowy/emulsyjny, wapno, FeCl3, SM osadu zageszcz/odwodn, opady, operatorzy, uwagi), zapis, wysłanie, zamknięcie, edycja przez kierownika, snapshoty
- **Przekazanie zmiany** (`/shift/handover`) — pozycje per obiekt, uwagi ogólne, wysłanie, przyjęcie, tryb override, snapshoty, PDF
- **Harmonogram roczny** (`/schedule`) — widok kalendarza, oznaczenia 1/2/1;2, eksport
- **Zadania harmonogramu** (`/schedule/tasks`) — szablon miesięczny, wyjątki miesięczne, edycja/usuwanie
- **Wykonania zadań** — pending/done, odroczenia, powiązanie z sesją
- **Raporty kierownika** (`/manager/reports`) — dzień/miesiąc/rok, wykresy (energia + 4 chemii), etykiety wartości, pl-PL, eksport Excel + PDF, sekcja przekazania z PDF
- **Obiekty** (`/equipment`) — kafelki obiektów, statusy, licznik urządzeń
- **Karta obiektu / urządzenia** (`/equipment/$id`) — dane, zakładki dokumentacja/zdjęcia/schematy/serwis, załączniki (podgląd inline, pobierz, usuń), historia zdarzeń (awaria/naprawa/serwis/przegląd/inne), zgłoszenie awarii przez operatora, edycja urządzeń przez kierownika
- **Kategorie urządzeń** — użycie, sortowanie
- **Zespół** (`/team`) — lista, dodawanie, edycja, reset hasła, zasady ról
- **Powiadomienia** — typy (awaria, brak raportu, zaległe zadania, przekazanie), akcje, przekierowania
- **Ustawienia zmian** (`/settings/shifts`) — godziny 1./2. zmiany, kto zmienia
- **Wylogowanie**

## Część IV — FAQ, edge case'y, słowniczek

- Brak dostępu / „Nie masz otwartej zmiany"
- Zapomniane hasło
- Brak podglądu pliku
- Brak powiadomień
- Poprawa historyczna raportu (co widać w snapshotach)
- Słowniczek: sesja dyżuru, snapshot, override, obiekt vs urządzenie, okno zmiany

## Placeholdery zamiast zrzutów

Format akapitu: **Arial, bold, kolor `C00000`**, łatwy do znalezienia po `[SCREENSHOT`. Przykłady:

- `[SCREENSHOT – Logowanie: ekran /auth z polami login/hasło]`
- `[SCREENSHOT – DutyBar: przycisk „Rozpocznij zmianę" widoczny dla operatora]`
- `[SCREENSHOT – Checklista dnia: zadania z zaległościami z poprzedniej zmiany]`
- `[SCREENSHOT – Raport zmianowy: wypełniony formularz przed wysłaniem]`
- `[SCREENSHOT – Przekazanie zmiany: pozycje per obiekt + uwagi ogólne]`
- `[SCREENSHOT – Pulpit kierownika: kafelki KPI + Bieżąca zmiana]`
- `[SCREENSHOT – Raporty → widok miesięczny: wykresy energii i chemii]`
- `[SCREENSHOT – Obiekty → karta urządzenia → zakładka Dokumentacja z podglądem PDF]`
- `[SCREENSHOT – Zespół: modal „Edytuj pracownika"]`
- `[SCREENSHOT – Harmonogram roczny: kalendarz z oznaczeniami 1;2 + eksport]`
- Placeholdery dodatkowe w każdym kroku scenariusza (po jednym na istotny ekran)

## Realizacja (technicznie)

1. **Audyt wstępny (przed pisaniem)** — inwentaryzuję źródło: wszystkie pliki w `src/routes/`, `src/components/`, `src/lib/` (serverfn, walidacje, eksporty), polityki RLS z listy tabel, `auth-context.tsx`, `duty-bar`, `notifications-bell`, `attachment-preview`, dialogi w `team`/`equipment`. Zapisuję listę: trasa → komponent → formularze → pola → przyciski/akcje → role.
2. Generuję `.docx` skryptem Node + biblioteka `docx` (obecna w projekcie): style H1/H2/H3, TOC, stopka, tabele, akapity z czerwonymi placeholderami (`C00000`, bold).
3. **Audyt końcowy (po wygenerowaniu)** — drugi przebieg: automatyczne porównanie listy inwentarza (trasy/komponenty/pola/przyciski) z treścią dokumentu (grep po nazwach ról, ścieżek, etykiet pól, kluczowych przycisków). Braki uzupełniam w tym samym pliku i regeneruję.
4. Walidacja formatu: konwersja do PDF (LibreOffice) + `pdftoppm`, przegląd stron pod kątem przycięć/pustych stron; poprawki i regeneracja aż do czystego wyniku.
5. Zapis: `/mnt/documents/BiokrApp-Instrukcja_Pelna.docx` + `<presentation-artifact>` do pobrania. Krótkie podsumowanie audytu (co sprawdzone, ile funkcji, ile placeholderów) załączę w odpowiedzi.

## Czego świadomie NIE robię

- Nie wstawiam zrzutów (tylko czerwone placeholdery).
- Nie opisuję kodu/architektury technicznej.
- Nie modyfikuję aplikacji — tylko generuję dokument.

Po Twojej akceptacji przechodzę do trybu build i generuję plik z pełnym audytem pokrycia.