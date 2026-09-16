# Změny

## v1.0.1 (16. 9. 2026): oprava textů, kód beze změny

- Web.html: text u přepínače Tarif. Podmínky Gemini API (Unpaid Services) stanoví, že pro uživatele v Evropském hospodářském prostoru, Švýcarsku a Spojeném království platí pravidla placených služeb i na bezplatné kvótě; Google tedy obsah nepoužívá ke zlepšování svých produktů. Původní text platí jen mimo tyto země. Popisek volby Placený změněn na "vyšší limity".
- README.md: totéž, plus podmínky Gemini API (věk 18+, určeno pro profesionální nebo obchodní použití).
- CHANGELOG.md: přesněji k modelu 2.5 Flash-Lite (viz níže).

## v1.0 (16. 9. 2026): Gmail + Disk

První verze, ověřená na skutečném účtu gmail.com v jednom dni.

Co obsahuje:
- Režim Na vyžádání (stránka s chatem, hlas přes klávesnici telefonu) a Automat (spouštěč 15 až 60 min).
- Tři úrovně důvěry, přepínače Číst, Označovat a přesouvat, Ukládat na Disk, Jednat sám.
- Akce: shrnout, navrhnout štítek, přidat štítek, označit přečtené, přesunout k prověření, vytvořit koncept, uložit přílohu, archivovat.
- Model Gemini přes API, výchozí gemini-3.5-flash-lite, bezplatný tarif, denní strop 50 volání.
- Log každé akce do tabulky Agent Log.

Co bylo zjištěno během stavby a promítnuto do kódu:
- Vestavěná služba DriveApp vyžaduje plný přístup k Disku; nástroj proto používá Drive API v3 s omezeným oprávněním drive.file.
- Oprávnění gmail.modify technicky umožňuje i odeslání; ochrana proti odeslání a mazání je v kódu (funkce neexistují), ne v oprávnění.
- Mikrofon stránky uvnitř Apps Scriptu nefunguje (sandbox); hlas dodává klávesnice telefonu.
- Google modely přejmenovává a starší omezuje (API vrátilo pro 2.5 Flash-Lite chybu 404: model není dostupný novým uživatelům, v den, kdy byl v ceníku); přidána funkce listAvailableModels().
- Model hlásí "hotovo" před provedením; stránka proto ukazuje skutečný výsledek z kódu pod každou akcí a Log je jediný důkaz.
- Reálná spotřeba: 400 až 600 tokenů na příkaz bez pošty, 5 000 až 7 000 s dávkou 30 vláken.

## v2.0 (připravuje se): + Kalendář, Kontakty, Úkoly
