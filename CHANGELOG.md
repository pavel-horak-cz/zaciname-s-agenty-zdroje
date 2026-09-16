# Změny

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
- Google modely přejmenovává a starší vypíná (2.5 Flash-Lite nedostupný novým klíčům v den vydání); přidána funkce listAvailableModels().
- Model hlásí "hotovo" před provedením; stránka proto ukazuje skutečný výsledek z kódu pod každou akcí a Log je jediný důkaz.
- Reálná spotřeba: 400 až 600 tokenů na příkaz bez pošty, 5 000 až 7 000 s dávkou 30 vláken.

## v2.0 (připravuje se): + Kalendář, Kontakty, Úkoly
