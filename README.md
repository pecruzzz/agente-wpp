# agente-wpp

Agente para integração com WhatsApp, escrito em TypeScript. Projeto base para enviar/receber mensagens via um provedor (WhatsApp Cloud API, Twilio, Baileys, etc.).

## Requisitos
- Node.js 16+ (recomendado 18+)
- npm ou yarn
- Credenciais do provedor WhatsApp (token/API key)

## Instalação
1. Clone:
   git clone https://github.com/pecruzzz/agente-wpp.git
2. Instale dependências:
   npm install
   # ou
   yarn install

## Configuração
Crie um `.env` na raiz com as variáveis necessárias, por exemplo:

```
PORT=3000
NODE_ENV=development
WPP_PROVIDER=cloud-api
WPP_API_TOKEN=seu_token_aqui
WEBHOOK_PATH=/webhook
```

## Uso
- Desenvolvimento:
  npm run dev
- Build:
  npm run build
- Produção:
  npm start

Endpoints típicos:
- POST /webhook — receber eventos do provedor
- POST /send — enviar mensagem (implemente conforme o provedor)

Exemplo cURL genérico:

curl -X POST "${WPP_API_URL}" \
  -H "Authorization: Bearer ${WPP_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"55119XXXXXXXX","type":"text","text":{"body":"Olá"}}'

## Docker (exemplo rápido)
Dockerfile mínimo:

```
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

## Scripts (sugestão em package.json)
- dev — modo desenvolvimento (ts-node-dev / nodemon)
- build — tsc
- start — node dist
- test — rodar testes

## Boas práticas
- Não comite tokens; use GitHub Secrets ou gerenciador de segredos.
- Verifique assinatura de webhooks.
- Implemente logs e tratamento de erros nas chamadas externas.

## Contato
pecruzzz — https://github.com/pecruzzz/agente-wpp
