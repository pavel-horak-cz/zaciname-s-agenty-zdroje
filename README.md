# Začínáme s agenty: zdrojové soubory

Agent pro Gmail a Disk Google, který si obyčejný člověk s účtem gmail.com zkopíruje do svého Google účtu. Běží jen tam, bez serveru, bez třetí strany, bez registrace. V provozu stojí nula korun (bezplatný tarif Gemini API), případně jednotky korun měsíčně, pokud chcete soukromí.

**Návod krok za krokem se screenshoty:** https://zaciname-s-agenty.pprojects.cz

Autor: Pavel Horák ve spolupráci s Claude (Anthropic). Kód vznikl jako ukázka, že agent nemusí být drahý ani neprůhledný. Celý je na očích, česky komentovaný a záměrně bez knihoven, aby ho šlo vložit do libovolného LLM a zeptat se, co dělá.

## Co agent umí

- Na vyžádání (hlasem přes klávesnici telefonu nebo textem): shrnout novou poštu, oštítkovat, dát k prověření, připravit koncept odpovědi, uložit přílohu do složky Agent na Disku, archivovat.
- Automat: totéž sám v intervalu 15 až 60 minut podle cíle, který mu napíšete vlastními slovy.
- Tři úrovně důvěry: 1 jen radí, 2 koná pod dohledem, 3 koná sám.

## Co agent nikdy neudělá

- Neodešle e-mail. Nesmaže e-mail ani soubor. Neoznačí nic jako spam.
- Nesáhne mimo složku Agent na Disku (technicky to ani nejde, má omezené oprávnění drive.file).
- Nesáhne na e-mail, který nebyl v aktuální dávce (Doručená pošta za 24 hodin, max. 30 vláken).

Seznam všeho, co smí, je v souboru `Whitelist.gs`. Přečtěte si ho jako první, má dvacet řádků.

## Soubory

| Soubor | Co dělá |
|---|---|
| `appsscript.json` | Oprávnění, která agent žádá, a nic víc |
| `Setup.gs` | Jednorázová instalace: složka, log, štítky |
| `Config.gs` | Kontrola nastavení ze stránky, uložení klíče |
| `Log.gs` | Záznam každé akce do tabulky Agent Log |
| `Whitelist.gs` | Jediný seznam povolených akcí |
| `Brain.gs` | Jediné místo, kde se volá model Gemini |
| `Actions.gs` | Hlídač: ověří a provede jen povolené akce |
| `Mail.gs` | Čtení pošty a akce v Gmailu |
| `Drive.gs` | Uložení příloh do složky Agent |
| `Command.gs` | Vstupní bod stránky, zpracování příkazu |
| `Automat.gs` | Časový spouštěč a samostatný běh |
| `Web.html` | Stránka agenta (chat, přepínače, nastavení) |

## Instalace ve zkratce

1. Nový projekt na script.google.com, zapnout zobrazení `appsscript.json` v nastavení projektu.
2. Vložit všech 12 souborů (názvy bez přípon, Web jako HTML soubor).
3. Spustit `setup()`, projít autorizaci ("Google tuto aplikaci neověřil" je u vlastního skriptu normální).
4. Implementovat jako webovou aplikaci: Spustit jako Já, Kdo má přístup Jen já.
5. Otevřít adresu, v Nastavení vložit klíč z aistudio.google.com.

Podrobně, s obrázky a s tím, co kde uvidíte: https://zaciname-s-agenty.pprojects.cz

## Nevěřte, ověřte

Zkopírujte celý obsah repozitáře do libovolného LLM (Claude, ChatGPT, Gemini) a zeptejte se:

> Tohle je skript, který chci pustit nad svým Gmailem. Řekni mi, co všechno může udělat s mými e-maily a soubory, jestli někam posílá data mimo Google, a jestli může něco smazat nebo odeslat.

Odpověď musí vyjít stejně, ať se ptáte kohokoliv. Kód je jen jeden.

## Verze

- **v1.0** (září 2026): Gmail + Disk. Ověřeno na skutečném účtu, viz CHANGELOG.
- **v2.0** (připravuje se): + Kalendář, Kontakty, Úkoly.

Stahujte vždy konkrétní verzi z Releases, ne aktuální stav větve.

## Licence

MIT, viz LICENSE.
