# ARCHITECTURE

Aqui eu conto como o projeto funciona, por que fiz cada escolha e o que ficou de fora. O passo a passo pra rodar está no [README](./README.md).

## 1. Sobre mim e sobre o uso de IA

Sou estudante de Análise e Desenvolvimento de Sistemas e esta é a minha primeira oportunidade na área. Nenhuma das tecnologias do desafio eu tinha usado antes (NestJS, MikroORM, Bun, Docker Compose, LocalStack). De quase todas eu já tinha ouvido falar, mas nunca tinha mexido. Com SQL e Postgres eu já tinha uma base.

Usei IA (Claude) o projeto inteiro, como apoio. Pra ganhar tempo, tirar dúvida, sugerir a estrutura e me ajudar a manter o código e os nomes em inglês, já que a empresa é internacional. Fui montando em passos pequenos e, a cada passo, rodei os testes e os curls na minha máquina. Fui entendendo as partes aos poucos, algumas mais que outras, e onde eu travei fui pedindo explicação.

Recebi o desafio no dia 27 e entreguei no dia 30. Com esse tempo, priorizei o dinheiro estar certo, a concorrência e a idempotência. A parte de mensageria (SQS) ficou de fora.

## 2. Como uma transação é processada

No `POST /wagering/transactions`, o service abre uma transação do banco e trava a carteira com `SELECT ... FOR UPDATE`. Depois procura a `Idempotency-Key`. Se já existe com o mesmo conteúdo, devolve o resultado de antes (`replayed: true`). Se existe com conteúdo diferente, dá 409.

Se é nova, grava a transação e aplica o movimento. Se não tem saldo, ela fica `REJECTED` com o motivo. Se deu certo, grava junto o novo saldo, a linha no extrato (ledger), o status e o aviso na outbox, e faz o commit. Se qualquer parte falha, tudo é desfeito.

LOSS só é marcada como processada e não mexe no saldo. REFUND e ROLLBACK procuram a transação que estão revertendo. Se ela ainda não existe, ficam `PENDING_REFERENCE`.

O `domain` (Money, Wallet, WagerTransaction etc.) não depende do NestJS nem do banco, assim dá pra testar as regras sem subir nada.

## 3. Decisões principais

**Dinheiro nunca é number.** Em ponto flutuante `0.1 + 0.2` dá `0.30000000000000004`, e em dinheiro isso vira diferença de centavo. No JSON o valor é texto (`"80.00"`), no código a classe `Money` usa `decimal.js` e só aceita 2 casas, e no banco a coluna é `numeric(19,2)`.

**Concorrência com lock pessimista.** A linha da carteira é lida com `FOR UPDATE`, então duas apostas na mesma carteira passam uma de cada vez e carteiras diferentes não se atrapalham. Escolhi esse e não o otimista (tentar de novo se a `version` mudou) porque é mais simples e não precisa de retry. A coluna `version` sobe a cada movimento, mas quem protege o saldo é o lock. No cenário obrigatório (saldo 100 e duas apostas de 80), uma passa, a outra é rejeitada e o saldo final é 20,00. Conferi também que, sem o `FOR UPDATE`, os testes quebram.

**Idempotência.** A chave é guardada com `UNIQUE`, junto com o hash (SHA-256) do conteúdo. Uma transação rejeitada também fica salva, então repetir o pedido devolve a mesma rejeição. Existe ainda `UNIQUE (provider_id, external_transaction_id)`, então a mesma transação do provider com outra chave dá 409.

**Extrato.** Cada mudança de saldo gera uma linha com direção, valor, saldo antes e saldo depois. O banco garante por constraint e trigger que a conta fecha, que nenhum saldo fica negativo, que não dá pra alterar nem apagar linhas do extrato e que só existe uma linha por carteira e transação. O saldo da carteira sempre bate com a soma do extrato, e isso tem teste.

**Outbox.** Os avisos (WagerTransactionProcessed, Rejected e PendingReference) são gravados na tabela `outbox_messages` na mesma transação do saldo. Assim não existe o caso de o saldo mudar e ninguém ser avisado.

**Estornos.** REFUND só reverte BET, e ROLLBACK reverte BET, WIN ou REFUND. Tem que ser a mesma carteira, jogador, rodada e moeda, com o mesmo valor, e a transação revertida precisa estar `PROCESSED`. Só dá pra reverter uma vez (`ALREADY_REVERSED`). Se o ROLLBACK deixaria o saldo negativo, como reverter um WIN que o jogador já gastou, dá `REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE`. Como a referência tem que ser da mesma carteira, o lock de uma carteira só já protege o estorno.

**Status HTTP.** 201 quando processa (mesmo se for `REJECTED`), 200 no reenvio, 400 pra entrada inválida, 404 quando não existe, 409 pra conflito (carteira repetida, chave reusada com outro conteúdo) e 503 no `/health/ready` quando o banco cai. Os erros de negócio viram status num filtro só (`DomainExceptionFilter`).

## 4. Decisões minhas

Coisas que o enunciado não definia e eu tive que escolher.

- Transação rejeitada responde 201 e não 4xx, porque o pedido foi processado e o resultado de negócio é "não".
- O reenvio devolve o saldo atual da carteira, não o da hora em que foi processado.
- Abrir uma carteira gera uma transação `OPENING` (provider `system`) e a primeira linha do extrato. A API não aceita `OPENING` vindo de fora.
- LOSS pode ter valor zero e não gera linha no extrato, porque o dinheiro já saiu na BET.
- Estorno só vale pra referência `PROCESSED`.
- Os ids são UUID v4 gerados no código.
- O backoff da outbox (já no domínio) começa em 1 segundo, dobra a cada falha e tem teto de 5 minutos.
- O `correlationId` dos eventos é, por enquanto, a própria `Idempotency-Key`.
- Não implementei autenticação. O lugar certo seria um guard na frente dos controllers.
- Os testes de integração usam o Postgres de verdade, e não mock, porque o que eu queria provar (lock, constraints, rollback) só existe no banco real.

## 5. O que ficou de fora

Por falta de tempo preferi caprichar no que vale mais em vez de fazer tudo pela metade.

- **Mensageria inteira.** Não existem as filas (`wager-transactions.fifo` e a DLQ), nem o consumidor de SQS, nem o publisher da outbox (os avisos ficam com `published_at` vazio). A tabela e a classe do inbox existem e têm teste, mas nada usa ainda. O LocalStack está no `docker-compose.yml`, mas sem filas.
- Não existe o worker que reprocessa o `PENDING_REFERENCE` quando a referência chega. Hoje a transação fica esperando.
- Faltam `GET /wallets/:id/ledger`, `POST /wallets/:id/reconciliation` e o encerramento gracioso (SIGTERM).
- O evento `WalletBalanceChanged` existe no domínio, mas não é gravado na outbox.
- Logs em JSON com `correlationId`, métricas, teste de carga e testes com várias instâncias.


## 6. Sobras e testes

O `ObserveModule` e o `AGENTS.md` são sobras do template do `nest new` e, quando a API sobe, aparece um aviso do Observe sobre chave placeholder. Também ficaram no `package.json` pacotes do Vitest e do supertest que eu não uso. Na `Wallet`, `credit` e `debit` ainda são públicos, e o caminho certo é o `applyMovement`.

O `bun test` roda 137 testes. Os de domínio não usam banco. Os de integração usam o Postgres do Docker Compose e cobrem a disputa pelo saldo, as 50 requisições iguais em paralelo, o saldo igual à soma do extrato, os estornos e a atomicidade (um erro no meio não deixa nada pela metade).
