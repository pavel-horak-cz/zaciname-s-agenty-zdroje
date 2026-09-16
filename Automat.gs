/**
 * =====================================================================
 *  Automat.gs  |  Agent jedná sám v pravidelných intervalech
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  - automatEnable()   založí časový spouštěč (každých 15, 30 nebo 60 minut)
 *                      a uloží nastavení ze stránky do paměti skriptu,
 *                      aby bylo k dispozici i bez otevřeného prohlížeče.
 *  - automatDisable()  spouštěč zruší.
 *  - automatRun()      funkce, kterou spouštěč volá. Načte nastavení, vezme
 *                      jen e-maily nové od posledního běhu, a když nějaké jsou,
 *                      zadá modelu váš cíl agenta jako příkaz. Akce prověří
 *                      a provede Actions.gs stejně jako na vyžádání.
 *
 *  Automat má PŘESNĚ STEJNÝ rozsah jako režim Na vyžádání: stejný seznam
 *  akcí (Whitelist.gs), stejné přepínače, stejná úroveň důvěry. Rozdíl je
 *  jen v tom, kdo zadává příkaz: místo vás je to váš cíl agenta z Nastavení.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Neběží, když je Automat na stránce vypnutý, když je úroveň důvěry 1
 *    (agent jen radí, takže nemá co dělat sám) nebo když chybí cíl agenta.
 *  - Nevolá model, když od posledního běhu nepřišla žádná pošta.
 *  - Neobchází žádnou kontrolu z Actions.gs.
 * =====================================================================
 */

var AUTOMAT_HANDLER = 'automatRun';
var PROP_AUTOMAT_LAST_RUN = 'AGENT_AUTOMAT_LAST_RUN';       // čas posledního běhu (ms)
var PROP_AUTOMAT_LAST_RESULT = 'AGENT_AUTOMAT_LAST_RESULT'; // krátký text pro stránku
var AUTOMAT_FIRST_LOOKBACK_MIN = 60;                         // první běh se dívá hodinu zpět


/**
 * Zapne Automat: uloží nastavení a založí spouštěč podle intervalu.
 */
function automatEnable(settings) {
  saveSettingsForAutomat_(settings);
  automatDeleteTriggers_();
  ScriptApp.newTrigger(AUTOMAT_HANDLER).timeBased().everyMinutes(settings.interval).create();
  PropertiesService.getScriptProperties().setProperty(PROP_AUTOMAT, 'ANO');
  logRow('automat', 'agent', '', 'automat zapnut', 'každých ' + settings.interval + ' min, úroveň ' + settings.level, 'ok');
  return automatStatus();
}


/**
 * Vypne Automat: zruší spouštěč.
 */
function automatDisable() {
  automatDeleteTriggers_();
  PropertiesService.getScriptProperties().setProperty(PROP_AUTOMAT, 'NE');
  logRow('automat', 'agent', '', 'automat vypnut', '', 'ok');
  return automatStatus();
}


/**
 * Stav pro stránku.
 */
function automatStatus() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty(PROP_AUTOMAT_LAST_RUN) || 0);
  var settings = loadSettingsForAutomat_();
  return {
    on: props.getProperty(PROP_AUTOMAT) === 'ANO' && automatHasTrigger_(),
    interval: settings.interval,
    lastRun: last ? new Date(last).toLocaleString('cs-CZ') : '',
    lastResult: props.getProperty(PROP_AUTOMAT_LAST_RESULT) || ''
  };
}


/**
 * Jeden běh. Volá ho spouštěč.
 */
function automatRun() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_AUTOMAT) !== 'ANO') return;

  var settings = loadSettingsForAutomat_();
  if (settings.level < 2) { automatFinish_(props, 'přeskočeno: úroveň důvěry 1'); return; }
  if (!settings.goal) { automatFinish_(props, 'přeskočeno: chybí cíl agenta'); return; }
  if (!settings.canRead) { automatFinish_(props, 'přeskočeno: čtení e-mailů je vypnuté'); return; }
  if (!hasApiKey()) { automatFinish_(props, 'přeskočeno: chybí klíč k modelu'); return; }

  // Jen pošta nová od posledního běhu (Gmail bere after: v sekundách)
  var lastMs = Number(props.getProperty(PROP_AUTOMAT_LAST_RUN) || 0);
  if (!lastMs) lastMs = Date.now() - AUTOMAT_FIRST_LOOKBACK_MIN * 60 * 1000;
  var query = 'in:inbox after:' + Math.floor(lastMs / 1000);
  var startedMs = Date.now();

  var batch;
  try {
    batch = mailFetchRecent(settings, query);
  } catch (e) {
    logRow('automat', 'gmail', '', 'načtení dávky', e.message, 'chyba');
    automatFinish_(props, 'chyba při čtení pošty: ' + e.message, startedMs);
    return;
  }
  if (!batch.length) { automatFinish_(props, 'nic nového', startedMs); return; }

  logRow('automat', 'gmail', '', 'načtena dávka', batch.length + ' vláken (' + batch.filter(function (b) { return b.newsletter; }).length + ' newsletterů)', 'ok');

  var command = 'Zpracuj nové e-maily podle mého cíle. Dělej jen to, co z cíle plyne; když z cíle nic neplyne, nedělej nic.';
  var decision = brainDecide(command, settings, mailFormatContext(batch), []);
  if (!decision.ok) {
    logRow('automat', 'agent', '', 'model', decision.error, 'chyba');
    automatFinish_(props, 'model: ' + decision.error, startedMs);
    return;
  }
  var result = actionsRun(decision.akce, settings, 'automat', batch);
  var summary = batch.length + ' nových, ' + result.planned.length + ' akcí provedeno, ' + result.rejected.length + ' odmítnuto';
  logRow('automat', 'agent', '', 'běh dokončen', summary, 'ok');
  automatFinish_(props, summary, startedMs);
}


// ---------------------------------------------------------------------
//  Pomocné funkce
// ---------------------------------------------------------------------

function automatFinish_(props, resultText, startedMs) {
  // Čas posledního běhu = začátek tohoto běhu, aby se nic mezi tím neztratilo
  props.setProperty(PROP_AUTOMAT_LAST_RUN, String(startedMs || Date.now()));
  props.setProperty(PROP_AUTOMAT_LAST_RESULT, resultText);
}

function automatDeleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === AUTOMAT_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function automatHasTrigger_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === AUTOMAT_HANDLER; });
}
