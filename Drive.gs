/**
 * =====================================================================
 *  Drive.gs  |  Práce se složkou Agent na Disku
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ----------------------------------------
 *  - driveSaveAttachments()  uloží přílohy e-mailu z aktuální dávky do složky
 *                            "Agent" (vytvořila ji instalace). Název souboru:
 *                            "RRRR-MM-DD odesílatel původní-název". Když stejný
 *                            název už existuje, přidá číslo.
 *
 *  Používá pokročilou službu Drive API v3 s omezeným oprávněním drive.file:
 *  agent vidí jen složku, kterou sám vytvořil, a soubory, které sám uložil.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nemaže soubory. Funkce pro mazání neexistuje.
 *  - Nesahá mimo složku Agent (technicky to ani nejde, drive.file jinam nevidí).
 *  - Neposílá obsah souborů modelu.
 * =====================================================================
 */

var DRIVE_NAME_MAX = 120;


/**
 * Uloží všechny přílohy daného e-mailu z dávky. Vrátí text s výsledkem.
 */
function driveSaveAttachments(item) {
  var folderId = PropertiesService.getScriptProperties().getProperty(PROP_FOLDER_ID);
  if (!folderId) throw new Error('složka Agent není nastavena, spusťte setup()');

  var msg = GmailApp.getMessageById(item.id);
  var atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  if (!atts.length) return 'e-mail nemá žádné přílohy';

  var date = Utilities.formatDate(msg.getDate(), 'Europe/Prague', 'yyyy-MM-dd');
  var sender = senderShort_(msg.getFrom());
  var saved = [];

  for (var i = 0; i < atts.length; i++) {
    var base = (date + ' ' + sender + ' ' + atts[i].getName()).replace(/[\\\/:*?"<>|]/g, '_').slice(0, DRIVE_NAME_MAX);
    var name = uniqueName_(folderId, base);
    Drive.Files.create({ name: name, parents: [folderId] }, atts[i].copyBlob());
    saved.push(name);
  }
  return 'uloženo do složky Agent: ' + saved.join(', ');
}


// ---------------------------------------------------------------------
//  Pomocné funkce
// ---------------------------------------------------------------------

/**
 * Z "Jan Novák <jan@firma.cz>" udělá "Jan Novák", z holé adresy doménu.
 */
function senderShort_(from) {
  var m = String(from || '').match(/^\s*"?([^"<]+?)"?\s*<.+>\s*$/);
  if (m) return m[1].trim();
  var d = String(from || '').match(/@([\w.-]+)/);
  return d ? d[1] : 'neznámý';
}


/**
 * Když soubor s tímto názvem ve složce už je, přidá " (2)", " (3)"...
 */
function uniqueName_(folderId, base) {
  var name = base, k = 1;
  while (nameExists_(folderId, name)) {
    k++;
    var dot = base.lastIndexOf('.');
    name = dot > 0 ? base.slice(0, dot) + ' (' + k + ')' + base.slice(dot) : base + ' (' + k + ')';
  }
  return name;
}

function nameExists_(folderId, name) {
  var q = "'" + folderId + "' in parents and name = '" + name.replace(/'/g, "\\'") + "' and trashed = false";
  var res = Drive.Files.list({ q: q, fields: 'files(id)', pageSize: 1 });
  return !!(res.files && res.files.length);
}
