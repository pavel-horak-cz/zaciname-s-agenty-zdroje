/**
 * =====================================================================
 *  Log.gs  |  Záznam toho, co agent skutečně udělal
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  - Zapisuje do tabulky "Agent Log" (vytvořila ji instalace) jeden řádek
 *    na každou akci: čas, režim, služba, položka, akce, důvod, výsledek.
 *  - Umí vrátit posledních N řádků pro zobrazení na stránce.
 *
 *  Tabulka je nezávislý záznam pro vás, ne pro agenta. Do tabulky nikdy
 *  nezasahujte ručně, agent ji jen doplňuje.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nezapisuje obsah e-mailů, jen předmět, odesílatele a identifikátor.
 *  - Nezapisuje klíč k modelu.
 *  - Nic nemaže, ani řádky logu.
 * =====================================================================
 */

var LOG_SHEET_NAME = 'Log';
var LOG_ITEM_MAX = 200;   // delší texty položky a důvodu se zkrátí, ať tabulka zůstane čitelná


/**
 * Zapíše jeden řádek do logu.
 * @param {string} mode     'vyžádání' | 'automat' | 'instalace'
 * @param {string} service  'gmail' | 'disk' | 'agent'
 * @param {string} item     předmět e-mailu, název souboru, text příkazu
 * @param {string} action   název akce z whitelistu nebo popis události
 * @param {string} reason   důvod od modelu nebo poznámka
 * @param {string} result   'ok' | 'odmítnuto' | 'chyba: ...'
 */
function logRow(mode, service, item, action, reason, result) {
  var sheet = getLogSheet_();
  if (!sheet) return false;
  sheet.appendRow([
    new Date(),
    String(mode || ''),
    String(service || ''),
    trim_(item),
    String(action || ''),
    trim_(reason),
    String(result || '')
  ]);
  return true;
}


/**
 * Vrátí posledních n řádků logu jako pole objektů (pro stránku).
 */
function logTail(n) {
  var sheet = getLogSheet_();
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var count = Math.min(Number(n) || 20, last - 1);
  var rows = sheet.getRange(last - count + 1, 1, count, LOG_HEADER.length).getValues();
  return rows.map(function (r) {
    return {
      time: r[0] instanceof Date ? r[0].toLocaleString('cs-CZ') : String(r[0]),
      mode: r[1], service: r[2], item: r[3], action: r[4], reason: r[5], result: r[6]
    };
  });
}


// ---------------------------------------------------------------------
//  Pomocné funkce
// ---------------------------------------------------------------------

/**
 * Otevře list "Log" v tabulce, kterou vytvořila instalace. Když chybí, vrátí null
 * (agent pak pracuje dál, jen bez záznamu, a stránka to oznámí).
 */
function getLogSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_LOG_ID);
  if (!id) return null;
  try {
    var ss = SpreadsheetApp.openById(id);
    return ss.getSheetByName(LOG_SHEET_NAME) || ss.getSheets()[0];
  } catch (e) {
    return null;
  }
}


function trim_(text) {
  var s = String(text || '');
  return s.length > LOG_ITEM_MAX ? s.slice(0, LOG_ITEM_MAX) + '…' : s;
}
