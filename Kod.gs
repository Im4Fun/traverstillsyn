/**
 * Daglig tillsyn traverser – backend
 *
 * Flikar som förväntas i kalkylbladet:
 *   Anvandare   : id | namn | pin | roll | skapad
 *   Traverser   : id | avdelning | individnr | placering | typ | extrakontroll | aktiv
 *   Checklista  : id | grupp | gruppnamn | punkt | text | aktiv
 *   Kontroller  : id | tidpunkt | traversId | individnr | placering | anvandareId |
 *                 anvandareNamn | resultat(JSON) | antalAnmarkningar | status | kommentar
 *
 * PIN-koder lämnar aldrig servern. Klienten skickar namn + pin till action=login
 * och får tillbaka endast { ok, id, namn, roll }.
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  anvandare: 'Anvandare',
  traverser: 'Traverser',
  checklista: 'Checklista',
  kontroller: 'Kontroller'
};

// ── Hjälpfunktioner ────────────────────────────────────────────

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) throw new Error('Fliken "' + name + '" saknas i kalkylbladet.');
  return sh;
}

/** Läser en flik som array av objekt med rubrikraden som nycklar. */
function readRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    const obj = {};
    headers.forEach(function (h, j) { if (h) obj[h] = row[j]; });
    obj._rad = i + 1;
    rows.push(obj);
  }
  return rows;
}

function uid_(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' +
    Math.floor(Math.random() * 1e6).toString(36);
}

function truthy_(v) {
  const s = String(v).trim().toLowerCase();
  return s === 'ja' || s === 'true' || s === '1' || s === 'x' || s === 'y';
}

function iso_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

/** Hittar radnummer för ett id i en flik. Returnerar -1 om det saknas. */
function findRow_(name, id) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const idCol = headers.indexOf('id');
  if (idCol === -1) return -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) return i + 1;
  }
  return -1;
}

/** Verifierar att anroparen finns och har admin-roll. */
function kravAdmin_(anvandareId) {
  const rows = readRows_(SHEETS.anvandare);
  const user = rows.filter(function (u) {
    return String(u.id) === String(anvandareId);
  })[0];
  if (!user) throw new Error('Okänd användare.');
  if (String(user.roll).trim().toLowerCase() !== 'admin') {
    throw new Error('Behörighet saknas.');
  }
  return user;
}

// ── GET: hämtar allt appen behöver ─────────────────────────────

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'bootstrap';

    if (action === 'bootstrap') {
      return json_({
        ok: true,
        traverser: hamtaTraverser_(),
        checklista: hamtaChecklista_(),
        senaste: hamtaSenastePerTravers_(),
        anvandarnamn: hamtaAnvandarnamn_()
      });
    }

    if (action === 'kontroller') {
      const admin = e.parameter.admin;
      if (admin) kravAdmin_(admin);
      return json_({ ok: true, kontroller: hamtaKontroller_(e.parameter.traversId) });
    }

    if (action === 'anvandare') {
      kravAdmin_(e.parameter.admin);
      return json_({ ok: true, anvandare: hamtaAnvandareUtanPin_() });
    }

    return json_({ ok: false, fel: 'Okänd action: ' + action });
  } catch (err) {
    return json_({ ok: false, fel: String(err.message || err) });
  }
}

function hamtaTraverser_() {
  return readRows_(SHEETS.traverser)
    .filter(function (t) { return t.aktiv === '' || truthy_(t.aktiv); })
    .map(function (t) {
      return {
        id: String(t.id),
        avdelning: String(t.avdelning || ''),
        individnr: String(t.individnr || ''),
        placering: String(t.placering || ''),
        typ: String(t.typ || ''),
        extrakontroll: truthy_(t.extrakontroll)
      };
    });
}

function hamtaChecklista_() {
  return readRows_(SHEETS.checklista)
    .filter(function (c) { return c.aktiv === '' || truthy_(c.aktiv); })
    .map(function (c) {
      return {
        id: String(c.id),
        grupp: String(c.grupp || ''),
        gruppnamn: String(c.gruppnamn || ''),
        punkt: String(c.punkt || ''),
        text: String(c.text || '')
      };
    });
}

function hamtaAnvandarnamn_() {
  return readRows_(SHEETS.anvandare).map(function (u) { return String(u.namn); });
}

function hamtaAnvandareUtanPin_() {
  return readRows_(SHEETS.anvandare).map(function (u) {
    return {
      id: String(u.id),
      namn: String(u.namn),
      roll: String(u.roll || 'personal'),
      skapad: iso_(u.skapad)
    };
  });
}

/** Senaste kontroll per travers – driver färgkoderna i objektlistan. */
function hamtaSenastePerTravers_() {
  const rows = readRows_(SHEETS.kontroller);
  const karta = {};
  rows.forEach(function (r) {
    const tid = String(r.traversId);
    const tidpunkt = iso_(r.tidpunkt);
    if (!karta[tid] || tidpunkt > karta[tid].tidpunkt) {
      karta[tid] = {
        tidpunkt: tidpunkt,
        anvandareNamn: String(r.anvandareNamn || ''),
        antalAnmarkningar: Number(r.antalAnmarkningar || 0),
        status: String(r.status || '')
      };
    }
  });
  return karta;
}

function hamtaKontroller_(traversId) {
  let rows = readRows_(SHEETS.kontroller);
  if (traversId) {
    rows = rows.filter(function (r) { return String(r.traversId) === String(traversId); });
  }
  return rows.map(function (r) {
    let resultat = [];
    try { resultat = JSON.parse(r.resultat || '[]'); } catch (x) { resultat = []; }
    return {
      id: String(r.id),
      tidpunkt: iso_(r.tidpunkt),
      traversId: String(r.traversId),
      individnr: String(r.individnr || ''),
      placering: String(r.placering || ''),
      anvandareNamn: String(r.anvandareNamn || ''),
      resultat: resultat,
      antalAnmarkningar: Number(r.antalAnmarkningar || 0),
      status: String(r.status || ''),
      kommentar: String(r.kommentar || '')
    };
  }).sort(function (a, b) { return b.tidpunkt.localeCompare(a.tidpunkt); });
}

// ── POST: inloggning, sparande och adminåtgärder ───────────────

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case 'login':          return json_(login_(data));
      case 'sparaKontroll':  return json_(sparaKontroll_(data));
      case 'laggTillAnvandare': return json_(laggTillAnvandare_(data));
      case 'raderaAnvandare':   return json_(raderaAnvandare_(data));
      case 'laggTillTravers':   return json_(laggTillTravers_(data));
      case 'raderaTravers':     return json_(raderaTravers_(data));
      case 'raderaKontroll':    return json_(raderaKontroll_(data));
      case 'bytPin':            return json_(bytPin_(data));
      default: return json_({ ok: false, fel: 'Okänd action: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, fel: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Servervaliderad inloggning. PIN jämförs här och returneras aldrig. */
function login_(data) {
  const namn = String(data.namn || '').trim();
  const pin = String(data.pin || '').trim();
  if (!namn || !pin) return { ok: false, fel: 'Fyll i både namn och PIN.' };

  const rows = readRows_(SHEETS.anvandare);
  const user = rows.filter(function (u) {
    return String(u.namn).trim().toLowerCase() === namn.toLowerCase() &&
           String(u.pin).trim() === pin;
  })[0];

  if (!user) return { ok: false, fel: 'Fel namn eller PIN.' };

  return {
    ok: true,
    anvandare: {
      id: String(user.id),
      namn: String(user.namn),
      roll: String(user.roll || 'personal')
    }
  };
}

function sparaKontroll_(data) {
  const sh = sheet_(SHEETS.kontroller);
  const resultat = data.resultat || [];
  const anmarkningar = resultat.filter(function (r) { return r.varde === 1; });
  const status = anmarkningar.length > 0 ? 'Anmärkning' : 'Godkänd';
  const id = uid_('K');

  sh.appendRow([
    id,
    data.tidpunkt || new Date().toISOString(),
    String(data.traversId || ''),
    String(data.individnr || ''),
    String(data.placering || ''),
    String(data.anvandareId || ''),
    String(data.anvandareNamn || ''),
    JSON.stringify(resultat),
    anmarkningar.length,
    status,
    String(data.kommentar || '')
  ]);

  return { ok: true, id: id, status: status, antalAnmarkningar: anmarkningar.length };
}

function laggTillAnvandare_(data) {
  kravAdmin_(data.adminId);
  const namn = String(data.namn || '').trim();
  const pin = String(data.pin || '').trim();
  const roll = String(data.roll || 'personal').trim().toLowerCase();

  if (!namn || !pin) return { ok: false, fel: 'Namn och PIN krävs.' };
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, fel: 'PIN ska vara 4–8 siffror.' };

  const finns = readRows_(SHEETS.anvandare).some(function (u) {
    return String(u.namn).trim().toLowerCase() === namn.toLowerCase();
  });
  if (finns) return { ok: false, fel: 'Det finns redan en användare med det namnet.' };

  const id = uid_('U');
  sheet_(SHEETS.anvandare).appendRow([id, namn, pin, roll, new Date().toISOString()]);
  return { ok: true, id: id };
}

function raderaAnvandare_(data) {
  kravAdmin_(data.adminId);
  if (String(data.id) === String(data.adminId)) {
    return { ok: false, fel: 'Du kan inte ta bort ditt eget konto.' };
  }
  const kvarvarandeAdmins = readRows_(SHEETS.anvandare).filter(function (u) {
    return String(u.roll).toLowerCase() === 'admin' && String(u.id) !== String(data.id);
  });
  if (kvarvarandeAdmins.length === 0) {
    return { ok: false, fel: 'Minst en admin måste finnas kvar.' };
  }
  const rad = findRow_(SHEETS.anvandare, data.id);
  if (rad === -1) return { ok: false, fel: 'Användaren hittades inte.' };
  sheet_(SHEETS.anvandare).deleteRow(rad);
  return { ok: true };
}

function bytPin_(data) {
  const rows = readRows_(SHEETS.anvandare);
  const user = rows.filter(function (u) { return String(u.id) === String(data.anvandareId); })[0];
  if (!user) return { ok: false, fel: 'Okänd användare.' };
  if (String(user.pin).trim() !== String(data.gammalPin || '').trim()) {
    return { ok: false, fel: 'Nuvarande PIN stämmer inte.' };
  }
  const ny = String(data.nyPin || '').trim();
  if (!/^\d{4,8}$/.test(ny)) return { ok: false, fel: 'Ny PIN ska vara 4–8 siffror.' };

  const sh = sheet_(SHEETS.anvandare);
  const headers = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
  sh.getRange(user._rad, headers.indexOf('pin') + 1).setValue(ny);
  return { ok: true };
}

function laggTillTravers_(data) {
  kravAdmin_(data.adminId);
  const individnr = String(data.individnr || '').trim();
  const placering = String(data.placering || '').trim();
  if (!placering) return { ok: false, fel: 'Placering krävs.' };

  const id = uid_('T');
  sheet_(SHEETS.traverser).appendRow([
    id,
    String(data.avdelning || ''),
    individnr,
    placering,
    String(data.typ || ''),
    data.extrakontroll ? 'Ja' : 'Nej',
    'Ja'
  ]);
  return { ok: true, id: id };
}

function raderaTravers_(data) {
  kravAdmin_(data.adminId);
  const rad = findRow_(SHEETS.traverser, data.id);
  if (rad === -1) return { ok: false, fel: 'Traversen hittades inte.' };
  sheet_(SHEETS.traverser).deleteRow(rad);
  return { ok: true };
}

function raderaKontroll_(data) {
  kravAdmin_(data.adminId);
  const rad = findRow_(SHEETS.kontroller, data.id);
  if (rad === -1) return { ok: false, fel: 'Kontrollen hittades inte.' };
  sheet_(SHEETS.kontroller).deleteRow(rad);
  return { ok: true };
}

// ── Engångsuppsättning ─────────────────────────────────────────

/**
 * Kör denna en gång från Apps Script-editorn för att skapa alla flikar,
 * fylla på traverslistan, checklistan och adminkontot.
 */
function skapaUppsattning() {
  // Anvandare
  let sh = SS.getSheetByName(SHEETS.anvandare) || SS.insertSheet(SHEETS.anvandare);
  sh.clear();
  sh.appendRow(['id', 'namn', 'pin', 'roll', 'skapad']);
  sh.appendRow([uid_('U'), 'Admin', '1234', 'admin', new Date().toISOString()]);
  sh.setFrozenRows(1);

  // Traverser
  sh = SS.getSheetByName(SHEETS.traverser) || SS.insertSheet(SHEETS.traverser);
  sh.clear();
  sh.appendRow(['id', 'avdelning', 'individnr', 'placering', 'typ', 'extrakontroll', 'aktiv']);
  const traverser = [
    ['UH', '', 'Telfer', '', 'Nej'],

  traverser.forEach(function (t) {
    sh.appendRow([uid_('T'), t[0], t[1], t[2], t[3], t[4], 'Ja']);
  });
  sh.setFrozenRows(1);

  // Checklista
  sh = SS.getSheetByName(SHEETS.checklista) || SS.insertSheet(SHEETS.checklista);
  sh.clear();
  sh.appendRow(['id', 'grupp', 'gruppnamn', 'punkt', 'text', 'aktiv']);
  const punkter = [
    ['1', 'Kontroll av linan', '1.1', 'Kontroll av linan, skador, trådbrott och trasiga kardeler.'],
    ['1', 'Kontroll av linan', '1.2', 'Kontrollera att linan ligger rätt i linskivor / trumma.'],
    ['2', 'Kontroll av lyftblock', '2.1', 'Kontrollera att kroken skall kunna röra sig lätt i alla riktningar.'],
    ['2', 'Kontroll av lyftblock', '2.2', 'Kontrollera säkerhetsspärren och dess funktion.'],
    ['3', 'Kontroll av lyftgränsbrytare', '3.1', 'Kontrollera att övre gränsläget fungerar korrekt.'],
    ['3', 'Kontroll av lyftgränsbrytare', '3.2', 'Kontrollera att nedre gränsläget fungerar korrekt. (finns inte på alla)'],
    ['4', 'Kontroll av manöverdon', '4.1', 'Kontrollera att manöverdonet ej är skadat.'],
    ['4', 'Kontroll av manöverdon', '4.2', 'Kontrollera att knappar inte är lösa eller trasiga.'],
    ['4', 'Kontroll av manöverdon', '4.3', 'Kontrollera att knappar motsvarar avsedd funktion och hastighet.'],
    ['5', 'Kontroll av broms', '5.1', 'Kontrollera att ljudet från broms låter som vanligt vid start och stopp.'],
    ['5', 'Kontroll av broms', '5.2', 'Kontrollera att lyftet stoppar med en normal stoppsträcka.'],
    ['6', 'Nödstoppknapp', '6.1', 'Kontroll av nödstoppknapp.'],
    ['6', 'Nödstoppknapp', '6.2', 'Kontrollera med intryckt nödstopp att det ej går att köra någon rörelse.']
  ];
  punkter.forEach(function (p) {
    sh.appendRow([uid_('C'), p[0], p[1], p[2], p[3], 'Ja']);
  });
  sh.setFrozenRows(1);

  // Kontroller
  sh = SS.getSheetByName(SHEETS.kontroller) || SS.insertSheet(SHEETS.kontroller);
  sh.clear();
  sh.appendRow(['id', 'tidpunkt', 'traversId', 'individnr', 'placering', 'anvandareId',
                'anvandareNamn', 'resultat', 'antalAnmarkningar', 'status', 'kommentar']);
  sh.setFrozenRows(1);

  // Ta bort standardfliken om den är tom
  const std = SS.getSheetByName('Blad1') || SS.getSheetByName('Sheet1');
  if (std && std.getLastRow() === 0 && SS.getSheets().length > 1) SS.deleteSheet(std);

  SpreadsheetApp.getUi().alert(
    'Uppsättningen är klar.\n\n' +
    '23 traverser, 13 checklistpunkter och adminkontot har lagts in.\n\n' +
    'Byt PIN-koden 1234 i fliken Anvandare innan appen tas i bruk.'
  );
}
