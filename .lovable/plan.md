## 1. Terminologia — „dyżur" → „zmiana"

Globalna zamiana etykiet UI (kod/tabele zostają — `duty_sessions`):
- „Przyjmij/Przejmij/Zakończ dyżur" → „Rozpocznij/Przejmij/Zakończ zmianę"
- „Brak otwartego dyżuru" → „Brak otwartej zmiany" itd.
- Pliki: `duty-bar.tsx`, `shift.checklist.tsx`, `shift.report.tsx`, `shift.handover.tsx`, `manager.reports.tsx`.

## 2. Jeden przycisk zamykający zmianę

Usuwam „Rozlicz zmianę" z checklisty. Zostaje **jeden** przycisk w pasku górnym: **„Zakończ zmianę"**. Dialog krok po kroku:

1. Sprawdź czy raport zmianowy jest **wypełniony i prawidłowy** (walidacja jak niżej). Jeśli nie → CTA „Otwórz raport".
2. Sprawdź czy przekazanie zmiany jest **wypełnione** (wszystkie 10 obiektów z uwagami przekazującego). Jeśli nie → CTA „Otwórz przekazanie".
3. Pokaż listę niewykonanych zadań z checklisty + checkbox „przenoszę na kolejną zmianę". Wymagana notatka jeśli pomijasz.
4. Dopiero potem `ended_at = now()` na `duty_sessions`.

Tj. nie da się zamknąć zmiany bez kompletu dokumentów.

## 3. Walidacja raportu zmianowego (`shift_reports`)

Schema Zod, blokuje zapis + wyświetla błędy inline:
- Wszystkie 8 pól liczbowych **wymagane** (`> 0` dla energii i chemii, `0–100` dla S.M.).
- `energia_end ≥ energia_start` i `energia_end − energia_start ≤ 100000` (sanity).
- Każdy z 10 obiektów ma `ocena_status`. Jeśli `problem` → `ocena_opis` wymagany (min. 10 znaków).
- Każdy obiekt ma `harmonogram_status`. Jeśli `nie_wykonano` → `harmonogram_opis` + `proponowany_termin` (data ≥ dziś).
- Podpis = imię+nazwisko z profilu (automat).

Analogicznie przekazanie: wszystkie 10 obiektów musi mieć `uwagi_przekazujacego` (min. 3 znaki, „brak uwag" akceptowane).

## 4. Edycja kierownika + snapshoty (wersjonowanie)

Po `ended_at` na sesji raport jest „zamknięty" dla operatora. Kierownik widzi przycisk **„Edytuj"** w `/manager/reports`.

Nowa migracja — dwie tabele snapshotów:

```
shift_report_snapshots(id, report_id, snapshot jsonb, items_snapshot jsonb,
                       edited_by uuid, edited_at timestamptz, reason text)
handover_report_snapshots(id, handover_id, snapshot jsonb, items_snapshot jsonb,
                          edited_by uuid, edited_at timestamptz, reason text)
```

Przed każdą edycją kierownika → trigger BEFORE UPDATE robi snapshot poprzedniej wersji. Operator nie może już edytować po zakończeniu zmiany. Kierownik wpisuje powód edycji.

W UI: zakładka „Historia zmian" z listą wersji + diff (proste: stara wartość → nowa wartość per pole).

## 5. Tabelkowe UI raportu (jak na papierze)

Refaktor `shift.report.tsx` na układ tabelowy zgodny ze zdjęciami:

**Sekcja 1 — Dane wejściowe** (tabela 2 kolumny: parametr | wartość, z jednostkami w nagłówku).

**Sekcja 2 — Ocena obiektów** (tabela 5 kolumn):
| Lp | Nazwa obiektu | Ocena prawidłowości pracy | Wykonanie harmonogramu | Inne czynności |

Każdy wiersz rozwija się przy „problem"/„nie_wykonano" na pole tekstowe.

**Sekcja 3 — Podpis** (operator, data, godzina automatycznie).

Analogicznie `shift.handover.tsx` — tabela 4 kolumn:
| Lp | Obiekt | Uwagi przekazującego | Uwagi przyjmującego |

Używam `<table>` + Tailwind (borders, padding) — wygląda jak druk.

## 6. PDF 1:1 z papierowym

Biblioteka: **`jspdf` + `jspdf-autotable`** (działa w przeglądarce, mały bundle, dobrze radzi sobie z tabelami).

Nowy plik `src/lib/pdf/shift-report-pdf.ts` (i analogicznie handover). Layout odzwierciedla skany:
- Nagłówek: „RAPORT ZMIANOWY OCZYSZCZALNI ŚCIEKÓW", data, zmiana, operator.
- Tabela danych wejściowych.
- Tabela oceny obiektów z dynamiczną wysokością wierszy.
- Stopka: podpis operatora.
- Font: standardowy Helvetica (jspdf domyślny) — polskie znaki: dodaję font Roboto via base64 (skill PDF), żeby ł/ą/ę działały.

Przycisk **„Pobierz PDF"** na stronie raportu (operator po wypełnieniu) i w panelu kierownika przy każdym raporcie.

W panelu kierownika dodatkowo: **„Pobierz wszystkie PDF z dnia"** (zip — `jszip`) opcjonalnie.

## 7. Etapowanie (jeden commit, dużo zmian)

```text
1. Migracja: shift_report_snapshots + handover_report_snapshots + triggery BEFORE UPDATE
2. src/lib/validation/shift-report.ts — Zod schemas
3. src/lib/pdf/ — generator PDF dla obu raportów
4. shift.report.tsx — refaktor na tabelki + walidacja + przycisk PDF
5. shift.handover.tsx — refaktor na tabelki + walidacja + PDF
6. duty-bar.tsx — rename + dialog 3-stopniowy zamykania
7. shift.checklist.tsx — usuń przycisk „Rozlicz zmianę", przeniesienie niewykonanych do dialogu zakończenia
8. manager.reports.tsx — przycisk Edytuj + Historia wersji + Pobierz PDF
9. bun add jspdf jspdf-autotable
```

## Pytania otwarte (mogę założyć domyślnie)

- **Powód edycji kierownika** — obowiązkowy czy opcjonalny? *(zakładam obowiązkowy, min. 5 znaków)*
- **Operator po zakończeniu zmiany** — czy widzi swój raport (tylko podgląd + PDF) czy w ogóle nie ma dostępu? *(zakładam: podgląd + PDF, bez edycji)*
- **Niewykonane zadania w dialogu zakończenia** — przenosimy automatycznie na **następną najbliższą zmianę** czy operator wybiera datę? *(zakładam: automatycznie na następną, plus powiadomienie kierownika — już zaimplementowane)*

Jeśli powyższe założenia OK — wbijam. Jeśli coś zmienić, daj znać które.