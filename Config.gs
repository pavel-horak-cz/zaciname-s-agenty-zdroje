/**
 * =====================================================================
 *  Config.gs  |  Nastavení agenta
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  - Přijme nastavení, které stránka posílá s každým příkazem (přepínače,
 *    úroveň důvěry, cíl agenta, model, interval), a zkontroluje, že obsahuje
 *    jen povolené hodnoty. Cokoliv jiného odmítne.
 *  - Klíč k modelu Gemini ukládá do paměti skriptu (PropertiesService),
 *    aby ho stránka nemusela posílat pokaždé a aby byl k dispozici
 *    i pro režim Automat bez otevřeného prohlížeče. Klíč se nikdy neukládá
 *    do tabulky ani do prohlížeče.
 *  - Umí nastavení uložit pro režim Automat a znovu ho načíst.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nemá výchozí hodnoty, které by povolovaly víc než úroveň 1.
 *    Když stránka nic nepošle, agent smí jen radit.
 *  - Nesahá na e-maily ani na Disk.
 * =====================================================================
 */

var PROP_API_KEY = 'AGENT_API_KEY';
var PROP_SETTINGS = 'AGENT_SETTINGS';

// Modely, které stránka nabízí. První je výchozí.
// Google modely přejmenovává a starší novým uživatelům vypíná (16. 9. 2026: 2.5 Flash-Lite už nový klíč nedostane).
// Když se to stane, spusťte v Brain.gs funkci listAvailableModels() a upravte tento seznam i volby ve Web.html.
var ALLOWED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
var ALLOWED_TIERS = ['free', 'paid'];
var ALLOWED_INTERVALS = [15, 30, 60];
var ALLOWED_LEVELS = [1, 2, 3];
var GOAL_MAX_LENGTH = 1000;


/**
 * Výchozí nastavení: nejopatrnější možné. Použije se, když stránka nic nepošle.
 */
function defaultSettings_() {
  return {
    canRead: false,
    canModify: false,
    canDrive: false,
    automat: false,
    level: 1,
    goal: '',
    model: ALLOWED_MODELS[0],
    tier: 'free',
    interval: 60
  };
}


/**
 * Zkontroluje nastavení ze stránky. Vrátí { ok: true, settings } nebo { ok: false, error }.
 * Nic nedomýšlí: neznámá hodnota znamená odmítnutí, ne tichou opravu.
 */
function validateSettings(raw) {
  var s = defaultSettings_();
  if (!raw || typeof raw !== 'object') {
    return { ok: true, settings: s };
  }

  // Přepínače: jen true/false
  var bools = ['canRead', 'canModify', 'canDrive', 'automat'];
  for (var i = 0; i < bools.length; i++) {
    var k = bools[i];
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== 'boolean') return { ok: false, error: 'Neplatná hodnota přepínače ' + k };
      s[k] = raw[k];
    }
  }

  // Úroveň důvěry: 1, 2 nebo 3
  if (raw.level !== undefined) {
    var lvl = Number(raw.level);
    if (ALLOWED_LEVELS.indexOf(lvl) === -1) return { ok: false, error: 'Neplatná úroveň důvěry: ' + raw.level };
    s.level = lvl;
  }

  // Cíl agenta: text, omezená délka
  if (raw.goal !== undefined) {
    if (typeof raw.goal !== 'string') return { ok: false, error: 'Cíl agenta musí být text' };
    s.goal = raw.goal.slice(0, GOAL_MAX_LENGTH);
  }

  // Model a tarif
  if (raw.model !== undefined) {
    if (ALLOWED_MODELS.indexOf(raw.model) === -1) return { ok: false, error: 'Neznámý model: ' + raw.model };
    s.model = raw.model;
  }
  if (raw.tier !== undefined) {
    if (ALLOWED_TIERS.indexOf(raw.tier) === -1) return { ok: false, error: 'Neznámý tarif: ' + raw.tier };
    s.tier = raw.tier;
  }

  // Interval automatu
  if (raw.interval !== undefined) {
    var iv = Number(raw.interval);
    if (ALLOWED_INTERVALS.indexOf(iv) === -1) return { ok: false, error: 'Neplatný interval: ' + raw.interval };
    s.interval = iv;
  }

  // Logická pojistka: označovat a přesouvat vyžaduje čtení
  if (s.canModify && !s.canRead) {
    return { ok: false, error: 'Označovat a přesouvat e-maily jde jen spolu s "Číst e-maily".' };
  }

  return { ok: true, settings: s };
}


/**
 * Uloží klíč k modelu do paměti skriptu. Prázdný text klíč smaže.
 * Vrátí true, když je po operaci klíč uložen.
 */
function saveApiKey(key) {
  var props = PropertiesService.getScriptProperties();
  var k = String(key || '').trim();
  if (!k) {
    props.deleteProperty(PROP_API_KEY);
    return false;
  }
  props.setProperty(PROP_API_KEY, k);
  return true;
}


/**
 * Vrátí uložený klíč nebo prázdný text. Používá jen Brain.gs.
 */
function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_API_KEY) || '';
}


/**
 * Je klíč uložen? Stránka se ptá při načtení, aby mohla ukázat stav.
 */
function hasApiKey() {
  return getApiKey_() !== '';
}


/**
 * Uloží zvalidované nastavení pro režim Automat (Automat.gs ho čte bez prohlížeče).
 */
function saveSettingsForAutomat_(settings) {
  PropertiesService.getScriptProperties().setProperty(PROP_SETTINGS, JSON.stringify(settings));
}


/**
 * Načte nastavení uložené pro Automat. Když nic není, vrátí výchozí (nejopatrnější).
 */
function loadSettingsForAutomat_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_SETTINGS);
  if (!raw) return defaultSettings_();
  try {
    var v = validateSettings(JSON.parse(raw));
    return v.ok ? v.settings : defaultSettings_();
  } catch (e) {
    return defaultSettings_();
  }
}
