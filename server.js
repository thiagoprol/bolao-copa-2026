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

const MATCHES = [
  { id:'m01', phase:'grupos',  group:'Grupo A', home:'Brasil',      hf:'🇧🇷', away:'México',        af:'🇲🇽', dt:'2026-06-11T12:00:00' },
  { id:'m02', phase:'grupos',  group:'Grupo A', home:'Argentina',   hf:'🇦🇷', away:'Marrocos',      af:'🇲🇦', dt:'2026-06-11T15:00:00' },
  { id:'m03', phase:'grupos',  group:'Grupo B', home:'Alemanha',    hf:'🇩🇪', away:'Japão',         af:'🇯🇵', dt:'2026-06-12T12:00:00' },
  { id:'m04', phase:'grupos',  group:'Grupo B', home:'França',      hf:'🇫🇷', away:'Espanha',       af:'🇪🇸', dt:'2026-06-12T15:00:00' },
  { id:'m05', phase:'grupos',  group:'Grupo C', home:'Portugal',    hf:'🇵🇹', away:'Inglaterra',    af:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', dt:'2026-06-13T12:00:00' },
  { id:'m06', phase:'grupos',  group:'Grupo C', home:'Holanda',     hf:'🇳🇱', away:'Coreia do Sul', af:'🇰🇷', dt:'2026-06-13T15:00:00' },
  { id:'m07', phase:'grupos',  group:'Grupo D', home:'EUA',         hf:'🇺🇸', away:'Croácia',       af:'🇭🇷', dt:'2026-06-14T12:00:00' },
  { id:'m08', phase:'grupos',  group:'Grupo D', home:'Itália',      hf:'🇮🇹', away:'Uruguai',       af:'🇺🇾', dt:'2026-06-14T15:00:00' },
  { id:'m09', phase:'oitavas', group:'Oitavas de final', home:'1º Grupo A', hf:'🔵', away:'2º Grupo B', af:'🔴', dt:'2026-07-01T16:00:00' },
  { id:'m10', phase:'oitavas', group:'Oitavas de final', home:'1º Grupo B', hf:'🔵', away:'2º Grupo A', af:'🔴', dt:'2026-07-02T16:00:00' },
  { id:'m11', phase:'quartas', group:'Quartas de final', home:'Venc. O1',   hf:'🔵', away:'Venc. O2',   af:'🔴', dt:'2026-07-08T16:00:00' },
  { id:'m12', phase:'semi',    group:'Semifinal',        home:'Venc. Q1',   hf:'🔵', away:'Venc. Q2',   af:'🔴', dt:'2026-07-11T16:00:00' },
  { id:'m13', phase:'final',   group:'Final',            home:'Semi 1',     hf:'🔵', away:'Semi 2',     af:'🔴', dt:'2026-07-14T16:00:00' },
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

// Verifica se jogador existe
app.get('/api/player/:name', (req, res) => {
  const player = db.prepare('SELECT name FROM players WHERE name = ?').get(req.params.name);
  res.json({ exists: !!player });
});

// Registrar novo jogador
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

// Login
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

// Salvar palpite — requer autenticação
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
  }).sort((a, b) => b.pts - a.pts);
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
  }).sort((a, b) => b.pts - a.pts);
  const csv = 'Pos,Nome,Pontos,Placares exatos,Jogos apostados\n'
    + scores.map((s, i) => `${i+1},"${s.player}",${s.pts},${s.exact},${s.total}`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ranking_copa2026.csv"');
  res.send(csv);
});

// Admin: resetar senha de um jogador
app.post('/api/admin/reset-password', adminAuth, (req, res) => {
  const { name, new_password } = req.body;
  if (!name || !new_password) return res.status(400).json({ error: 'Dados incompletos' });
  const player = db.prepare('SELECT name FROM players WHERE name = ?').get(name);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });
  db.prepare('UPDATE players SET pass_hash = ? WHERE name = ?').run(hashPass(new_password), name);
  res.json({ ok: true });
});

// Público: palpites de todos para jogos já encerrados (agrupados por match_id)
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

// Admin: todos os palpites de todos os jogadores
app.get('/api/admin/all-palpites', adminAuth, (req, res) => {
  const palpites = db.prepare(`
    SELECT player, match_id, home_score, away_score
    FROM palpites ORDER BY player, match_id
  `).all();
  res.json(palpites);
});

// Admin: listar jogos eliminatórios
app.get('/api/admin/knockout-matches', adminAuth, (req, res) => {
  const knockout = MATCHES.filter(m => ['oitavas','quartas','semi','final'].includes(m.phase));
  res.json(knockout);
});

// Admin: editar times de um jogo eliminatório
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

// Admin: listar jogadores
app.get('/api/admin/players', adminAuth, (req, res) => {
  const players = db.prepare('SELECT name, created_at FROM players ORDER BY created_at').all();
  res.json(players);
});

app.listen(PORT, () => console.log(`✅ Bolão rodando em http://localhost:${PORT}`));
