## Problem

W oknie „Harmonogram → Konkretny miesiąc" (`src/routes/_authenticated/schedule_.tasks.tsx`) komponent `MonthOverrideEditor` nie jest przemontowywany przy zmianie miesiąca — dostaje tylko nowe propsy `year`/`month`. Jego lokalny stan zaznaczeń (`useState<Map<...>>`, linia 502) przeżywa zmianę miesiąca, a hook `useSyncedState` (linia 695) nadpisuje ten stan tylko wtedy, gdy zmieni się „odcisk" pobranych danych. Efekt: przełączasz styczeń → luty i widzisz zaznaczenia ze stycznia; dopiero zapis i ponowne wejście czyszczą widok.

## Poprawka błędu

- Nadać `MonthOverrideEditor` klucz `key={`${year}-${month}`}` — przy każdej zmianie roku/miesiąca komponent montuje się od zera, więc żadne zaznaczenie nie przecieka.
- W `useSyncedState` dorzucić do klucza porównawczego identyfikator kontekstu (rok-miesiąc), żeby nawet przy tym samym układzie dni stan był odświeżany — zabezpieczenie na wypadek innych wywołań.
- Ostrzeżenie o niezapisanych zmianach: jeśli w bieżącym miesiącu są modyfikacje różniące się od stanu z bazy, przy próbie przełączenia miesiąca pokazać potwierdzenie („Masz niezapisane zmiany w styczniu — porzucić?").

## Nowy, czytelniejszy sposób wprowadzania dat

Zamiast tabeli 31 wierszy — widok kalendarza miesiąca:

```text
   ◀   luty 2026   ▶            [Zmiana 1 (R)] [Zmiana 2 (P)]  ← tryb pędzla
   pn  wt  śr  czw pt  sb  nd
                    1   2   3
    4   5   6   7   8   9  10
   11  12 [13] 14  15  16  17     [13] = dzień z zaznaczeniem
```

- Siatka 7 kolumn ustawiona na właściwy dzień tygodnia, weekendy wyszarzone, dzisiejszy dzień obramowany.
- Każda kratka pokazuje numer dnia i małe znaczniki `R` / `P`.
- Kliknięcie kratki przełącza aktywny „pędzel" (Zmiana 1, Zmiana 2, albo obie) — jedno kliknięcie zamiast szukania checkboxa w wierszu.
- Przeciągnięcie po kratkach zaznacza zakres dni.
- Wizualne rozróżnienie: dzień odziedziczony z szablonu (obramowanie przerywane) vs. wyjątek ustawiony ręcznie dla tego miesiąca (wypełnienie kolorem) — dziś nie widać, co pochodzi ze wzorca.
- Szybkie akcje nad kalendarzem: „Wszystkie poniedziałki", „Wyczyść miesiąc", „Przywróć szablon".
- Pasek stanu: licznik zaznaczonych dni + wyraźna informacja „Niezapisane zmiany" i przyciski Anuluj / Zapisz miesiąc.
- Nawigacja ◀ ▶ obok nazwy miesiąca (pole roku i lista miesięcy zostają jako uzupełnienie).

Ten sam komponent kalendarza wykorzystany w trybie „Szablon (co miesiąc)" — tam bez dni tygodnia, jako siatka 1–31, żeby oba tryby wyglądały spójnie.

## Zakres techniczny

- Plik: `src/routes/_authenticated/schedule_.tasks.tsx` — poprawka `key`, `useSyncedState`, guard niezapisanych zmian.
- Nowy komponent `MonthCalendarGrid` (siatka dni + pędzel + zaznaczanie przeciągnięciem) zastępujący `DaysGrid` w obu trybach.
- Bez zmian w bazie: dalej zapisujemy do `schedule_month_overrides` / `schedule_template_entries` tą samą logiką różnicy względem szablonu.
