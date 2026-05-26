const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@libsql/client');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
app.use(express.json());

// Inicializar clientes
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let db = null;
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'nexus';
const PORT = process.env.PORT || 3000;

// ============ BANCO DE DADOS ============

async function initDatabase() {
  if (!db) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        plan TEXT DEFAULT 'free',
        status TEXT DEFAULT 'active',
        stripe_customer_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        type TEXT,
        amount REAL,
        category TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_phone) REFERENCES users(phone)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        plan TEXT,
        status TEXT,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_phone) REFERENCES users(phone)
      )
    `);

    console.log('✅ Banco de dados inicializado');
  } catch (error) {
    console.error('Erro ao inicializar banco:', error.message);
  }
}

// ============ FUNÇÕES DE BANCO ============

async function getOrCreateUser(phone) {
  if (!db) return { phone, plan: 'free' };
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE phone = ?',
      args: [phone],
    });
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    await db.execute({
      sql: 'INSERT INTO users (phone) VALUES (?)',
      args: [phone],
    });

    return { phone, plan: 'free', status: 'active' };
  } catch (error) {
    console.error('Erro ao buscar/criar usuário:', error.message);
    return { phone, plan: 'free' };
  }
}

async function addTransaction(phone, type, amount, category, description) {
  if (!db) return;
  try {
    await db.execute({
      sql: `INSERT INTO transactions (user_phone, type, amount, category, description) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [phone, type, amount, category, description],
    });
  } catch (error) {
    console.error('Erro ao adicionar transação:', error.message);
  }
}

async function getTransactions(phone, days = 30) {
  if (!db) return [];
  try {
    const result = await db.execute({
      sql: `SELECT * FROM transactions 
            WHERE user_phone = ? AND created_at > datetime('now', '-' || ? || ' days')
            ORDER BY created_at DESC`,
      args: [phone, days],
    });
    return result.rows || [];
  } catch (error) {
    console.error('Erro ao buscar transações:', error.message);
    return [];
  }
}

// ============ IA - CLAUDE ============

async function processMessage(userMessage, phone, userPlan = 'free') {
  try {
    const transactions = await getTransactions(phone, 30);
    const transactionSummary = transactions.length > 0
      ? `Transações recentes: ${transactions.map(t => `${t.type} R$${t.amount} (${t.category})`).join(', ')}`
      : 'Sem transações registradas';

    const systemPrompt = `Você é neXus, um assistente financeiro para WhatsApp. 
Você ajuda usuários a controlar gastos, fazer orçamentos e dar conselhos financeiros.

Plano do usuário: ${userPlan}
${transactionSummary}

Instruções:
1. Se o usuário mencionar um gasto (ex: "gastei 50 no mercado"), extraia: valor, categoria, descrição
2. Se pedir resumo, analise as transações
3. Se pedir conselho financeiro:
   - Plano FREE: sugira upgrade para Pro
   - Plano PRO: dê análise detalhada
4. Sempre seja amigável e em português

Responda em JSON com este formato:
{
  "message": "sua resposta aqui",
  "action": "none|add_transaction|show_summary",
  "transaction": {
    "type": "expense|income",
    "amount": 0,
    "category": "food|transport|entertainment|other",
    "description": "descrição"
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const content = response.content[0].text;
    
    try {
      return JSON.parse(content);
    } catch {
      return {
        message: content,
        action: 'none',
      };
    }
  } catch (error) {
    console.error('Erro ao processar mensagem:', error.message);
    return {
      message: 'Desculpe, tive um problema. Tente novamente.',
      action: 'none',
    };
  }
}

// ============ EVOLUTION API ============

async function sendWhatsAppMessage(phone, message) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.log('Evolution API não configurada');
    return;
  }

  try {
    await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        number: phone,
        text: message,
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
        },
      }
    );
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error.message);
  }
}

// ============ ROTAS ============

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'neXus' });
});

// Webhook WhatsApp
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !data.message) {
      return res.json({ ok: true });
    }

    const message = data.message;
    const phone = message.fromMe ? message.to : message.from;
    const text = message.body || '';

    if (!text || message.fromMe) {
      return res.json({ ok: true });
    }

    // Obter ou criar usuário
    const user = await getOrCreateUser(phone);

    // Processar com IA
    const aiResponse = await processMessage(text, phone, user.plan);

    // Adicionar transação se necessário
    if (aiResponse.action === 'add_transaction' && aiResponse.transaction) {
      await addTransaction(
        phone,
        aiResponse.transaction.type,
        aiResponse.transaction.amount,
        aiResponse.transaction.category,
        aiResponse.transaction.description
      );
    }

    // Enviar resposta
    await sendWhatsAppMessage(phone, aiResponse.message);

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro no webhook WhatsApp:', error.message);
    res.json({ ok: true });
  }
});

// Webhook Stripe
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(400).json({ error: 'Webhook secret não configurado' });
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const phone = session.metadata?.phone;
      const plan = session.metadata?.plan;

      if (phone && plan && db) {
        await db.execute({
          sql: `UPDATE users SET plan = ?, status = 'active' WHERE phone = ?`,
          args: [plan, phone],
        });

        await db.execute({
          sql: `INSERT INTO subscriptions (user_phone, stripe_subscription_id, plan, status) 
                VALUES (?, ?, ?, 'active')`,
          args: [phone, session.subscription, plan],
        });

        await sendWhatsAppMessage(phone, `✅ Bem-vindo ao plano ${plan}! Agora você tem acesso a análises completas.`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      if (db) {
        await db.execute({
          sql: `UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = ?`,
          args: [subscription.id],
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Erro no webhook Stripe:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Página de planos
app.get('/assinar', (req, res) => {
  const priceBasic = process.env.STRIPE_PRICE_BASIC || 'price_basic';
  const pricePro = process.env.STRIPE_PRICE_PRO || 'price_pro';

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>neXus - Planos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 40px 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 40px; color: #333; }
        .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
        .plan { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .plan.pro { border: 2px solid #4CAF50; }
        .plan h2 { margin-bottom: 10px; color: #333; }
        .price { font-size: 32px; font-weight: bold; color: #4CAF50; margin: 20px 0; }
        .features { list-style: none; margin: 20px 0; }
        .features li { padding: 8px 0; color: #666; }
        .features li:before { content: "✓ "; color: #4CAF50; font-weight: bold; }
        button { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 20px; }
        button:hover { background: #45a049; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✦ neXus - Planos</h1>
        <div class="plans">
          <div class="plan">
            <h2>Básico</h2>
            <div class="price">R$ 29,90<span style="font-size: 16px;">/mês</span></div>
            <ul class="features">
              <li>Registro de gastos</li>
              <li>Resumo mensal</li>
              <li>Categorização automática</li>
            </ul>
            <button onclick="checkout('${priceBasic}')">Assinar Básico</button>
          </div>
          <div class="plan pro">
            <h2>Pro</h2>
            <div class="price">R$ 47,90<span style="font-size: 16px;">/mês</span></div>
            <ul class="features">
              <li>Tudo do Básico</li>
              <li>Análise com IA</li>
              <li>Conselhos financeiros</li>
              <li>Orçamento inteligente</li>
            </ul>
            <button onclick="checkout('${pricePro}')">Assinar Pro</button>
          </div>
        </div>
      </div>
      <script src="https://js.stripe.com/v3/"></script>
      <script>
        function checkout(priceId) {
          const phone = prompt('Qual seu número WhatsApp? (com DDD, ex: 11999999999)');
          if (!phone) return;
          
          fetch('/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priceId, phone })
          })
          .then(r => r.json())
          .then(data => {
            if (data.url) window.location.href = data.url;
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Criar sessão de checkout
app.post('/create-checkout', async (req, res) => {
  try {
    const { priceId, phone } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/success`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/assinar`,
      metadata: { phone, plan: priceId.includes('basic') ? 'basic' : 'pro' },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Erro ao criar checkout:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Página de sucesso
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sucesso!</title>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5; }
        .box { background: white; padding: 40px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #4CAF50; }
        p { color: #666; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>✅ Pagamento confirmado!</h1>
        <p>Você receberá uma mensagem no WhatsApp em breve.</p>
        <p>Obrigado por usar neXus!</p>
      </div>
    </body>
    </html>
  `);
});

// Painel admin
app.get('/admin/users', async (req, res) => {
  const adminKey = req.query.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (!db) {
    return res.json({ users: [] });
  }

  try {
    const result = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ users: result.rows || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ INICIAR SERVIDOR ============

async function start() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`✦ neXus rodando em http://localhost:${PORT}`);
    console.log(`📊 Painel admin: http://localhost:${PORT}/admin/users?key=${process.env.ADMIN_KEY || 'admin'}`);
    console.log(`💳 Planos: http://localhost:${PORT}/assinar`);
  });
}

start().catch(console.error);

