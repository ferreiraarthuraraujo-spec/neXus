# ✦ neXus — Guia de Instalação Completo

## O que você vai precisar

| Item | Onde pegar | Custo estimado |
|------|-----------|----------------|
| VPS | Hostinger, DigitalOcean, Contabo | ~R$ 25–60/mês |
| Domínio | Registro.br ou Hostinger | ~R$ 40/ano |
| Conta Anthropic | console.anthropic.com | Pay-as-you-go |
| Conta Stripe | stripe.com | 3,4% + R$0,40/transação |
| Evolution API | Self-hosted no mesmo servidor | Grátis |

---

## PASSO 1 — Contratar a VPS

1. Acesse **hostinger.com.br** → VPS → plano mínimo 2GB RAM, Ubuntu 22.04
2. Anote o **IP público** (ex: `123.456.78.90`)
3. Conecte via terminal:
   ```bash
   ssh root@123.456.78.90
   ```

---

## PASSO 2 — Instalar Node.js, PM2 e Nginx

```bash
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2 (mantém o bot rodando 24/7)
npm install -g pm2

# Nginx
apt install -y nginx

# Confirma
node -v    # v20.x.x
npm -v     # 10.x.x
```

---

## PASSO 3 — Enviar o código para a VPS

No **seu computador**, dentro da pasta `nexus`:

```bash
zip -r nexus.zip . -x "node_modules/*" -x ".env"
scp nexus.zip root@123.456.78.90:/root/
```

Na **VPS**:

```bash
cd /root
unzip nexus.zip -d nexus
cd nexus
npm install
```

---

## PASSO 4 — Criar o arquivo .env

```bash
cp .env.example .env
nano .env
```

### 4.1 — Chave da Anthropic
- Acesse **console.anthropic.com** → API Keys → Create Key
- Cole em `ANTHROPIC_API_KEY=`

### 4.2 — Stripe (dois produtos)

1. Acesse **dashboard.stripe.com**
2. Em **Developers > API Keys** copie a Secret Key → `STRIPE_SECRET_KEY=`
3. Vá em **Products > Add product**:
   - Crie **"neXus Básico"** → preço recorrente R$ 29,90/mês
   - Copie o Price ID (começa com `price_`) → `STRIPE_PRICE_BASIC=`
   - Crie **"neXus Pro"** → preço recorrente R$ 47,90/mês
   - Copie o Price ID → `STRIPE_PRICE_PRO=`
4. O `STRIPE_WEBHOOK_SECRET` será preenchido no Passo 8

### 4.3 — APP_URL
```
APP_URL=https://seudominio.com.br
```

### 4.4 — ADMIN_KEY
Uma senha sua para acessar o painel de usuários:
```
ADMIN_KEY=minha-senha-secreta-aqui
```

Salve: `Ctrl+X` → `Y` → `Enter`

---

## PASSO 5 — Instalar Docker e Evolution API (WhatsApp)

```bash
apt install -y docker.io docker-compose
systemctl start docker && systemctl enable docker

mkdir -p /root/evolution && cd /root/evolution

cat > docker-compose.yml << 'EOF'
version: "3.7"
services:
  evolution-api:
    image: atendai/evolution-api:latest
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_PORT=8080
      - AUTHENTICATION_API_KEY=nexus-chave-evolution-123
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
volumes:
  evolution_instances:
  evolution_store:
EOF

docker-compose up -d
sleep 8 && docker-compose logs --tail=15
```

Atualize o `.env` do neXus:
```
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=nexus-chave-evolution-123
EVOLUTION_INSTANCE=nexus
```

---

## PASSO 6 — Conectar o WhatsApp

```bash
# Cria a instância
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: nexus-chave-evolution-123" \
  -d '{"instanceName":"nexus","qrcode":true}'
```

Abra no navegador:
```
http://123.456.78.90:8080/instance/connect/nexus?apikey=nexus-chave-evolution-123
```

Vai aparecer um **QR Code**. No celular:
> WhatsApp → Configurações → Aparelhos conectados → Conectar → Escanear QR Code ✅

---

## PASSO 7 — Configurar domínio e HTTPS

### DNS (no painel do seu domínio)
```
Tipo: A  |  Nome: @  |  Valor: 123.456.78.90
```

### Nginx como proxy reverso

```bash
cat > /etc/nginx/sites-available/nexus << 'EOF'
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/nexus /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### HTTPS grátis

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

Siga as instruções. Renovação é automática. ✅

---

## PASSO 8 — Configurar Webhook do Stripe

1. No Dashboard Stripe → **Developers > Webhooks** → "Add endpoint"
2. URL: `https://seudominio.com.br/webhook/stripe`
3. Eventos:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copie o **Signing secret** (`whsec_xxx`) → cole no `.env`: `STRIPE_WEBHOOK_SECRET=`

---

## PASSO 9 — Configurar Webhook do WhatsApp

```bash
curl -X POST http://localhost:8080/webhook/set/nexus \
  -H "Content-Type: application/json" \
  -H "apikey: nexus-chave-evolution-123" \
  -d '{
    "url": "https://seudominio.com.br/webhook/whatsapp",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## PASSO 10 — Iniciar o neXus com PM2

```bash
cd /root/nexus
pm2 start src/server.js --name nexus
pm2 save
pm2 startup   # copie e cole o comando que aparecer
```

Verifique:
```bash
pm2 status
pm2 logs nexus
```

---

## ✅ Checklist final

- [ ] VPS Ubuntu 22.04 ativa
- [ ] Node.js 20 instalado
- [ ] `.env` preenchido com todas as chaves
- [ ] Evolution API rodando (`docker ps`)
- [ ] WhatsApp conectado via QR Code
- [ ] Webhook WA apontando para sua URL
- [ ] Dois produtos criados no Stripe (Básico e Pro)
- [ ] Webhook do Stripe configurado
- [ ] Domínio com HTTPS ativo
- [ ] neXus rodando com PM2

---

## Testando

1. Mande para o número conectado: **"gastei 50 no mercado"** → deve responder em segundos
2. Mande: **"me dá um conselho financeiro"** → no trial (Pro) ele analisa; no Básico ele sugere o upgrade
3. Acesse `https://seudominio.com.br/assinar` → página de planos deve aparecer
4. Admin: `https://seudominio.com.br/admin/users?key=SUA_ADMIN_KEY`

---

## Comandos do dia a dia

```bash
pm2 logs nexus              # logs em tempo real
pm2 restart nexus           # reiniciar após mudanças
pm2 stop nexus              # parar

# Ver usuários no banco
sqlite3 /root/nexus/nexus.db "SELECT phone, plan, status FROM users;"

# Ver transações recentes
sqlite3 /root/nexus/nexus.db \
  "SELECT user_phone, type, amount, category FROM transactions ORDER BY created_at DESC LIMIT 20;"

# Ver receita ativa
sqlite3 /root/nexus/nexus.db \
  "SELECT plan, COUNT(*) as clientes FROM users WHERE status='active' GROUP BY plan;"
```

---

## Projeção financeira

| Cenário | Básico | Pro | Receita/mês |
|---------|--------|-----|-------------|
| Lançamento | 50 | 20 | R$ 2.453 |
| 3 meses | 150 | 80 | R$ 8.317 |
| 6 meses | 300 | 200 | R$ 18.550 |

*Valores brutos antes da taxa Stripe (~3,4%).*

---

*neXus — Seu dinheiro, sob controle total.*
