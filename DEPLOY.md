# ✦ neXus — Deploy gratuito em 30 minutos

## O que você vai usar (tudo grátis)

| Serviço | Para quê | Custo |
|---|---|---|
| **Railway** | Rodar o servidor Node.js | Grátis (500h/mês) |
| **Turso** | Banco de dados na nuvem | Grátis (9GB) |
| **GitHub** | Guardar o código | Grátis |
| **Stripe** | Pagamentos | Grátis (cobra só quando receber) |

---

## PASSO 1 — Subir o código no GitHub

1. Acesse **github.com** e crie uma conta se não tiver
2. Clique em **New repository** → nome: `nexus-financeiro` → **Create**
3. No seu computador, dentro da pasta `nexus2`, abra o terminal:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/nexus-financeiro.git
git push -u origin main
```

Se não tiver Git instalado: baixe em **git-scm.com** e instale.

---

## PASSO 2 — Criar o banco no Turso (grátis)

1. Acesse **turso.tech** → Sign up com GitHub
2. Clique em **Create database**
3. Nome: `nexus` → região: `South America (GRU)` → **Create**
4. Clique no banco criado → **Generate Token**
5. Copie e guarde:
   - **Database URL** → começa com `libsql://...`
   - **Auth Token** → string longa

---

## PASSO 3 — Criar conta no Stripe

1. Acesse **stripe.com** → Create account
2. Preencha os dados (pode começar em modo teste)
3. Vá em **Developers > API Keys** → copie a **Secret key** (`sk_test_...` por enquanto)
4. Vá em **Products > Add product**:
   - Crie **"neXus Básico"** → R$ 29,90 → recorrente mensal → salve → copie o **Price ID**
   - Crie **"neXus Pro"** → R$ 47,90 → recorrente mensal → salve → copie o **Price ID**

---

## PASSO 4 — Deploy no Railway

1. Acesse **railway.app** → Login with GitHub
2. Clique em **New Project** → **Deploy from GitHub repo**
3. Selecione o repositório `nexus-financeiro`
4. Railway detecta Node.js automaticamente e faz o deploy

### Configurar as variáveis de ambiente

Dentro do projeto no Railway → aba **Variables** → clique em **Raw Editor** e cole:

```
ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
TURSO_DATABASE_URL=libsql://seu-banco.turso.io
TURSO_AUTH_TOKEN=seu-token-turso-aqui
STRIPE_SECRET_KEY=sk_test_sua-chave-aqui
STRIPE_PRICE_BASIC=price_seu-price-basico
STRIPE_PRICE_PRO=price_seu-price-pro
STRIPE_WEBHOOK_SECRET=deixe-em-branco-por-enquanto
EVOLUTION_API_URL=deixe-em-branco-por-enquanto
EVOLUTION_API_KEY=deixe-em-branco-por-enquanto
EVOLUTION_INSTANCE=nexus
APP_URL=deixe-em-branco-por-enquanto
ADMIN_KEY=minha-senha-admin-123
PORT=3000
```

5. Clique em **Deploy** → aguarde 2 minutos
6. Vá em **Settings > Networking > Generate Domain** → copie a URL (ex: `nexus-financeiro.up.railway.app`)
7. Volte em **Variables** e preencha: `APP_URL=https://nexus-financeiro.up.railway.app`
8. Clique em **Deploy** novamente

### Testar se subiu

Abra no navegador: `https://nexus-financeiro.up.railway.app`

Deve aparecer: `{"status":"ok","app":"neXus"}` ✅

---

## PASSO 5 — Configurar Webhook do Stripe

1. No Dashboard Stripe → **Developers > Webhooks** → **Add endpoint**
2. URL: `https://nexus-financeiro.up.railway.app/webhook/stripe`
3. Eventos: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
4. **Add endpoint** → copie o **Signing secret** (`whsec_...`)
5. No Railway → Variables → atualize: `STRIPE_WEBHOOK_SECRET=whsec_seu-secret`
6. Clique em **Deploy**

---

## PASSO 6 — Instalar a Evolution API (WhatsApp)

A Evolution API também roda grátis no Railway em um projeto separado.

1. No Railway → **New Project** → **Deploy from template**
2. Pesquise `Evolution API` → selecione o template oficial
3. Configure as variáveis:
```
AUTHENTICATION_API_KEY=nexus-evolution-chave-123
SERVER_PORT=8080
```
4. Gere o domínio → copie (ex: `evolution-nexus.up.railway.app`)
5. Volte no projeto do neXus → atualize as variáveis:
```
EVOLUTION_API_URL=https://evolution-nexus.up.railway.app
EVOLUTION_API_KEY=nexus-evolution-chave-123
```
6. **Deploy**

### Conectar o WhatsApp

Abra no navegador:

```
https://evolution-nexus.up.railway.app/instance/create?instanceName=nexus&apikey=nexus-evolution-chave-123
```

Depois acesse:

```
https://evolution-nexus.up.railway.app/instance/connect/nexus?apikey=nexus-evolution-chave-123
```

Vai aparecer o QR Code. Escaneie pelo WhatsApp do celular:
> **WhatsApp → Configurações → Aparelhos conectados → Conectar → Escanear QR**

### Configurar o Webhook do WhatsApp

```
https://evolution-nexus.up.railway.app/webhook/set/nexus?apikey=nexus-evolution-chave-123
```

Envie uma requisição POST com:
```json
{
  "url": "https://nexus-financeiro.up.railway.app/webhook/whatsapp",
  "webhook_by_events": false,
  "events": ["MESSAGES_UPSERT"]
}
```

Pode usar o **Postman** (grátis) ou o **Insomnia** para isso.

---

## PASSO 7 — Testar tudo

1. Mande uma mensagem para o número conectado: **"oi"**
2. O neXus deve responder em segundos ✅
3. Mande: **"gastei 50 no mercado"** → deve registrar
4. Mande: **"resumo do mês"** → deve mostrar o saldo
5. Acesse: `https://nexus-financeiro.up.railway.app/assinar` → página de planos ✅
6. Admin: `https://nexus-financeiro.up.railway.app/admin/users?key=minha-senha-admin-123` ✅

---

## ✅ Checklist

- [ ] Código no GitHub
- [ ] Banco Turso criado e URL + token copiados
- [ ] Dois produtos criados no Stripe
- [ ] neXus rodando no Railway (retorna `{"status":"ok"}`)
- [ ] Webhook do Stripe configurado
- [ ] Evolution API no Railway
- [ ] WhatsApp conectado via QR Code
- [ ] Webhook do WhatsApp configurado
- [ ] Bot respondendo mensagens

---

## Quando começar a receber clientes

- Ative o Stripe em modo **live** (produção) nas configurações da conta
- Troque as chaves `sk_test_` por `sk_live_` nas variáveis do Railway
- Mude também os Price IDs para os produtos em produção

---

## Limites do plano gratuito

| Serviço | Limite grátis | Quando pagar |
|---|---|---|
| Railway | 500h/mês de CPU | ~R$ 25/mês quando ultrapassar |
| Turso | 500 conexões/dia, 9GB | Só com muitos usuários |
| Anthropic | Sem free tier, cobra por uso | ~R$ 0,01 por conversa |
| Stripe | Grátis | 3,4% + R$0,40 por transação |

Com até ~50 usuários ativos o Railway grátis aguenta tranquilo.

---

*neXus — Seu dinheiro, sob controle total.*
