// Bolão TMF/TEM AGRO 2026 — servidor principal
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'copa2026';

// ── Banco de dados ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'db', 'bolao.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    name       TEXT PRIMARY KEY,
    pass_hash  TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS palpites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player     TEXT NOT NULL,
    match_id   TEXT NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(player, match_id)
  );

  CREATE TABLE IF NOT EXISTS resultados (
    match_id   TEXT PRIMARY KEY,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS match_overrides (
    match_id   TEXT PRIMARY KEY,
    home       TEXT NOT NULL,
    hf         TEXT NOT NULL,
    away       TEXT NOT NULL,
    af         TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Dados dos jogos ───────────────────────────────────────────────────────────
const PHASES = {
  grupos:  { label: 'Fase de grupos',   mult: 1 },
  oitavas: { label: 'Oitavas de final', mult: 2 },
  quartas: { label: 'Quartas de final', mult: 3 },
  semi:    { label: 'Semifinal',        mult: 4 },
  final:   { label: 'Final',            mult: 5 },
};

// Todos os horários em UTC. BRT = UTC-3.
// Ex: 16:00 BRT = 19:00 UTC | 23:00 BRT = 02:00 UTC do dia seguinte
const MATCHES = [
  // ── RODADA 1 ─────────────────────────────────────────────────────────────
  // 11/jun
  { id:'g01', phase:'grupos', group:'Grupo A', home:'México',               hf:'🇲🇽', away:'África do Sul',        af:'🇿🇦', dt:'2026-06-11T19:00:00Z' }, // 16:00 BRT
  { id:'g04', phase:'grupos', group:'Grupo A', home:'Coreia do Sul',        hf:'🇰🇷', away:'Tchéquia',             af:'🇨🇿', dt:'2026-06-12T02:00:00Z' }, // 23:00 BRT
  // 12/jun
  { id:'g02', phase:'grupos', group:'Grupo B', home:'Canadá',               hf:'🇨🇦', away:'Bósnia e Herzegovina',  af:'🇧🇦', dt:'2026-06-12T19:00:00Z' }, // 16:00 BRT
  { id:'g03', phase:'grupos', group:'Grupo D', home:'EUA',                  hf:'🇺🇸', away:'Paraguai',             af:'🇵🇾', dt:'2026-06-13T01:00:00Z' }, // 22:00 BRT
  // 13/jun
  { id:'g05', phase:'grupos', group:'Grupo B', home:'Catar',                hf:'🇶🇦', away:'Suíça',                af:'🇨🇭', dt:'2026-06-13T19:00:00Z' }, // 16:00 BRT
  { id:'g06', phase:'grupos', group:'Grupo C', home:'Brasil',               hf:'🇧🇷', away:'Marrocos',             af:'🇲🇦', dt:'2026-06-13T22:00:00Z' }, // 19:00 BRT
  { id:'g07', phase:'grupos', group:'Grupo C', home:'Haiti',                hf:'🇭🇹', away:'Escócia',              af:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', dt:'2026-06-14T01:00:00Z' }, // 22:00 BRT
  { id:'g08', phase:'grupos', group:'Grupo D', home:'Austrália',            hf:'🇦🇺', away:'Turquia',              af:'🇹🇷', dt:'2026-06-14T04:00:00Z' }, // 01:00 BRT
  // 14/jun
  { id:'g09', phase:'grupos', group:'Grupo E', home:'Alemanha',             hf:'🇩🇪', away:'Curaçao',              af:'🇨🇼', dt:'2026-06-14T17:00:00Z' }, // 14:00 BRT
  { id:'g10', phase:'grupos', group:'Grupo F', home:'Holanda',              hf:'🇳🇱', away:'Japão',                af:'🇯🇵', dt:'2026-06-14T20:00:00Z' }, // 17:00 BRT
  { id:'g11', phase:'grupos', group:'Grupo E', home:'Costa do Marfim',      hf:'🇨🇮', away:'Equador',              af:'🇪🇨', dt:'2026-06-14T23:00:00Z' }, // 20:00 BRT
  { id:'g12', phase:'grupos', group:'Grupo F', home:'Suécia',               hf:'🇸🇪', away:'Tunísia',              af:'🇹🇳', dt:'2026-06-15T02:00:00Z' }, // 23:00 BRT
  // 15/jun
  { id:'g13', phase:'grupos', group:'Grupo H', home:'Espanha',              hf:'🇪🇸', away:'Cabo Verde',           af:'🇨🇻', dt:'2026-06-15T16:00:00Z' }, // 13:00 BRT
  { id:'g14', phase:'grupos', group:'Grupo G', home:'Bélgica',              hf:'🇧🇪', away:'Egito',                af:'🇪🇬', dt:'2026-06-15T22:00:00Z' }, // 19:00 BRT
  { id:'g15', phase:'grupos', group:'Grupo H', home:'Arábia Saudita',       hf:'🇸🇦', away:'Uruguai',              af:'🇺🇾', dt:'2026-06-15T22:00:00Z' }, // 19:00 BRT
  { id:'g16', phase:'grupos', group:'Grupo G', home:'Irã',                  hf:'🇮🇷', away:'Nova Zelândia',        af:'🇳🇿', dt:'2026-06-16T04:00:00Z' }, // 01:00 BRT
  // 16/jun
  { id:'g17', phase:'grupos', group:'Grupo I', home:'França',               hf:'🇫🇷', away:'Senegal',              af:'🇸🇳', dt:'2026-06-16T19:00:00Z' }, // 16:00 BRT
  { id:'g18', phase:'grupos', group:'Grupo I', home:'Iraque',               hf:'🇮🇶', away:'Noruega',              af:'🇳🇴', dt:'2026-06-16T22:00:00Z' }, // 19:00 BRT
  { id:'g19', phase:'grupos', group:'Grupo J', home:'Argentina',            hf:'🇦🇷', away:'Argélia',              af:'🇩🇿', dt:'2026-06-17T01:00:00Z' }, // 22:00 BRT
  { id:'g20', phase:'grupos', group:'Grupo J', home:'Áustria',              hf:'🇦🇹', away:'Jordânia',             af:'🇯🇴', dt:'2026-06-17T04:00:00Z' }, // 01:00 BRT
  // 17/jun
  { id:'g21', phase:'grupos', group:'Grupo K', home:'Portugal',             hf:'🇵🇹', away:'Congo DR',             af:'🇨🇩', dt:'2026-06-17T17:00:00Z' }, // 14:00 BRT
  { id:'g22', phase:'grupos', group:'Grupo L', home:'Inglaterra',           hf:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', away:'Croácia',             af:'🇭🇷', dt:'2026-06-17T20:00:00Z' }, // 17:00 BRT
  { id:'g23', phase:'grupos', group:'Grupo L', home:'Gana',                 hf:'🇬🇭', away:'Panamá',               af:'🇵🇦', dt:'2026-06-17T23:00:00Z' }, // 20:00 BRT
  { id:'g24', phase:'grupos', group:'Grupo K', home:'Uzbequistão',          hf:'🇺🇿', away:'Colômbia',             af:'🇨🇴', dt:'2026-06-18T02:00:00Z' }, // 23:00 BRT
  // ── RODADA 2 ─────────────────────────────────────────────────────────────
  // 18/jun
  { id:'g25', phase:'grupos', group:'Grupo A', home:'Tchéquia',             hf:'🇨🇿', away:'África do Sul',        af:'🇿🇦', dt:'2026-06-18T16:00:00Z' }, // 13:00 BRT
  { id:'g26', phase:'grupos', group:'Grupo B', home:'Suíça',                hf:'🇨🇭', away:'Bósnia e Herzegovina',  af:'🇧🇦', dt:'2026-06-18T19:00:00Z' }, // 16:00 BRT
  { id:'g27', phase:'grupos', group:'Grupo B', home:'Canadá',               hf:'🇨🇦', away:'Catar',                af:'🇶🇦', dt:'2026-06-18T22:00:00Z' }, // 19:00 BRT
  { id:'g28', phase:'grupos', group:'Grupo A', home:'México',               hf:'🇲🇽', away:'Coreia do Sul',        af:'🇰🇷', dt:'2026-06-19T02:00:00Z' }, // 23:00 BRT
  // 19/jun
  { id:'g29', phase:'grupos', group:'Grupo D', home:'EUA',                  hf:'🇺🇸', away:'Austrália',            af:'🇦🇺', dt:'2026-06-19T19:00:00Z' }, // 16:00 BRT
  { id:'g30', phase:'grupos', group:'Grupo C', home:'Escócia',              hf:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', away:'Marrocos',            af:'🇲🇦', dt:'2026-06-19T22:00:00Z' }, // 19:00 BRT
  { id:'g31', phase:'grupos', group:'Grupo C', home:'Brasil',               hf:'🇧🇷', away:'Haiti',                af:'🇭🇹', dt:'2026-06-20T01:00:00Z' }, // 22:00 BRT
  { id:'g32', phase:'grupos', group:'Grupo D', home:'Turquia',              hf:'🇹🇷', away:'Paraguai',             af:'🇵🇾', dt:'2026-06-20T04:00:00Z' }, // 01:00 BRT
  // 20/jun
  { id:'g34', phase:'grupos', group:'Grupo E', home:'Alemanha',             hf:'🇩🇪', away:'Costa do Marfim',      af:'🇨🇮', dt:'2026-06-20T20:00:00Z' }, // 17:00 BRT
  // 21/jun
  { id:'g33', phase:'grupos', group:'Grupo H', home:'Espanha',              hf:'🇪🇸', away:'Arábia Saudita',       af:'🇸🇦', dt:'2026-06-21T16:00:00Z' }, // 13:00 BRT
  { id:'g35', phase:'grupos', group:'Grupo F', home:'Holanda',              hf:'🇳🇱', away:'Suécia',               af:'🇸🇪', dt:'2026-06-21T22:00:00Z' }, // 19:00 BRT
  { id:'g36', phase:'grupos', group:'Grupo G', home:'Bélgica',              hf:'🇧🇪', away:'Irã',                  af:'🇮🇷', dt:'2026-06-21T22:00:00Z' }, // 19:00 BRT
  { id:'g39', phase:'grupos', group:'Grupo H', home:'Uruguai',              hf:'🇺🇾', away:'Cabo Verde',           af:'🇨🇻', dt:'2026-06-21T22:00:00Z' }, // 19:00 BRT
  { id:'g37', phase:'grupos', group:'Grupo E', home:'Equador',              hf:'🇪🇨', away:'Curaçao',              af:'🇨🇼', dt:'2026-06-22T02:00:00Z' }, // 23:00 BRT
  { id:'g38', phase:'grupos', group:'Grupo F', home:'Japão',                hf:'🇯🇵', away:'Tunísia',              af:'🇹🇳', dt:'2026-06-22T04:00:00Z' }, // 01:00 BRT
  { id:'g40', phase:'grupos', group:'Grupo G', home:'Nova Zelândia',        hf:'🇳🇿', away:'Egito',                af:'🇪🇬', dt:'2026-06-22T04:00:00Z' }, // 01:00 BRT
  // 22/jun
  { id:'g41', phase:'grupos', group:'Grupo J', home:'Argentina',            hf:'🇦🇷', away:'Áustria',              af:'🇦🇹', dt:'2026-06-22T18:00:00Z' }, // 15:00 BRT
  { id:'g42', phase:'grupos', group:'Grupo I', home:'França',               hf:'🇫🇷', away:'Iraque',               af:'🇮🇶', dt:'2026-06-22T21:00:00Z' }, // 18:00 BRT
  { id:'g43', phase:'grupos', group:'Grupo I', home:'Noruega',              hf:'🇳🇴', away:'Senegal',              af:'🇸🇳', dt:'2026-06-23T00:00:00Z' }, // 21:00 BRT
  { id:'g44', phase:'grupos', group:'Grupo J', home:'Jordânia',             hf:'🇯🇴', away:'Argélia',              af:'🇩🇿', dt:'2026-06-23T06:00:00Z' }, // 03:00 BRT
  // 23/jun
  { id:'g46', phase:'grupos', group:'Grupo L', home:'Inglaterra',           hf:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', away:'Gana',                af:'🇬🇭', dt:'2026-06-23T20:00:00Z' }, // 17:00 BRT
  { id:'g45', phase:'grupos', group:'Grupo K', home:'Portugal',             hf:'🇵🇹', away:'Uzbequistão',          af:'🇺🇿', dt:'2026-06-24T00:00:00Z' }, // 21:00 BRT
  { id:'g47', phase:'grupos', group:'Grupo L', home:'Panamá',               hf:'🇵🇦', away:'Croácia',              af:'🇭🇷', dt:'2026-06-24T01:00:00Z' }, // 22:00 BRT
  { id:'g48', phase:'grupos', group:'Grupo K', home:'Colômbia',             hf:'🇨🇴', away:'Congo DR',             af:'🇨🇩', dt:'2026-06-24T02:00:00Z' }, // 23:00 BRT
  // ── RODADA 3 ─────────────────────────────────────────────────────────────
  // 24/jun
  { id:'g49', phase:'grupos', group:'Grupo A', home:'Tchéquia',             hf:'🇨🇿', away:'México',               af:'🇲🇽', dt:'2026-06-24T20:00:00Z' }, // 17:00 BRT
  { id:'g50', phase:'grupos', group:'Grupo A', home:'África do Sul',        hf:'🇿🇦', away:'Coreia do Sul',        af:'🇰🇷', dt:'2026-06-24T20:00:00Z' }, // 17:00 BRT
  { id:'g64', phase:'grupos', group:'Grupo B', home:'Bósnia e Herzegovina', hf:'🇧🇦', away:'Catar',                af:'🇶🇦', dt:'2026-06-24T22:00:00Z' }, // 19:00 BRT
  { id:'g65', phase:'grupos', group:'Grupo C', home:'Marrocos',             hf:'🇲🇦', away:'Haiti',                af:'🇭🇹', dt:'2026-06-24T22:00:00Z' }, // 19:00 BRT
  { id:'g66', phase:'grupos', group:'Grupo C', home:'Escócia',              hf:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', away:'Brasil',              af:'🇧🇷', dt:'2026-06-24T22:00:00Z' }, // 19:00 BRT
  { id:'g63', phase:'grupos', group:'Grupo B', home:'Suíça',                hf:'🇨🇭', away:'Canadá',               af:'🇨🇦', dt:'2026-06-25T01:00:00Z' }, // 22:00 BRT
  // 25/jun
  { id:'g55', phase:'grupos', group:'Grupo D', home:'Turquia',              hf:'🇹🇷', away:'EUA',                  af:'🇺🇸', dt:'2026-06-25T19:00:00Z' }, // 16:00 BRT
  { id:'g51', phase:'grupos', group:'Grupo E', home:'Equador',              hf:'🇪🇨', away:'Alemanha',             af:'🇩🇪', dt:'2026-06-25T22:00:00Z' }, // 19:00 BRT
  { id:'g56', phase:'grupos', group:'Grupo D', home:'Paraguai',             hf:'🇵🇾', away:'Austrália',            af:'🇦🇺', dt:'2026-06-25T22:00:00Z' }, // 19:00 BRT
  { id:'g52', phase:'grupos', group:'Grupo E', home:'Curaçao',              hf:'🇨🇼', away:'Costa do Marfim',      af:'🇨🇮', dt:'2026-06-25T23:00:00Z' }, // 20:00 BRT
  { id:'g53', phase:'grupos', group:'Grupo F', home:'Japão',                hf:'🇯🇵', away:'Suécia',               af:'🇸🇪', dt:'2026-06-25T23:00:00Z' }, // 20:00 BRT
  { id:'g54', phase:'grupos', group:'Grupo F', home:'Tunísia',              hf:'🇹🇳', away:'Holanda',              af:'🇳🇱', dt:'2026-06-25T23:00:00Z' }, // 20:00 BRT
  // 26/jun
  { id:'g59', phase:'grupos', group:'Grupo H', home:'Cabo Verde',           hf:'🇨🇻', away:'Arábia Saudita',       af:'🇸🇦', dt:'2026-06-26T22:00:00Z' }, // 19:00 BRT
  { id:'g60', phase:'grupos', group:'Grupo H', home:'Uruguai',              hf:'🇺🇾', away:'Espanha',              af:'🇪🇸', dt:'2026-06-26T22:00:00Z' }, // 19:00 BRT
  { id:'g61', phase:'grupos', group:'Grupo G', home:'Egito',                hf:'🇪🇬', away:'Irã',                  af:'🇮🇷', dt:'2026-06-26T22:00:00Z' }, // 19:00 BRT
  { id:'g62', phase:'grupos', group:'Grupo G', home:'Nova Zelândia',        hf:'🇳🇿', away:'Bélgica',              af:'🇧🇪', dt:'2026-06-26T22:00:00Z' }, // 19:00 BRT
  { id:'g57', phase:'grupos', group:'Grupo I', home:'Noruega',              hf:'🇳🇴', away:'França',               af:'🇫🇷', dt:'2026-06-27T01:00:00Z' }, // 22:00 BRT
  { id:'g58', phase:'grupos', group:'Grupo I', home:'Senegal',              hf:'🇸🇳', away:'Iraque',               af:'🇮🇶', dt:'2026-06-27T01:00:00Z' }, // 22:00 BRT
  // 27/jun
  { id:'g67', phase:'grupos', group:'Grupo J', home:'Argentina',            hf:'🇦🇷', away:'Jordânia',             af:'🇯🇴', dt:'2026-06-27T20:00:00Z' }, // 17:00 BRT
  { id:'g68', phase:'grupos', group:'Grupo J', home:'Áustria',              hf:'🇦🇹', away:'Argélia',              af:'🇩🇿', dt:'2026-06-27T20:00:00Z' }, // 17:00 BRT
  { id:'g70', phase:'grupos', group:'Grupo K', home:'Congo DR',             hf:'🇨🇩', away:'Uzbequistão',          af:'🇺🇿', dt:'2026-06-27T22:00:00Z' }, // 19:00 BRT
  { id:'g69', phase:'grupos', group:'Grupo K', home:'Portugal',             hf:'🇵🇹', away:'Colômbia',             af:'🇨🇴', dt:'2026-06-27T23:00:00Z' }, // 20:00 BRT
  { id:'g71', phase:'grupos', group:'Grupo L', home:'Inglaterra',           hf:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', away:'Panamá',              af:'🇵🇦', dt:'2026-06-28T01:00:00Z' }, // 22:00 BRT
  { id:'g72', phase:'grupos', group:'Grupo L', home:'Croácia',              hf:'🇭🇷', away:'Gana',                 af:'🇬🇭', dt:'2026-06-28T01:00:00Z' }, // 22:00 BRT
  // ── FASE ELIMINATÓRIA ─────────────────────────────────────────────────────
  { id:'m09', phase:'oitavas', group:'Oitavas de final', home:'1º Grupo A', hf:'🔵', away:'2º Grupo B', af:'🔴', dt:'2026-07-01T19:00:00Z' },
  { id:'m10', phase:'oitavas', group:'Oitavas de final', home:'1º Grupo B', hf:'🔵', away:'2º Grupo A', af:'🔴', dt:'2026-07-02T19:00:00Z' },
  { id:'m11', phase:'quartas', group:'Quartas de final', home:'Venc. O1',   hf:'🔵', away:'Venc. O2',   af:'🔴', dt:'2026-07-08T19:00:00Z' },
  { id:'m12', phase:'semi',    group:'Semifinal',        home:'Venc. Q1',   hf:'🔵', away:'Venc. Q2',   af:'🔴', dt:'2026-07-11T19:00:00Z' },
  { id:'m13', phase:'final',   group:'Final',            home:'Semi 1',     hf:'🔵', away:'Semi 2',     af:'🔴', dt:'2026-07-14T19:00:00Z' },
];

// Apply persisted overrides to MATCHES on startup
db.prepare('SELECT * FROM match_overrides').all().forEach(o => {
  const m = MATCHES.find(m => m.id === o.match_id);
  if (m) { m.home = o.home; m.hf = o.hf; m.away = o.away; m.af = o.af; }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashPass(pass) {
  return crypto.createHash('sha256').update(pass + 'bolao2026salt').digest('hex');
}

function calcPts(ph, pa, rh, ra) {
  if (ph === rh && pa === ra) return 10;
  const pD = ph - pa, rD = rh - ra;
  const pW = Math.sign(pD), rW = Math.sign(rD);
  if (pW === rW) { if (pD === rD) return 5; return 3; }
  if (ph === ra && pa === rh) return 1;
  return 0;
}

function authPlayer(name, pass) {
  const player = db.prepare('SELECT * FROM players WHERE name = ?').get(name);
  if (!player) return { ok: false, newPlayer: true };
  if (player.pass_hash !== hashPass(pass)) return { ok: false, newPlayer: false };
  return { ok: true };
}

// ── Rotas de autenticação ─────────────────────────────────────────────────────

app.get('/api/player/:name', (req, res) => {
  const player = db.prepare('SELECT name FROM players WHERE name = ?').get(req.params.name);
  res.json({ exists: !!player });
});

app.post('/api/player/register', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Nome e senha obrigatórios' });
  if (name.trim().length < 2) return res.status(400).json({ error: 'Nome muito curto' });
  if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  const exists = db.prepare('SELECT name FROM players WHERE name = ?').get(name.trim());
  if (exists) return res.status(409).json({ error: 'Nome já cadastrado — use sua senha' });
  db.prepare('INSERT INTO players (name, pass_hash) VALUES (?, ?)').run(name.trim(), hashPass(password));
  res.json({ ok: true });
});

app.post('/api/player/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Dados incompletos' });
  const player = db.prepare('SELECT * FROM players WHERE name = ?').get(name.trim());
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });
  if (player.pass_hash !== hashPass(password)) return res.status(401).json({ error: 'Senha incorreta' });
  res.json({ ok: true, name: player.name });
});

// ── Rotas públicas ────────────────────────────────────────────────────────────
app.get('/api/matches', (req, res) => {
  const resultados = db.prepare('SELECT * FROM resultados').all();
  const resMap = {};
  resultados.forEach(r => resMap[r.match_id] = { h: r.home_score, a: r.away_score });
  res.json({ matches: MATCHES, resultados: resMap, phases: PHASES });
});

app.get('/api/palpites/:player', (req, res) => {
  const rows = db.prepare('SELECT * FROM palpites WHERE player = ?').all(req.params.player);
  const map = {};
  rows.forEach(r => map[r.match_id] = { h: r.home_score, a: r.away_score });
  res.json(map);
});

app.post('/api/palpites', (req, res) => {
  const { player, password, match_id, home_score, away_score } = req.body;
  if (!player || !password || !match_id || home_score == null || away_score == null)
    return res.status(400).json({ error: 'Dados incompletos' });

  const auth = authPlayer(player, password);
  if (!auth.ok) return res.status(401).json({ error: 'Senha incorreta' });

  const match = MATCHES.find(m => m.id === match_id);
  if (!match) return res.status(404).json({ error: 'Jogo não encontrado' });
  if (new Date() >= new Date(match.dt))
    return res.status(403).json({ error: 'Prazo encerrado para este jogo' });

  db.prepare(`
    INSERT INTO palpites (player, match_id, home_score, away_score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player, match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      created_at = datetime('now')
  `).run(player, match_id, home_score, away_score);

  res.json({ ok: true });
});

app.get('/api/ranking', (req, res) => {
  const resultados = db.prepare('SELECT * FROM resultados').all();
  const resMap = {};
  resultados.forEach(r => resMap[r.match_id] = { h: r.home_score, a: r.away_score });
  const players = db.prepare('SELECT name FROM players').all().map(r => r.name);
  const scores = players.map(player => {
    const palpites = db.prepare('SELECT * FROM palpites WHERE player = ?').all(player);
    let pts = 0, exact = 0, total = 0;
    palpites.forEach(p => {
      const r = resMap[p.match_id];
      if (!r) return;
      const match = MATCHES.find(m => m.id === p.match_id);
      const mult = PHASES[match.phase].mult;
      const raw = calcPts(p.home_score, p.away_score, r.h, r.a);
      pts += raw * mult; total++;
      if (raw === 10) exact++;
    });
    return { player, pts, exact, total };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact);
  res.json({ ranking: scores, jogos: MATCHES.length, finalizados: Object.keys(resMap).length });
});

// ── Rotas admin ───────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Senha incorreta' });
  next();
}

app.post('/api/admin/resultado', adminAuth, (req, res) => {
  const { match_id, home_score, away_score } = req.body;
  if (!match_id || home_score == null || away_score == null)
    return res.status(400).json({ error: 'Dados incompletos' });
  db.prepare(`
    INSERT INTO resultados (match_id, home_score, away_score)
    VALUES (?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      updated_at = datetime('now')
  `).run(match_id, home_score, away_score);
  res.json({ ok: true });
});

app.delete('/api/admin/resultado/:match_id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM resultados WHERE match_id = ?').run(req.params.match_id);
  res.json({ ok: true });
});

app.get('/api/admin/export', adminAuth, (req, res) => {
  const resultados = db.prepare('SELECT * FROM resultados').all();
  const resMap = {};
  resultados.forEach(r => resMap[r.match_id] = { h: r.home_score, a: r.away_score });
  const players = db.prepare('SELECT name FROM players').all().map(r => r.name);
  const scores = players.map(player => {
    const palpites = db.prepare('SELECT * FROM palpites WHERE player = ?').all(player);
    let pts = 0, exact = 0, total = 0;
    palpites.forEach(p => {
      const r = resMap[p.match_id];
      if (!r) return;
      const match = MATCHES.find(m => m.id === p.match_id);
      const mult = PHASES[match.phase].mult;
      const raw = calcPts(p.home_score, p.away_score, r.h, r.a);
      pts += raw * mult; total++;
      if (raw === 10) exact++;
    });
    return { player, pts, exact, total };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact);
  const csv = 'Pos,Nome,Pontos,Placares exatos,Jogos apostados\n'
    + scores.map((s, i) => `${i+1},"${s.player}",${s.pts},${s.exact},${s.total}`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ranking_copa2026.csv"');
  res.send(csv);
});

app.post('/api/admin/reset-password', adminAuth, (req, res) => {
  const { name, new_password } = req.body;
  if (!name || !new_password) return res.status(400).json({ error: 'Dados incompletos' });
  const player = db.prepare('SELECT name FROM players WHERE name = ?').get(name);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });
  db.prepare('UPDATE players SET pass_hash = ? WHERE name = ?').run(hashPass(new_password), name);
  res.json({ ok: true });
});

app.get('/api/public/closed-palpites', (req, res) => {
  const now = new Date();
  const closedIds = MATCHES.filter(m => now >= new Date(m.dt)).map(m => m.id);
  if (!closedIds.length) return res.json({});
  const ph = closedIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT player, match_id, home_score AS h, away_score AS a
    FROM palpites WHERE match_id IN (${ph})
    ORDER BY match_id, player
  `).all(...closedIds);
  const grouped = {};
  rows.forEach(p => {
    if (!grouped[p.match_id]) grouped[p.match_id] = [];
    grouped[p.match_id].push({ player: p.player, h: p.h, a: p.a });
  });
  res.json(grouped);
});

app.get('/api/admin/all-palpites', adminAuth, (req, res) => {
  const palpites = db.prepare(`
    SELECT player, match_id, home_score, away_score
    FROM palpites ORDER BY player, match_id
  `).all();
  res.json(palpites);
});

app.get('/api/admin/knockout-matches', adminAuth, (req, res) => {
  const knockout = MATCHES.filter(m => ['oitavas','quartas','semi','final'].includes(m.phase));
  res.json(knockout);
});

app.post('/api/admin/match-teams', adminAuth, (req, res) => {
  const { match_id, home, hf, away, af } = req.body;
  if (!match_id || !home || !away) return res.status(400).json({ error: 'Dados incompletos' });
  const match = MATCHES.find(m => m.id === match_id);
  if (!match) return res.status(404).json({ error: 'Jogo não encontrado' });
  if (!['oitavas','quartas','semi','final'].includes(match.phase))
    return res.status(400).json({ error: 'Apenas fases eliminatórias podem ser editadas' });
  match.home = home;
  match.hf = hf || '🔵';
  match.away = away;
  match.af = af || '🔴';
  db.prepare(`
    INSERT INTO match_overrides (match_id, home, hf, away, af)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      home = excluded.home, hf = excluded.hf,
      away = excluded.away, af = excluded.af,
      updated_at = datetime('now')
  `).run(match_id, match.home, match.hf, match.away, match.af);
  res.json({ ok: true });
});

app.get('/api/admin/players', adminAuth, (req, res) => {
  const players = db.prepare('SELECT name, created_at FROM players ORDER BY created_at').all();
  res.json(players);
});

app.listen(PORT, () => console.log(`✅ Bolão rodando em http://localhost:${PORT}`));
