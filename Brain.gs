/**
 * =====================================================================
 *  Brain.gs  |  Jediné místo, kde agent mluví s modelem
 * =====================================================================
 *
 *  Autor: Pavel Horák ve spolupráci s Claude (Anthropic)  |  Verze 1.0, září 2026
 *  Zdroj: github.com/pavel-horak-cz/zaciname-s-agenty-zdroje  |  Návod: zaciname-s-agenty.pprojects.cz
 *
 *  CO TENTO SOUBOR DĚLÁ
 *  ---------------------
 *  - Vezme příkaz uživatele, cíl agenta a seznam akcí, které jsou při
 *    aktuálním nastavení povolené, a pošle je modelu Gemini.
 *  - Modelu vynutí odpověď ve tvaru JSON:
 *      { "odpoved": "text pro uživatele", "akce": [ { "typ", "cil", "parametr", "duvod" } ] }
 *  - Počítá volání a tokeny za den (v paměti skriptu) a při překročení
 *    denního stropu odmítne dál volat.
 *  - Při vytížení modelu (chyba 429) skončí a řekne to uživateli. Nezkouší znovu.
 *
 *  CO TENTO SOUBOR NIKDY NEUDĚLÁ
 *  ------------------------------
 *  - Nic neprovádí. Jen rozhoduje. Provádění hlídá Actions.gs.
 *  - Neposílá modelu přílohy ani celé e-maily, jen to, co dostane v zadání.
 *  - Nevrací klíč k modelu nikam.
 * =====================================================================
 */

var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
var DAILY_CALL_LIMIT = 50;           // tvrdý strop volání modelu za den (změňte zde, když potřebujete víc)
var PROP_USAGE = 'AGENT_USAGE';      // { "date": "2026-09-16", "calls": 3, "tokens": 1234 }


/**
 * Zeptá se modelu, co udělat s příkazem uživatele.
 * @param {string} command   příkaz uživatele
 * @param {Object} settings  zvalidované nastavení (Config.gs)
 * @param {string} context   text s daty (dávka e-mailů z Mail.gs), nebo prázdný
 * @param {Array}  recent    posledních pár výměn z prohlížeče [{ q, a }]
 * @return {Object} { ok, odpoved, akce, error, usage }
 */
function brainDecide(command, settings, context, recent) {
  var apiKey = getApiKey_();
  if (!apiKey) return { ok: false, error: 'Chybí klíč k modelu. Vložte ho v Nastavení.' };

  var usage = usageToday_();
  if (usage.calls >= DAILY_CALL_LIMIT) {
    return { ok: false, error: 'Dnešní limit ' + DAILY_CALL_LIMIT + ' volání modelu je vyčerpán. Zítra znovu, nebo zvyšte limit.' };
  }

  var allowed = whitelistAllowed_(settings);
  var prompt = buildPrompt_(command, settings, allowed, context, recent);

  var body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          odpoved: { type: 'STRING' },
          akce: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                typ: { type: 'STRING' },
                cil: { type: 'STRING' },
                parametr: { type: 'STRING' },
                duvod: { type: 'STRING' }
              },
              required: ['typ', 'cil', 'duvod']
            }
          }
        },
        required: ['odpoved', 'akce']
      }
    }
  };

  var response;
  try {
    response = UrlFetchApp.fetch(GEMINI_URL + settings.model + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: 'Model se nepodařilo zavolat: ' + e.message };
  }

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code === 429) {
    usageAdd_(1, 0);
    return { ok: false, error: 'Model je teď vytížený nebo je vyčerpán bezplatný limit u Googlu (429). Zkuste to za chvíli.' };
  }
  if (code === 400 || code === 403) {
    return { ok: false, error: 'Google odmítl klíč nebo požadavek (' + code + '). Zkontrolujte klíč v Nastavení. ' + shortError_(text) };
  }
  if (code !== 200) {
    return { ok: false, error: 'Model odpověděl chybou ' + code + '. ' + shortError_(text) };
  }

  var data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'Odpověď modelu nešla přečíst.' }; }

  var tokens = (data.usageMetadata && data.usageMetadata.totalTokenCount) || 0;
  usageAdd_(1, tokens);

  var raw = '';
  try { raw = data.candidates[0].content.parts[0].text; } catch (e) {}
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, error: 'Model nevrátil platný JSON.', usage: usageToday_() }; }

  return {
    ok: true,
    odpoved: String(parsed.odpoved || ''),
    akce: Array.isArray(parsed.akce) ? parsed.akce : [],
    usage: usageToday_()
  };
}


/**
 * Vypíše do protokolu modely, které váš klíč dnes skutečně nabízí.
 * Spusťte ručně v editoru, když agent hlásí, že model není dostupný.
 * Google modely přejmenovává a starší vypíná; pak upravte ALLOWED_MODELS
 * v Config.gs a volby v Nastavení ve Web.html.
 */
function listAvailableModels() {
  var apiKey = getApiKey_();
  if (!apiKey) { Logger.log('Chybí klíč. Vložte ho v Nastavení na stránce agenta.'); return; }
  var res = UrlFetchApp.fetch(GEMINI_URL, {
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) { Logger.log('Chyba ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300)); return; }
  var models = JSON.parse(res.getContentText()).models || [];
  models.forEach(function (m) {
    var ok = (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1;
    if (ok) Logger.log(m.name.replace('models/', '') + '  (' + (m.displayName || '') + ')');
  });
  Logger.log('Celkem modelů pro generateContent: ' + models.filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; }).length);
}


// ---------------------------------------------------------------------
//  Zadání pro model
// ---------------------------------------------------------------------

function buildPrompt_(command, settings, allowed, context, recent) {
  var lines = [];
  lines.push('Jsi osobní agent pro Gmail a Disk Google. Mluvíš česky, stručně a věcně.');
  lines.push('Uživatel ti dal tento cíl: ' + (settings.goal ? '"' + settings.goal + '"' : '(žádný cíl nezadal)'));
  lines.push('');
  lines.push('Smíš navrhnout POUZE tyto akce (typ: popis):');
  if (allowed.length === 0) {
    lines.push('- (žádné; při tomto nastavení nesmíš nic dělat, můžeš jen odpovědět slovy)');
  } else {
    allowed.forEach(function (a) { lines.push('- ' + a.id + ': ' + a.popis); });
  }
  lines.push('');
  lines.push('Pravidla:');
  lines.push('- Nikdy nenavrhuj mazání, odesílání e-mailů ani označení jako spam. Tyto akce neexistují.');
  lines.push('- Když uživatel chce něco, co není v seznamu, do "odpoved" vysvětli, že to neumíš, a nabídni nejbližší povolenou akci. Do "akce" pak nic nedávej.');
  lines.push('- Pole "cil" je číslo e-mailu z dávky (např. "3"), jeden e-mail na jednu akci. Pro akci "shrnout" bez konkrétního e-mailu napiš "vše". Nikdy si číslo nevymýšlej; když e-mail v dávce není, akci nenavrhuj.');
  lines.push('- Pole "parametr": u "pridat_stitek" název štítku (krátký, česky), u "vytvorit_koncept" celý text odpovědi. Jinak nech prázdné.');
  lines.push('- Shrnutí pro uživatele napiš přímo do "odpoved": co je důležité, co je newsletter, co má přílohy. Stručně, po bodech, česky.');
  lines.push('- V dávce vidíš názvy příloh, takže výběr podle typu (např. jen PDF) umíš sám. Dávka obsahuje jen posledních 24 hodin Doručené pošty; starší e-maily nevidíš a řekni to.');
  lines.push('- Když příkaz navazuje na předchozí rozhovor ("ano", "jen tři", "ten první"), vycházej z toho, co jsi naposledy nabídl.');
  lines.push('- Pole "duvod" je jedna věta, proč to navrhuješ.');
  lines.push('- Do "akce" můžeš dát více akcí najednou, i několik pro tentýž e-mail (např. přidat štítek a zároveň přesunout k prověření). Když uživatel chce dvě věci, které obě umíš, vrať obě.');
  lines.push('- Otázka není příkaz. Když se uživatel jen ptá ("které e-maily mají přílohu?", "co je nového?"), odpověz slovy a do "akce" dej nanejvýš "shrnout". Akce, které něco mění nebo ukládají, navrhuj jen na výslovný pokyn.');
  lines.push('- V "odpoved" piš, co uděláš, ne co jsi udělal ("Uložím přílohu", ne "Uložil jsem"). Akce provádí systém až po tvé odpovědi a skutečný výsledek doplní sám. Nikdy netvrď, že něco proběhlo.');
  lines.push('- Odpověz jen JSON podle schématu.');
  lines.push('');
  if (recent && recent.length) {
    lines.push('Předchozí rozhovor (od nejstaršího):');
    recent.forEach(function (r) {
      lines.push('Uživatel: ' + String(r.q || '').slice(0, 300));
      lines.push('Ty: ' + String(r.a || '').slice(0, 600));
    });
    lines.push('');
  }
  if (context) {
    lines.push('Data, se kterými pracuješ:');
    lines.push(context);
    lines.push('');
  } else {
    lines.push('Nemáš žádná data z pošty, protože přepínač "Číst e-maily" je vypnutý nebo se nic nenačetlo. Pracuj jen s příkazem a řekni uživateli, co by musel zapnout.');
    lines.push('');
  }
  lines.push('Příkaz uživatele: "' + command + '"');
  return lines.join('\n');
}


// ---------------------------------------------------------------------
//  Denní spotřeba (volání a tokeny) v paměti skriptu
// ---------------------------------------------------------------------

function usageToday_() {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), 'Europe/Prague', 'yyyy-MM-dd');
  var u = null;
  try { u = JSON.parse(props.getProperty(PROP_USAGE) || 'null'); } catch (e) {}
  if (!u || u.date !== today) u = { date: today, calls: 0, tokens: 0 };
  return u;
}

function usageAdd_(calls, tokens) {
  var u = usageToday_();
  u.calls += calls;
  u.tokens += tokens;
  PropertiesService.getScriptProperties().setProperty(PROP_USAGE, JSON.stringify(u));
}

function shortError_(text) {
  try {
    var j = JSON.parse(text);
    return j.error && j.error.message ? j.error.message.slice(0, 200) : '';
  } catch (e) {
    return '';
  }
}
