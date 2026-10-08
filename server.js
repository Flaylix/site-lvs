// Serveur du site PesentiRenov38 : sert le site et envoie un SMS (Brevo) à chaque demande de devis.
// Aucune dépendance : Node 18 ou plus suffit.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Réglages, à définir dans les variables d'environnement (Railway > Variables)
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const SMS_TO = process.env.SMS_TO || '33767026515';          // numéro de Jérémy, format international sans +
const SMS_SENDER = process.env.SMS_SENDER || 'PesentiRnv';   // 11 caractères max, lettres et chiffres
const EMAIL_TO = process.env.EMAIL_TO || '';                 // optionnel : copie complète par e-mail
const EMAIL_FROM = process.env.EMAIL_FROM || '';             // expéditeur validé dans Brevo

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

// Anti-abus simple : 5 demandes par heure et par adresse IP
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function brevo(endpoint, body) {
  const r = await fetch('https://api.brevo.com/v3/' + endpoint, {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Brevo ${endpoint} ${r.status} ${await r.text()}`);
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleDevis(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10000) return json(res, 413, { ok: false, error: 'Message trop long.' });
  }
  let d;
  try { d = JSON.parse(raw); } catch { return json(res, 400, { ok: false, error: 'Demande illisible.' }); }

  // Champ piège invisible : s'il est rempli, c'est un robot. On répond OK sans rien envoyer.
  if (clean(d.site, 100)) return json(res, 200, { ok: true });

  const nom = clean(d.nom, 60), tel = clean(d.tel, 20), commune = clean(d.commune, 60);
  const type = clean(d.type, 40), surface = clean(d.surface, 10), projet = clean(d.projet, 1500);
  if (nom.length < 2 || tel.replace(/\D/g, '').length < 9)
    return json(res, 400, { ok: false, error: 'Indiquez votre nom et un numéro de téléphone valide.' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (tooMany(ip)) return json(res, 429, { ok: false, error: 'Trop de demandes. Appelez le 07 67 02 65 15.' });

  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY manquante : demande non envoyée', { nom, tel, commune, type, surface });
    return json(res, 503, { ok: false, error: 'Envoi indisponible. Appelez le 07 67 02 65 15.' });
  }

  const sms = `Devis site: ${nom}, ${tel}. ${type}${surface ? ' ' + surface + 'm2' : ''}${commune ? ', ' + commune : ''}`.slice(0, 160);
  const jobs = [brevo('transactionalSMS/send', { sender: SMS_SENDER, recipient: SMS_TO, content: sms, type: 'transactional' })];
  if (EMAIL_TO && EMAIL_FROM) {
    jobs.push(brevo('smtp/email', {
      sender: { name: 'Site PesentiRenov38', email: EMAIL_FROM },
      to: [{ email: EMAIL_TO }],
      subject: `Demande de devis : ${type} (${nom})`,
      htmlContent: `<p><b>Nom :</b> ${esc(nom)}<br><b>Téléphone :</b> ${esc(tel)}<br><b>Commune :</b> ${esc(commune || 'non précisée')}<br><b>Travaux :</b> ${esc(type)}<br><b>Surface :</b> ${esc(surface || 'non précisée')} m²</p><p><b>Projet :</b><br>${esc(projet || 'à préciser par téléphone')}</p>`
    }));
  }
  const results = await Promise.allSettled(jobs);
  results.forEach(r => r.status === 'rejected' && console.error(r.reason.message));
  if (results.every(r => r.status === 'rejected'))
    return json(res, 502, { ok: false, error: 'Envoi impossible pour le moment. Appelez le 07 67 02 65 15.' });
  console.log('Demande de devis transmise', { type, commune });
  json(res, 200, { ok: true });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/devis') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Méthode non autorisée.' });
    return handleDevis(req, res).catch(e => { console.error(e); json(res, 500, { ok: false, error: 'Erreur serveur. Appelez le 07 67 02 65 15.' }); });
  }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, home) => {
        res.writeHead(e2 ? 500 : 404, { 'content-type': TYPES['.html'] });
        res.end(e2 ? 'Erreur' : home);
      });
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Site PesentiRenov38 en ligne sur le port ' + PORT));
