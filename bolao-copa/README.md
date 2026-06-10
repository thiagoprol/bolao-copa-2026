# 🏆 Bolão Copa 2026

App de bolão da Copa do Mundo para empresas, com backend Node.js + SQLite.

---

## 🚀 Como subir no Replit

### 1. Criar o projeto
1. Acesse [replit.com](https://replit.com) e crie uma conta gratuita
2. Clique em **"+ Create Repl"**
3. Escolha **"Import from ZIP"** e suba o arquivo `bolao-copa.zip`
   - Ou escolha **Node.js** e copie os arquivos manualmente

### 2. Configurar a senha do admin
No Replit, vá em **"Secrets"** (ícone de cadeado no menu lateral) e adicione:
```
Key:   ADMIN_PASSWORD
Value: suaSenhaAqui
```
Se não configurar, a senha padrão será `copa2026`.

### 3. Rodar
Clique em **"Run"** — o Replit vai instalar as dependências e iniciar o servidor.  
Seu app estará disponível em um link do tipo: `https://bolao-copa-2026.seuusuario.repl.co`

### 4. Compartilhar
Envie o link para os funcionários. Cada um acessa pelo navegador, digita o nome e faz os palpites.

---

## 📁 Estrutura do projeto

```
bolao-copa/
├── server.js          # Backend Express + SQLite
├── package.json       # Dependências
├── .replit            # Configuração do Replit
├── db/                # Banco de dados (criado automaticamente)
│   └── bolao.db
└── public/
    └── index.html     # Frontend completo
```

---

## 🔧 Adicionar mais jogos

Edite o array `MATCHES` em `server.js`. Cada jogo segue o formato:

```js
{
  id: 'm01',             // ID único
  phase: 'grupos',       // grupos | oitavas | quartas | semi | final
  group: 'Grupo A',      // Nome do grupo/fase para exibição
  home: 'Brasil',        // Time da casa
  hf: '🇧🇷',            // Emoji da bandeira
  away: 'México',        // Time visitante
  af: '🇲🇽',            // Emoji da bandeira
  dt: '2026-06-11T12:00:00'  // Data e hora de início (ISO 8601)
}
```

---

## 🏅 Sistema de pontuação

| Resultado              | Pontos base |
|------------------------|-------------|
| Placar exato           | 10 pts      |
| Vencedor + saldo igual | 5 pts       |
| Vencedor correto       | 3 pts       |
| Placar invertido       | 1 pt        |
| Errou                  | 0 pts       |

Multiplicadores por fase: Grupos ×1 · Oitavas ×2 · Quartas ×3 · Semi ×4 · Final ×5

---

## 🔒 API Admin

Todas as rotas admin exigem o header `x-admin-password`.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/admin/resultado` | Registrar resultado de um jogo |
| DELETE | `/api/admin/resultado/:id` | Remover resultado |
| GET | `/api/admin/export` | Exportar ranking em CSV |
