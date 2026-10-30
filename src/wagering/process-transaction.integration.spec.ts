import { afterAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { FailureCode } from '../domain/failure-code.js';
import {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../domain/wager-transaction-enums.js';
import config from '../mikro-orm.config.js';
import { CreateWalletService } from '../wallets/create-wallet.service.js';
import { LedgerRepository } from '../wallets/ledger.repository.js';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { WalletRepository } from '../wallets/wallet.repository.js';
import {
    ProcessTransactionService,
    type ProcessTransactionInput,
} from './process-transaction.service.js';
import { WagerTransactionRepository } from './wager-transaction.repository.js';


const orm = await MikroORM.init(config);
const createWallet = new CreateWalletService(orm.em);
const service = new ProcessTransactionService(
    orm.em,
    new WalletRepository(),
    new WagerTransactionRepository(),
    new LedgerRepository(),
    new OutboxRepository(),
);

afterAll(async () => {
    await orm.close();
});

const newWallet = (amount: string) =>
    createWallet.execute({
        playerId: crypto.randomUUID(),
        initialBalance: { amount, currency: 'BRL' },
    });

const makeInput = (
    walletId: string,
    playerId: string,
    amount: string,
    overrides: Partial<ProcessTransactionInput> = {},
): ProcessTransactionInput => {
    const key = overrides.idempotencyKey ?? `k-${crypto.randomUUID()}`;
    return {
        idempotencyKey: key,
        providerId: 'provider-a',
        externalTransactionId: key,
        walletId,
        playerId,
        roundId: 'r1',
        gameId: 'g1',
        kind: WagerTransactionKind.Bet,
        money: { amount, currency: 'BRL' },
        ...overrides,
    };
};

const balanceOf = async (walletId: string): Promise<string | undefined> => {
    const rows = await orm.em.execute<{ balance: string }[]>(
        'select balance from wallets where id = ?',
        [walletId],
    );
    return rows[0]?.balance;
};

const ledgerCount = async (walletId: string): Promise<number> => {
    const rows = await orm.em.execute<{ total: number }[]>(
        'select count(*)::int as total from wallet_ledger_entries where wallet_id = ?',
        [walletId],
    );
    return Number(rows[0]?.total);
};

describe('ProcessTransactionService (concorrência, com banco real)', () => {
    it('duas apostas de 80 disputando saldo 100: uma passa e a outra é rejeitada', async () => {
        const wallet = await newWallet('100.00');

        const results = await Promise.all([
            service.execute(makeInput(wallet.id, wallet.playerId, '80.00')),
            service.execute(makeInput(wallet.id, wallet.playerId, '80.00')),
        ]);

        const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
        const rejected = results.filter((r) => r.status === WagerTransactionStatus.Rejected);
        expect(processed).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.failureCode).toBe(FailureCode.InsufficientFunds);
        expect(await balanceOf(wallet.id)).toBe('20.00');
    });

    it('50 requisições iguais em paralelo debitam uma única vez', async () => {
        const wallet = await newWallet('100.00');
        const input = makeInput(wallet.id, wallet.playerId, '25.00');

        const results = await Promise.all(
            Array.from({ length: 50 }, () => service.execute(input)),
        );

        expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
        expect(results.filter((r) => !r.replayed)).toHaveLength(1);
        expect(await balanceOf(wallet.id)).toBe('75.00');
        expect(await ledgerCount(wallet.id)).toBe(2);
    }, 30000);

    it('saldo da carteira == soma do extrato, mesmo com muitas operações em paralelo', async () => {
        const wallet = await newWallet('100.00');
        const operations = [
            ...Array.from({ length: 10 }, () => makeInput(wallet.id, wallet.playerId, '15.00')),
            ...Array.from({ length: 5 }, () =>
                makeInput(wallet.id, wallet.playerId, '10.00', {
                    kind: WagerTransactionKind.Win,
                }),
            ),
        ];

        await Promise.all(operations.map((operation) => service.execute(operation)));

        const rows = await orm.em.execute<{ balance: string; ledger_total: string }[]>(
            `select w.balance as balance,
                    coalesce(sum(case when l.direction = 'CREDIT' then l.amount else -l.amount end), 0)::numeric(19,2) as ledger_total
               from wallets w
               left join wallet_ledger_entries l on l.wallet_id = w.id
              where w.id = ?
              group by w.balance`,
            [wallet.id],
        );
        const row = rows[0];
        expect(row?.balance).toBe(row?.ledger_total);
        expect(row?.balance.startsWith('-')).toBe(false);
    }, 30000);
});