/**
 * =====================================================================
 *  Mail.gs  |  Práce s poštou
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  - mailFetchRecent()  načte dávku nových e-mailů z Doručené pošty (výchozí
 *                        posledních 24 hodin, nejvýš 30 vláken) a pro každý vrátí
 *                        jen: pořadové číslo v dávce (od nejstaršího, aby čísla
 *                        držela i po příchodu nové pošty), odesílatele, předmět, datum,
 *                        prvních 400 znaků textu a názvy příloh. Newslettery
 *                        (hlavička List-Unsubscribe) označí, aby je model dostal
 *                        jen jako jednořádkový seznam.
 *  - mailFormatContext() převede dávku na text pro model.
 *  - Provádění akcí:     přidat štítek, označit jako přečtené, přesunout
 *                        k prověření, vytvořit koncept, archivovat.
 *                        Každá akce pracuje POUZE s e-mailem z aktuální dávky
 *                        (podle pořadového čísla), nikdy s vyhledáváním.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Neodesílá e-maily. Funkce pro odeslání v tomto souboru neexistuje.
 *  - Nemaže e-maily ani vlákna. Funkce pro mazání neexistuje.
 *  - Neoznačuje jako spam.
 *  - Nesahá na e-mail, který nebyl v dávce načtené pro aktuální příkaz.
 * =====================================================================
 */

var MAIL_DEFAULT_QUERY = 'in:inbox newer_than:1d';
var MAIL_MAX_THREADS = 30;
var MAIL_BODY_CHARS = 400;
var MAIL_LABEL_MAX = 40;


/**
 * Načte dávku e-mailů. Vrátí pole položek { n, id, od, predmet, datum, text, prilohy, newsletter }.
 * @param {Object} settings   zvalidované nastavení (musí mít canRead === true)
 * @param {string} query      volitelný Gmail dotaz; výchozí MAIL_DEFAULT_QUERY
 */
function mailFetchRecent(settings, query) {
  if (!settings || settings.canRead !== true) return [];
  var threads = GmailApp.search(query || MAIL_DEFAULT_QUERY, 0, MAIL_MAX_THREADS);
  // Gmail vrací nejnovější první. Otočíme pořadí, aby nejstarší byl [1]:
  // nová pošta se pak přidává na konec a čísla starších e-mailů se mezi příkazy nemění.
  threads.reverse();
  var batch = [];
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    var m = msgs[msgs.length - 1];   // poslední zpráva ve vlákně
    var body = '';
    try { body = m.getPlainBody(); } catch (e) { body = ''; }
    body = body.replace(/\s+/g, ' ').trim().slice(0, MAIL_BODY_CHARS);
    var attachments = [];
    try {
      m.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function (a) { attachments.push(a.getName()); });
    } catch (e) {}
    var unsub = '';
    try { unsub = m.getHeader('List-Unsubscribe') || ''; } catch (e) {}
    batch.push({
      n: i + 1,
      id: m.getId(),
      threadId: threads[i].getId(),
      od: m.getFrom(),
      predmet: m.getSubject() || '(bez předmětu)',
      datum: Utilities.formatDate(m.getDate(), 'Europe/Prague', 'd.M. HH:mm'),
      text: body,
      prilohy: attachments,
      newsletter: unsub !== '',
      neprecteno: m.isUnread()
    });
  }
  return batch;
}


/**
 * Text pro model. Newslettery jen jednou řádkou, ostatní s náhledem textu.
 */
function mailFormatContext(batch) {
  if (!batch || !batch.length) return 'Doručená pošta za posledních 24 hodin je prázdná.';
  var lines = ['Doručená pošta za posledních 24 hodin (' + batch.length + ' vláken). Každý e-mail má číslo [n], které používej v poli "cil".'];
  batch.forEach(function (e) {
    var head = '[' + e.n + '] ' + e.datum + ' | od: ' + e.od + ' | předmět: ' + e.predmet + (e.neprecteno ? ' | nepřečteno' : '');
    if (e.newsletter) {
      lines.push(head + ' | NEWSLETTER');
    } else {
      lines.push(head + (e.prilohy.length ? ' | přílohy: ' + e.prilohy.join(', ') : ''));
      if (e.text) lines.push('    text: ' + e.text);
    }
  });
  return lines.join('\n');
}


/**
 * Najde e-mail v dávce podle pole "cil" od modelu (číslo). Vrátí položku nebo null.
 */
function mailFromBatch_(batch, cil) {
  var n = parseInt(String(cil).replace(/[^\d]/g, ''), 10);
  if (!n || !batch) return null;
  for (var i = 0; i < batch.length; i++) if (batch[i].n === n) return batch[i];
  return null;
}


// ---------------------------------------------------------------------
//  Provádění akcí. Každá vrátí text výsledku nebo vyhodí chybu.
// ---------------------------------------------------------------------

function mailAddLabel(item, labelName) {
  var name = String(labelName || '').trim().slice(0, MAIL_LABEL_MAX);
  if (!name) throw new Error('chybí název štítku');
  var label = getOrCreateLabel_(name);
  GmailApp.getThreadById(item.threadId).addLabel(label);
  return 'štítek "' + name + '" přidán';
}

function mailMarkRead(item) {
  GmailApp.getMessageById(item.id).markRead();
  return 'označeno jako přečtené';
}

function mailMoveToReview(item) {
  var label = getOrCreateLabel_(AGENT_LABEL_REVIEW);
  GmailApp.getThreadById(item.threadId).addLabel(label);
  return 'přesunuto k prověření (štítek ' + AGENT_LABEL_REVIEW + ')';
}

function mailCreateDraft(item, text) {
  var body = String(text || '').trim();
  if (!body) throw new Error('chybí text konceptu');
  GmailApp.getMessageById(item.id).createDraftReply(body);
  return 'koncept odpovědi vytvořen (neodesláno)';
}

function mailArchive(item) {
  GmailApp.getThreadById(item.threadId).moveToArchive();
  return 'archivováno (odstraněno z Doručené pošty, e-mail zůstává)';
}
