/**
 * =====================================================================
 *  Actions.gs  |  Hlídač: co se smí provést
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ----------------------------------------
 *  Dostane seznam akcí, které navrhl model (Brain.gs), a u každé ověří
 *  čtyři věci:
 *    1. je v seznamu povolených akcí (Whitelist.gs),
 *    2. úroveň důvěry stačí,
 *    3. příslušný přepínač na stránce je zapnutý,
 *    4. cílový e-mail je v dávce načtené pro tento příkaz (ne libovolný).
 *  Co neprojde, zapíše do logu jako "odmítnuto" s důvodem a řekne to uživateli.
 *  Co projde, na úrovni 1 jen vrátí jako návrh, na úrovni 2 a 3 provede
 *  přes Mail.gs nebo Drive.gs a zapíše skutečný výsledek.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Neprovede nic mimo Whitelist.gs, ať model navrhne cokoliv.
 *  - Na úrovni 1 nic neprovádí, jen vrací návrhy.
 * =====================================================================
 */

var ACTIONS_MAX_PER_COMMAND = 20;   // víc akcí na jeden příkaz agent neprovede, zbytek odmítne


/**
 * Zkontroluje a (v tomto kroku) naplánuje akce.
 * @param {Array}  actions   akce od modelu: [{ typ, cil, duvod }]
 * @param {Object} settings  zvalidované nastavení
 * @param {string} mode      'vyžádání' | 'automat'
 * @return {Object} { planned: [...], rejected: [...] }
 */
function actionsRun(actions, settings, mode, batch) {
  var planned = [];
  var rejected = [];
  var list = Array.isArray(actions) ? actions : [];

  for (var i = 0; i < list.length; i++) {
    var a = list[i] || {};
    var typ = String(a.typ || '').trim();
    var cil = String(a.cil || '').trim();
    var parametr = String(a.parametr || '').trim();
    var duvod = String(a.duvod || '').trim();

    if (i >= ACTIONS_MAX_PER_COMMAND) {
      rejected.push({ typ: typ, cil: cil, proc: 'překročen limit ' + ACTIONS_MAX_PER_COMMAND + ' akcí na jeden příkaz' });
      logRow(mode, serviceOf_(typ), cil, typ, duvod, 'odmítnuto: limit akcí');
      continue;
    }

    var whyNot = whitelistWhyNot_(typ, settings);
    if (whyNot) {
      rejected.push({ typ: typ, cil: cil, proc: whyNot });
      logRow(mode, serviceOf_(typ), cil, typ, duvod, 'odmítnuto: ' + whyNot);
      continue;
    }

    // Úroveň 1: akce jsou jen návrhy, nic se neprovádí
    if (settings.level === 1) {
      planned.push({ typ: typ, cil: cil, duvod: duvod, stav: 'návrh' });
      logRow(mode, serviceOf_(typ), cil, typ, duvod, 'návrh (úroveň 1)');
      continue;
    }

    // Úroveň 2 a 3: provést
    var outcome;
    try {
      outcome = executeOne_(typ, cil, parametr, batch);
    } catch (e) {
      rejected.push({ typ: typ, cil: cil, proc: 'chyba při provádění: ' + e.message });
      logRow(mode, serviceOf_(typ), cilLabel_(cil, batch), typ, duvod, 'chyba: ' + e.message);
      continue;
    }
    if (outcome.rejected) {
      rejected.push({ typ: typ, cil: cil, proc: outcome.rejected });
      logRow(mode, serviceOf_(typ), cilLabel_(cil, batch), typ, duvod, 'odmítnuto: ' + outcome.rejected);
      continue;
    }
    planned.push({ typ: typ, cil: cilLabel_(cil, batch), duvod: duvod, stav: outcome.result });
    logRow(mode, serviceOf_(typ), cilLabel_(cil, batch), typ, duvod, outcome.result);
  }

  return { planned: planned, rejected: rejected };
}


/**
 * Provede jednu povolenou akci. Vrátí { result } nebo { rejected: důvod }.
 * Tady je jediné místo, kde se volá Mail.gs a Drive.gs.
 */
function executeOne_(typ, cil, parametr, batch) {
  // Akce bez zásahu: shrnutí a návrh štítku jsou už v odpovědi modelu
  if (typ === 'shrnout' || typ === 'navrhnout_stitek') return { result: 'hotovo (jen odpověď, nic nezměněno)' };

  var item = mailFromBatch_(batch, cil);
  if (!item) return { rejected: 'e-mail "' + cil + '" není v aktuální dávce, agent na něj nesmí sáhnout' };

  switch (typ) {
    case 'pridat_stitek':         return { result: mailAddLabel(item, parametr) };
    case 'oznacit_precteno':      return { result: mailMarkRead(item) };
    case 'presunout_k_provereni': return { result: mailMoveToReview(item) };
    case 'vytvorit_koncept':      return { result: mailCreateDraft(item, parametr) };
    case 'archivovat':            return { result: mailArchive(item) };
    case 'ulozit_prilohu':        return { result: driveSaveAttachments(item) };
    default:                      return { rejected: 'akce "' + typ + '" nemá prováděcí funkci' };
  }
}


/**
 * Pro log a odpověď: místo čísla e-mailu jeho předmět.
 */
function cilLabel_(cil, batch) {
  var item = mailFromBatch_(batch, cil);
  return item ? '[' + item.n + '] ' + item.predmet : cil;
}


/**
 * Ke které službě akce patří (pro sloupec Služba v logu).
 */
function serviceOf_(typ) {
  if (typ === 'ulozit_prilohu') return 'disk';
  if (whitelistGet_(typ)) return 'gmail';
  return 'agent';
}


/**
 * Složí z výsledku lidsky čitelný text pro stránku.
 */
function actionsDescribe(result, settings) {
  var out = [];
  if (result.planned.length) {
    out.push(settings.level === 1 ? 'Navrhuji (nic jsem nezměnil):' : 'Provedeno:');
    result.planned.forEach(function (p) {
      out.push('• ' + labelOf_(p.typ) + (p.cil ? ' (' + p.cil + ')' : ''));
      // Skutečný výsledek z Mail.gs / Drive.gs, ne to, co model plánoval
      if (settings.level !== 1 && p.stav) out.push('   → ' + p.stav);
    });
  }
  if (result.rejected.length) {
    out.push('Neprovedu:');
    result.rejected.forEach(function (r) {
      out.push('• ' + (r.typ || 'neznámá akce') + (r.cil ? ' (' + r.cil + ')' : '') + ': ' + r.proc);
    });
  }
  return out.join('\n');
}


function labelOf_(typ) {
  var a = whitelistGet_(typ);
  return a ? a.popis.replace(/\.$/, '') : typ;
}


/**
 * Test hlídače bez volání modelu. Spusťte ručně v editoru: podstrčí hlídači
 * akce, které model nikdy nemá navrhnout, a do protokolu i do Agent Logu
 * zapíše, jak dopadly. Správný výsledek: všechny čtyři podvržené akce
 * jsou odmítnuty, pátá (shrnout) projde jako návrh.
 */
function testActionsGuard() {
  var settings = { canRead: true, canModify: false, canDrive: false, automat: false, level: 1, goal: '', model: '', tier: 'free', interval: 60 };
  var fake = [
    { typ: 'smazat',          cil: 'všechny newslettery', duvod: 'podvržená akce, mazání neexistuje' },
    { typ: 'odeslat',         cil: 'sef@firma.cz',        duvod: 'podvržená akce, odesílání neexistuje' },
    { typ: 'archivovat',      cil: 'staré e-maily',       duvod: 'existuje, ale vyžaduje úroveň 3' },
    { typ: 'ulozit_prilohu',  cil: 'faktura.pdf',         duvod: 'existuje, ale Disk je vypnutý' },
    { typ: 'shrnout',         cil: 'vše',                 duvod: 'povolená akce, má projít jako návrh' }
  ];
  var r = actionsRun(fake, settings, 'test', []);
  Logger.log('Odmítnuto (' + r.rejected.length + '):');
  r.rejected.forEach(function (x) { Logger.log('  ' + x.typ + ': ' + x.proc); });
  Logger.log('Prošlo (' + r.planned.length + '):');
  r.planned.forEach(function (x) { Logger.log('  ' + x.typ + ' -> ' + x.stav); });
  Logger.log(r.rejected.length === 4 && r.planned.length === 1 ? 'VÝSLEDEK: hlídač funguje.' : 'VÝSLEDEK: NĚCO JE ŠPATNĚ, zkontrolujte Whitelist.gs a Actions.gs.');
}
