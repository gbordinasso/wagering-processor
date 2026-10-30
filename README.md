# Wagering Processor

API em NestJS com PostgreSQL pra processar transações de aposta (BET, WIN, LOSS, REFUND e ROLLBACK). O saldo da carteira nunca fica negativo e a mesma transação nunca é processada duas vezes, mesmo com várias requisições ao mesmo tempo.

Pra entender as decisões e ver o que ficou de fora, leia o [ARCHITECTURE.md](./ARCHITECTURE.md).

## O que precisa ter instalado

- [Bun](https://bun.sh) (usei a 1.4.4)
- Docker com Docker Compose

## Como rodar

Na pasta do projeto:

```bash
# 1. instalar as dependências
bun install

# 2. criar o arquivo de configuração (os valores padrão já funcionam)
cp .env.example .env        # no Windows (cmd): copy .env.example .env

# 3. subir o Postgres e o LocalStack
docker compose up -d

# 4. criar as tabelas
bunx --bun mikro-orm migration:up

# 5. iniciar a API (porta 3000)
bun run start
```

Se tudo deu certo, `http://localhost:3000/health/ready` responde `{"status":"ok","checks":{"database":"up"}}`.

O LocalStack sobe junto, mas ainda não é usado, porque a parte de filas (SQS) não foi implementada. Está explicado no ARCHITECTURE.md.

## Testes

Precisa do Postgres no ar e das migrations aplicadas (passos 2, 3 e 4 acima).

```bash
bun test
```

São 137 testes. Os de integração usam o Postgres de verdade, então não rodam sem o Docker.

## Migrations

```bash
bunx --bun mikro-orm migration:up      # aplica
bunx --bun mikro-orm migration:down    # desfaz a última
```

O `--bun` é importante, sem ele o comando não acha o arquivo de configuração em TypeScript.

## Endpoints

```
POST /wallets
GET  /wallets/:walletId
POST /wagering/transactions               (precisa do header Idempotency-Key)
GET  /wagering/transactions/:transactionId
GET  /wagering/transactions?providerId=...&externalTransactionId=...
GET  /health/live
GET  /health/ready
```

## Exemplos

Os exemplos são pra terminal bash (Linux, Mac ou Git Bash). No `cmd` do Windows as aspas mudam.

Criar uma carteira com saldo 100:

```bash
curl -X POST http://localhost:3000/wallets \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b","initialBalance":{"amount":"100.00","currency":"BRL"}}'
```

A resposta traz o `id` da carteira. Use ele no lugar de `WALLET_ID` abaixo.

Apostar 80:

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: bet-1' \
  -d '{"providerId":"provider-a","externalTransactionId":"ext-1","walletId":"WALLET_ID","playerId":"3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b","roundId":"round-1","gameId":"game-1","kind":"BET","money":{"amount":"80.00","currency":"BRL"}}'
```

Deve voltar `"status":"PROCESSED"` e saldo 20.00. Mandar a mesma chave de novo devolve o mesmo resultado com `"replayed":true`, sem debitar outra vez.

Uma segunda aposta de 80 com outra chave e outro `externalTransactionId` fica `REJECTED` com `INSUFFICIENT_FUNDS`:

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: bet-2' \
  -d '{"providerId":"provider-a","externalTransactionId":"ext-2","walletId":"WALLET_ID","playerId":"3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b","roundId":"round-1","gameId":"game-1","kind":"BET","money":{"amount":"80.00","currency":"BRL"}}'
```

Consultar a carteira:

```bash
curl http://localhost:3000/wallets/WALLET_ID
```

Pra estornar, mande `"kind":"REFUND"` (ou `"ROLLBACK"`) com `"referenceExternalTransactionId":"ext-1"`, o mesmo `roundId` e o mesmo valor da transação original.

## Parar tudo

```bash
docker compose down
```

Isso para os containers. Os dados do banco ficam guardados no volume. Pra apagar também os dados, use `docker compose down -v`.
