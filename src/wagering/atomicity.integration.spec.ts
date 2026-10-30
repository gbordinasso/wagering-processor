import { afterAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionKind, WagerTransactionStatus } from '../domain/wager-transaction-enums.js';
import config from '../mikro-orm.config.js';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { CreateWalletService } from '../wallets/create-wallet.service.js';
import { LedgerRepository } from '../wallets/ledger.repository.js';
import { WalletRepository } from '../wallets/wallet.repository.js';
import {
    ProcessTransactionService,
    type ProcessTransactionInput,
} from './process-transaction.service.js';
import { WagerTransactionRepository } from './wager-transaction.repository.js';

const orm = await MikroORM.init(config);
const createWallet = new CreateWalletService(orm.em);

const brokenOutbox = {
    insert: async () => {
        throw new Error('boom');
    },
} as unknown as OutboxRepository;

const buildService = (outbox: OutboxRepository) =>
    new ProcessTransactionService(
        orm.em,
        new WalletRepository(),
        new WagerTransactionRepository(),
        new LedgerRepository(),
        outbox,
    );

afterAll(async () => {
    await orm.close();
});

const countOf = async (sql: string, param: string): Promise<number> => {
    const rows = await orm.em.execute<{ total: number }[]>(sql, [param]);
    return Number(rows[0]?.total);
};

const balanceOf = async (walletId: string): Promise<string | undefined> => {
    const rows = await orm.em.execute<{ balance: string }[]>(
        'select balance from wallets where id = ?',
        [walletId],
    );
    return rows[0]?.balance;
};

describe('Atomicidade (tudo ou nada, com banco real)', () => {
    it('se falhar no meio, nada fica gravado pela metade', async () => {
        const wallet = await createWallet.execute({
            playerId: crypto.randomUUID(),
            initialBalance: { amount: '100.00', currency: 'BRL' },
        });
        const input: ProcessTransactionInput = {
            idempotencyKey: `k-${crypto.randomUUID()}`,
            providerId: 'provider-a',
            externalTransactionId: `ext-${crypto.randomUUID()}`,
            walletId: wallet.id,
            playerId: wallet.playerId,
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: { amount: '30.00', currency: 'BRL' },
        };

        await expect(buildService(brokenOutbox).execute(input)).rejects.toThrow('boom');

        expect(await balanceOf(wallet.id)).toBe('100.00');
        expect(
            await countOf(
                'select count(*)::int as total from wallet_ledger_entries where wallet_id = ?',
                wallet.id,
            ),
        ).toBe(1);
        expect(
            await countOf(
                "select count(*)::int as total from wager_transactions where wallet_id = ? and kind = 'BET'",
                wallet.id,
            ),
        ).toBe(0);
        expect(
            await countOf(
                "select count(*)::int as total from outbox_messages where payload->'data'->>'walletId' = ?",
                wallet.id,
            ),
        ).toBe(0);

        const result = await buildService(new OutboxRepository()).execute(input);
        expect(result.status).toBe(WagerTransactionStatus.Processed);
        expect(await balanceOf(wallet.id)).toBe('70.00');
        expect(
            await countOf(
                "select count(*)::int as total from outbox_messages where payload->'data'->>'walletId' = ?",
                wallet.id,
            ),
        ).toBe(1);
    });
});