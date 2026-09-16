/**
 * =====================================================================
 *  Setup.gs  |  Jednorázová instalace agenta
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  Spustíte ručně jednou funkci setup(). Ta ve vašem Google účtu:
 *    1. vytvoří na Disku složku "Agent" (jediná složka, kam agent smí),
 *    2. vytvoří v ní tabulku "Agent Log" (záznam všeho, co agent provede),
 *    3. založí v Gmailu štítky "Agent/K prověření" a "Agent/Hotovo",
 *    4. zapíše výchozí stav: režim Na vyžádání, úroveň důvěry 1, Automat VYPNUTO.
 *
 *  Funkci setup() můžete spustit opakovaně. Nic nevytvoří dvakrát.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nesahá na žádné vaše existující e-maily, soubory ani složky.
 *  - Nic nemaže, nic neodesílá.
 *  - Nezakládá žádný časový spouštěč. Agent po instalaci sám od sebe nic nedělá.
 *
 *  POZNÁMKA K DISKU
 *  ----------------
 *  Agent používá omezené oprávnění "drive.file": vidí jen soubory a složky,
 *  které sám vytvořil. Proto nepoužívá vestavěnou službu DriveApp (ta by
 *  vyžadovala přístup k celému Disku), ale pokročilou službu Drive API v3,
 *  kterou zapíná soubor appsscript.json.
 *
 *  Pomocná funkce setupStatus() jen vypíše, co je nainstalované. Nic nemění.
 * =====================================================================
 */

// Názvy, které agent používá. Změna zde se projeví při dalším spuštění setup().
var AGENT_FOLDER_NAME = 'Agent';
var AGENT_LOG_NAME = 'Agent Log';
var AGENT_LABEL_REVIEW = 'Agent/K prověření';
var AGENT_LABEL_DONE = 'Agent/Hotovo';

// Klíče, pod kterými si agent pamatuje svůj stav (PropertiesService, jen v tomto skriptu).
var PROP_FOLDER_ID = 'AGENT_FOLDER_ID';
var PROP_LOG_ID = 'AGENT_LOG_ID';
var PROP_SETUP_DONE = 'AGENT_SETUP_DONE';
var PROP_MODE = 'AGENT_MODE';          // 'na_vyzadani' | 'automat' | 'oba'
var PROP_LEVEL = 'AGENT_LEVEL';        // '1' | '2' | '3'
var PROP_AUTOMAT = 'AGENT_AUTOMAT';    // 'NE' | 'ANO'

// Hlavička tabulky Agent Log. Log.gs zapisuje řádky přesně v tomto pořadí.
var LOG_HEADER = ['Čas', 'Režim', 'Služba', 'Položka', 'Akce', 'Důvod', 'Výsledek'];

// MIME typ složky na Disku Google.
var MIME_FOLDER = 'application/vnd.google-apps.folder';


/**
 * Hlavní instalační funkce. Spusťte ji ručně v editoru Apps Scriptu (tlačítko Spustit).
 * Při prvním spuštění vás Google požádá o oprávnění uvedená v appsscript.json.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // 1. Složka "Agent" na Disku
  var folderId = getOrCreateAgentFolder_(props);
  Logger.log('Složka agenta: ' + AGENT_FOLDER_NAME + ' (' + folderId + ')');

  // 2. Tabulka "Agent Log" uvnitř složky
  var logId = getOrCreateAgentLog_(props, folderId);
  Logger.log('Tabulka logu: ' + AGENT_LOG_NAME + ' (' + logId + ')');

  // 3. Štítky v Gmailu
  getOrCreateLabel_(AGENT_LABEL_REVIEW);
  getOrCreateLabel_(AGENT_LABEL_DONE);
  Logger.log('Štítky připraveny: ' + AGENT_LABEL_REVIEW + ', ' + AGENT_LABEL_DONE);

  // 4. Výchozí stav (nastaví se jen tehdy, když ještě není nastaven)
  setDefaultIfMissing_(props, PROP_MODE, 'na_vyzadani');
  setDefaultIfMissing_(props, PROP_LEVEL, '1');
  setDefaultIfMissing_(props, PROP_AUTOMAT, 'NE');
  props.setProperty(PROP_SETUP_DONE, new Date().toISOString());

  Logger.log('Instalace dokončena. Agent je v režimu Na vyžádání, úroveň důvěry 1, Automat VYPNUTO.');
}


/**
 * Vypíše aktuální stav instalace. Nic nemění.
 */
function setupStatus() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('Instalace provedena: ' + (props.getProperty(PROP_SETUP_DONE) || 'NE'));
  Logger.log('Složka agenta ID: ' + (props.getProperty(PROP_FOLDER_ID) || 'chybí'));
  Logger.log('Tabulka logu ID: ' + (props.getProperty(PROP_LOG_ID) || 'chybí'));
  Logger.log('Režim: ' + (props.getProperty(PROP_MODE) || 'nenastaveno'));
  Logger.log('Úroveň důvěry: ' + (props.getProperty(PROP_LEVEL) || 'nenastaveno'));
  Logger.log('Automat: ' + (props.getProperty(PROP_AUTOMAT) || 'nenastaveno'));
}


// ---------------------------------------------------------------------
//  Pomocné funkce (podtržítko na konci = interní, nevolají se ručně)
// ---------------------------------------------------------------------

/**
 * Vrátí ID složky agenta. Když ještě neexistuje (nebo je v koši), vytvoří ji
 * v kořeni Disku přes Drive API v3.
 */
function getOrCreateAgentFolder_(props) {
  var savedId = props.getProperty(PROP_FOLDER_ID);
  if (savedId && existsAndNotTrashed_(savedId)) {
    return savedId;
  }
  var folder = Drive.Files.create({
    name: AGENT_FOLDER_NAME,
    mimeType: MIME_FOLDER
  });
  props.setProperty(PROP_FOLDER_ID, folder.id);
  return folder.id;
}


/**
 * Vrátí ID tabulky logu. Když ještě neexistuje (nebo je v koši), vytvoří ji,
 * zapíše hlavičku a přesune ji do složky agenta.
 */
function getOrCreateAgentLog_(props, folderId) {
  var savedId = props.getProperty(PROP_LOG_ID);
  if (savedId && existsAndNotTrashed_(savedId)) {
    return savedId;
  }

  var spreadsheet = SpreadsheetApp.create(AGENT_LOG_NAME);
  var sheet = spreadsheet.getSheets()[0];
  sheet.setName('Log');
  sheet.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]);
  sheet.getRange(1, 1, 1, LOG_HEADER.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Přesun tabulky do složky agenta. Tabulku vytvořil tento skript,
  // proto na ni smí i s omezeným oprávněním drive.file.
  var id = spreadsheet.getId();
  var current = Drive.Files.get(id, { fields: 'parents' });
  var oldParents = (current.parents || []).join(',');
  Drive.Files.update({}, id, null, {
    addParents: folderId,
    removeParents: oldParents,
    fields: 'id, parents'
  });

  props.setProperty(PROP_LOG_ID, id);
  return id;
}


/**
 * Zjistí, jestli soubor nebo složka s daným ID existuje a není v koši.
 * Když na něj skript nemá přístup, vrátí false (pak se vytvoří nový).
 */
function existsAndNotTrashed_(id) {
  try {
    var file = Drive.Files.get(id, { fields: 'id, trashed' });
    return file && !file.trashed;
  } catch (e) {
    return false;
  }
}


/**
 * Vrátí štítek Gmailu. Když neexistuje, vytvoří ho.
 */
function getOrCreateLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
  }
  return label;
}


/**
 * Nastaví hodnotu jen tehdy, když klíč ještě nemá žádnou hodnotu.
 */
function setDefaultIfMissing_(props, key, value) {
  if (props.getProperty(key) === null) {
    props.setProperty(key, value);
  }
}
