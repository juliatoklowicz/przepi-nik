# Przepiśnik 📖

Aplikacja na telefon (PWA) do zapisywania przepisów z TikToka, Instagrama, blogów, zrzutów ekranu i filmów, z automatycznym liczeniem kalorii i makro. Wszystko na darmowych usługach.

## Co potrafi

- **Import z linku**: TikTok (opis posta), Instagram (opis posta, jeśli Instagram go udostępni), blogi kulinarne (pełny przepis ze zdjęciem).
- **Wklejenie tekstu**: np. skopiowany opis spod filmu.
- **Zrzut ekranu lub zdjęcie**: tekst odczytywany na telefonie (Tesseract), można wybrać kilka zdjęć naraz.
- **Film lub nagranie**: rozpoznawanie mowy na urządzeniu (Whisper). To funkcja eksperymentalna.
- **Automatyczne tłumaczenie** przepisów z innych języków na polski (MyMemory, ok. 5000 znaków dziennie za darmo).
- **Kalorie i makro**: wbudowana baza ok. 220 popularnych składników z polskimi nazwami i odmianą („mąki”, „jajek”, „ząbki czosnku”) plus wyszukiwarka Open Food Facts i ręczne wpisanie wartości z etykiety.
- **Przeliczanie jednostek**: szklanki, łyżki, łyżeczki, sztuki, puszki, cups, oz i °F przeliczane na gramy i °C.
- **Skalowanie porcji**: zmieniasz liczbę porcji, a ilości przeliczają się same.
- **Kategorie**: śniadanie, obiad, kolacja, deser, przekąska, napój. Do tego wyszukiwarka po nazwie i składnikach.
- **Udostępnianie z TikToka** (Android): TikTok → Udostępnij → Przepiśnik.
- Kopia zapasowa do pliku JSON.

## Uruchomienie u siebie (na komputerze)

```bash
npm install
npm run dev
```

Aplikacja działa pod adresem http://localhost:5173. Bez konfiguracji Supabase przepisy zapisują się tylko w tej przeglądarce (tryb lokalny).

## Wdrożenie: przepisy w chmurze, na telefonie

Potrzebujesz trzech darmowych kont: **Supabase** (baza danych), **GitHub** (kod) i **Vercel** (hosting).

### 1. Supabase (baza i logowanie)

1. Załóż konto na https://supabase.com i utwórz nowy projekt (**New project**, region np. Frankfurt).
2. Wejdź w **SQL Editor → New query**, wklej całą zawartość pliku [`supabase/schema.sql`](supabase/schema.sql) i kliknij **Run**.
3. (Opcjonalnie, wygodniej) **Authentication → Sign In / Providers → Email**: wyłącz **Confirm email**, żeby nie trzeba było potwierdzać konta mailem.
4. **Project Settings → API**: skopiuj **Project URL** i klucz **anon public**.

### 2. GitHub

Utwórz nowe (prywatne) repozytorium i wrzuć do niego ten folder.

### 3. Vercel (hosting)

1. Załóż konto na https://vercel.com (najprościej przez GitHub).
2. **Add New → Project** i wybierz repozytorium. Framework (Vite) wykryje się sam.
3. W **Environment Variables** dodaj:
   - `VITE_SUPABASE_URL`: Project URL z Supabase
   - `VITE_SUPABASE_ANON_KEY`: klucz anon public
4. Kliknij **Deploy**. Po minucie dostaniesz adres typu `przepisnik.vercel.app`.

### 4. Instalacja na telefonie

- **Android (Chrome)**: otwórz adres aplikacji → menu ⋮ → **Zainstaluj aplikację**. Od tej chwili Przepiśnik pojawi się w menu **Udostępnij** w TikToku i na Instagramie.
- **iPhone (Safari)**: otwórz adres → przycisk Udostępnij → **Do ekranu początkowego**. iOS nie pozwala aplikacjom webowym pojawiać się w menu Udostępnij, więc skopiuj link w TikToku i wklej go w Przepiśniku.

Przy pierwszym uruchomieniu załóż konto (e-mail i hasło). Na komputerze logujesz się tym samym kontem i widzisz te same przepisy.

## Ograniczenia (bo wszystko jest darmowe)

- **Instagram** często blokuje pobieranie opisów bez logowania. Wtedy skopiuj opis i użyj „Wklej tekst” albo zrób zrzut ekranu.
- **Przepisy mówione w filmie**: TikTok nie udostępnia nagrań, więc film trzeba zapisać na telefonie (TikTok → Udostępnij → Zapisz film) albo nagrać ekran, a potem wybrać go w opcji „Z filmu”. Model mowy (~80 MB) pobiera się raz, rozpoznawanie trwa 1–3 minuty.
- **Przepisy bez AI** rozpoznawane są regułami, więc po imporcie warto przejrzeć składniki. Linie, przy których nie da się policzyć kalorii, są podświetlone na żółto.
- **Wartości odżywcze** są szacunkowe.

## Struktura

- `src/pages`: ekrany (lista, przepis, edytor, dodawanie, ustawienia, logowanie)
- `src/lib/ingredients.ts`: parser linii składnika, jednostki, dopasowanie do bazy, liczenie makro
- `src/lib/foods.ts`: wbudowana baza składników
- `src/lib/recipeText.ts`: zamiana luźnego tekstu na przepis
- `src/lib/importer.ts`: import (link, tekst, OCR, mowa) i tłumaczenie
- `api/[action].ts`: funkcja serwerowa (pobieranie stron, proxy obrazków, tłumaczenie, Open Food Facts)
- `supabase/schema.sql`: tabela przepisów i miejsce na zdjęcia
