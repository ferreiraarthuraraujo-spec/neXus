# neXus — Assistente financeiro pelo WhatsApp

Site de vendas + checkout + backend prontos para deploy na Vercel.

## Estrutura

```
public/
  index.html      → site principal (nexus.vercel.app)
  checkout.html   → página de assinatura
  sucesso.html    → confirmação de pagamento

api/
  criar-checkout.js       → cria sessão de pagamento
  admin.js                → painel de usuários
  webhook/
    whatsapp.js           → recebe mensagens do WhatsApp
    stripe.js             → processa eventos de pagamento

lib/
  db.js   → banco de dados (Turso)
  ai.js   → lógica do Claude AI
```

## Deploy na Vercel

1. Faça fork ou importe este repositório na Vercel
2. Em **Settings > Environment Variables**, adicione as variáveis do `.env.example`
3. Deploy automático

## Variáveis necessárias

Veja o arquivo `.env.example` para a lista completa.

## Planos

| Plano | Preço | Recursos |
|-------|-------|----------|
| Básico | R$ 29,90/mês | Registro + resumo |
| Pro | R$ 47,90/mês | Básico + Consultor Hugo |
