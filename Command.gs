/**
 * =====================================================================
 *  Command.gs  |  Vstupní bod webové stránky agenta
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ----------------------------------------
 *  1. doGet()          zobrazí stránku Web.html.
 *  2. getState()       řekne stránce při načtení, jestli je instalace hotová
 *                      a jestli je uložen klíč k modelu.
 *  3. setAutomat()     zapne nebo vypne Automat (Automat.gs).
 *  4. handleCommand()  přijme příkaz a nastavení ze stránky, nastavení
 *                      zkontroluje (Config.gs), uloží případný nový klíč,
 *                      zapíše příkaz do logu (Log.gs), načte dávku pošty
 *                      (Mail.gs, jen při zapnutém čtení), zeptá se modelu
 *                      (Brain.gs), akce prověří a provede (Actions.gs)
 *                      a vrátí odpověď.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nesahá na e-maily ani na Disk.
 *  - Neběží bez vašeho podnětu.
 *  - Nevrací klíč k modelu zpět do prohlížeče, jen informaci, že je uložen.
 * =====================================================================
 */

/**
 * Zobrazí stránku agenta. Apps Script tuto funkci zavolá automaticky
 * při otevření adresy webové aplikace.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Web')
    .setTitle('Agent')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/**
 * Stav pro stránku při načtení.
 */
function getState() {
  var props = PropertiesService.getScriptProperties();
  return {
    setupDone: !!props.getProperty(PROP_SETUP_DONE),
    hasApiKey: hasApiKey(),
    logAvailable: getLogSheet_() !== null,
    automat: automatStatus()
  };
}


/**
 * Zapne nebo vypne Automat ze stránky. Při zapnutí vyžaduje úroveň 2 nebo 3,
 * cíl agenta, zapnuté čtení a uložený klíč.
 */
function setAutomat(on, rawSettings) {
  if (!on) return { ok: true, automat: automatDisable() };
  var v = validateSettings(rawSettings);
  if (!v.ok) return { ok: false, message: 'Nastavení odmítnuto: ' + v.error };
  var s = v.settings;
  if (s.level < 2) return { ok: false, message: 'Automat vyžaduje úroveň důvěry 2 nebo 3. Na úrovni 1 agent jen radí.' };
  if (!s.goal.trim()) return { ok: false, message: 'Automat potřebuje cíl agenta. Napište v Nastavení, co má dělat.' };
  if (!s.canRead) return { ok: false, message: 'Automat potřebuje zapnuté "Číst e-maily".' };
  if (!hasApiKey()) return { ok: false, message: 'Automat potřebuje uložený klíč k modelu.' };
  s.automat = true;
  return { ok: true, automat: automatEnable(s) };
}


/**
 * Zpracuje příkaz ze stránky.
 * @param {string} text         příkaz uživatele
 * @param {Object} rawSettings  nastavení ze stránky (přepínače, úroveň, cíl, model, interval)
 * @param {string} newApiKey    nový klíč, když ho uživatel právě vložil; jinak prázdný text
 * @param {Array}  recent       posledních pár výměn z prohlížeče [{ q, a }], aby agent rozuměl navazujícím příkazům
 */
function handleCommand(text, rawSettings, newApiKey, recent) {
  var command = String(text || '').trim();
  if (!command) {
    return { ok: false, message: 'Příkaz je prázdný.' };
  }

  // 1. Nastavení: neplatné se odmítne a nic se neprovede
  var v = validateSettings(rawSettings);
  if (!v.ok) {
    logRow('vyžádání', 'agent', command, 'nastavení odmítnuto', v.error, 'odmítnuto');
    return { ok: false, message: 'Nastavení odmítnuto: ' + v.error };
  }
  var settings = v.settings;

  // Když Automat běží, převezme aktuální přepínače a cíl ze stránky
  if (PropertiesService.getScriptProperties().getProperty(PROP_AUTOMAT) === 'ANO') {
    settings.automat = true;
    saveSettingsForAutomat_(settings);
  }

  // 2. Nový klíč, pokud ho stránka poslala
  if (newApiKey) {
    saveApiKey(newApiKey);
    logRow('vyžádání', 'agent', '', 'klíč uložen', '', 'ok');
  }

  // 3. Záznam příkazu
  var logged = logRow('vyžádání', 'agent', command, 'příkaz přijat',
    'úroveň ' + settings.level + ', čtení ' + settings.canRead + ', úpravy ' + settings.canModify +
    ', disk ' + settings.canDrive + ', model ' + settings.model + ' (' + settings.tier + ')',
    'ok');

  // 4. Bez klíče agent rozhodovat neumí
  if (!hasApiKey()) {
    return {
      ok: true,
      message: 'Přijal jsem: "' + command + '". Klíč k modelu chybí, rozhodovat zatím neumím. Vložte ho v Nastavení.',
      hasApiKey: false,
      time: new Date().toLocaleTimeString('cs-CZ')
    };
  }

  // 5. Data z pošty (jen když je zapnuté "Číst e-maily")
  var batch = [];
  var context = '';
  if (settings.canRead) {
    try {
      batch = mailFetchRecent(settings);
      context = mailFormatContext(batch);
      logRow('vyžádání', 'gmail', '', 'načtena dávka', batch.length + ' vláken (' + batch.filter(function (b) { return b.newsletter; }).length + ' newsletterů)', 'ok');
    } catch (e) {
      logRow('vyžádání', 'gmail', '', 'načtení dávky', e.message, 'chyba');
      return { ok: true, message: 'Poštu se nepodařilo načíst: ' + e.message, hasApiKey: true, time: new Date().toLocaleTimeString('cs-CZ') };
    }
  }

  // 6. Rozhodnutí modelu (Brain.gs), kontrola a provedení akcí (Actions.gs)
  var decision = brainDecide(command, settings, context, recent);
  if (!decision.ok) {
    logRow('vyžádání', 'agent', command, 'model', decision.error, 'chyba');
    return { ok: true, message: decision.error, hasApiKey: true, time: new Date().toLocaleTimeString('cs-CZ') };
  }
  var result = actionsRun(decision.akce, settings, 'vyžádání', batch);

  var parts = [];
  parts.push(decision.odpoved);
  var described = actionsDescribe(result, settings);
  if (described) parts.push(described);
  if (decision.usage) parts.push('(dnes ' + decision.usage.calls + '/' + DAILY_CALL_LIMIT + ' volání, ' + decision.usage.tokens + ' tokenů)');
  if (!logged) parts.push('Pozor: nepodařilo se zapsat do Agent Logu.');

  return {
    ok: true,
    message: parts.join('\n'),
    hasApiKey: hasApiKey(),
    time: new Date().toLocaleTimeString('cs-CZ')
  };
}
