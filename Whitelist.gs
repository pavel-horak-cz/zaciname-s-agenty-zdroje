/**
 * =====================================================================
 *  Whitelist.gs  |  Seznam všeho, co agent smí
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  Obsahuje jediný seznam akcí, které agent může provést. Každá akce má:
 *    - id        krátký název, kterým ji model označuje
 *    - popis     česky, co akce dělá (model ho dostane v zadání)
 *    - uroven    minimální úroveň důvěry (1 radí, 2 koná pod dohledem, 3 koná sám)
 *    - prepinac  který přepínač na stránce musí být zapnutý
 *
 *  Actions.gs neprovede nic, co v tomto seznamu není, ať model navrhne cokoliv.
 *
 *  CO V TOMTO SEZNAMU NIKDY NENÍ
 *  ------------------------------
 *  - smazání e-mailu nebo souboru
 *  - odeslání e-mailu
 *  - označení jako spam
 *  Tyto akce agent nezná a neumí. Když je uživatel nebo model chce,
 *  agent odpoví, že to neumí, a nabídne koncept nebo přesun k prověření.
 * =====================================================================
 */

var WHITELIST = [
  { id: 'shrnout',               popis: 'Shrne, co je v poště nového nebo důležitého. Nic nemění.',                      uroven: 1, prepinac: 'canRead' },
  { id: 'navrhnout_stitek',      popis: 'Navrhne, kam e-mail patří (štítek). Nic nemění, jen radí.',                     uroven: 1, prepinac: 'canRead' },
  { id: 'pridat_stitek',         popis: 'Přidá e-mailu štítek.',                                                         uroven: 2, prepinac: 'canModify' },
  { id: 'oznacit_precteno',      popis: 'Označí e-mail jako přečtený.',                                                  uroven: 2, prepinac: 'canModify' },
  { id: 'presunout_k_provereni', popis: 'Dá e-mailu štítek "Agent/K prověření", aby si ho uživatel prohlédl.',           uroven: 2, prepinac: 'canModify' },
  { id: 'vytvorit_koncept',      popis: 'Připraví odpověď jako koncept v Gmailu. Nikdy neodesílá.',                      uroven: 2, prepinac: 'canModify' },
  { id: 'ulozit_prilohu',        popis: 'Uloží přílohu e-mailu do složky Agent na Disku.',                               uroven: 2, prepinac: 'canDrive' },
  { id: 'archivovat',            popis: 'Odstraní e-mail z doručené pošty (archivace, e-mail zůstává, jen není v Inboxu).', uroven: 3, prepinac: 'canModify' }
];


/**
 * Vrátí akci podle id, nebo null.
 */
function whitelistGet_(id) {
  for (var i = 0; i < WHITELIST.length; i++) {
    if (WHITELIST[i].id === id) return WHITELIST[i];
  }
  return null;
}


/**
 * Vrátí jen ty akce, které jsou při daném nastavení skutečně povolené
 * (úroveň stačí a přepínač je zapnutý). Tento seznam dostane model.
 */
function whitelistAllowed_(settings) {
  return WHITELIST.filter(function (a) {
    return settings.level >= a.uroven && settings[a.prepinac] === true;
  });
}


/**
 * Zjistí, proč akce není povolená. Vrátí prázdný text, když povolená je.
 */
function whitelistWhyNot_(id, settings) {
  var a = whitelistGet_(id);
  if (!a) return 'akce "' + id + '" není v seznamu povolených akcí';
  if (settings.level < a.uroven) return 'akce "' + id + '" vyžaduje úroveň důvěry ' + a.uroven + ', nastavena je ' + settings.level;
  if (settings[a.prepinac] !== true) return 'akce "' + id + '" vyžaduje zapnutý přepínač ' + prepinacNazev_(a.prepinac);
  return '';
}


function prepinacNazev_(key) {
  return { canRead: '"Číst e-maily"', canModify: '"Označovat a přesouvat e-maily"', canDrive: '"Ukládat do složky Agent na Disku"' }[key] || key;
}
