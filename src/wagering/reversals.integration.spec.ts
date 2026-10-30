import { afterAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { FailureCode } from '../domain/failure-code.js';
import {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../domain/wager-transaction-enums.js';
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

interface TestWallet {
    id: string;
    playerId: string;
}

const newWallet = (amount: string) =>
    createWallet.execute({
        playerId: crypto.randomUUID(),
        initialBalance: { amount, currency: 'BRL' },
    });

const newExternalId = () => `ext-${crypto.randomUUID()}`;

const send = (
    wallet: TestWallet,
    kind: WagerTransactionKind,
    amount: string,
    externalId: string,
    referenceExternalId?: string,
) => {
    const input: ProcessTransactionInput = {
        idempotencyKey: `k-${crypto.randomUUID()}`,
        providerId: 'provider-a',
        externalTransactionId: externalId,
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'r1',
        gameId: 'g1',
        kind,
        money: { amount, currency: 'BRL' },
        referenceExternalTransactionId: referenceExternalId,
    };
    return service.execute(input);
};

const balanceOf = async (walletId: string): Promise<string | undefined> => {
    const rows = await orm.em.execute<{ balance: string }[]>(
        'select balance from wallets where id = ?',
        [walletId],
    );
    return rows[0]?.balance;
};

describe('REFUND e ROLLBACK (com banco real)', () => {
    it('REFUND devolve o valor da aposta', async () => {
        const wallet = await newWallet('100.00');
        const betId = newExternalId();

        await send(wallet, WagerTransactionKind.Bet, '30.00', betId);
        const refund = await send(wallet, WagerTransactionKind.Refund, '30.00', newExternalId(), betId);

        expect(refund.status).toBe(WagerTransactionStatus.Processed);
        expect(await balanceOf(wallet.id)).toBe('100.00');
    });

    it('a mesma aposta não pode ser revertida duas vezes', async () => {
        const wallet = await newWallet('100.00');
        const betId = newExternalId();

        await send(wallet, WagerTransactionKind.Bet, '30.00', betId);
        await send(wallet, WagerTransactionKind.Refund, '30.00', newExternalId(), betId);
        const second = await send(wallet, WagerTransactionKind.Refund, '30.00', newExternalId(), betId);

        expect(second.status).toBe(WagerTransactionStatus.Rejected);
        expect(second.failureCode).toBe(FailureCode.AlreadyReversed);
        expect(await balanceOf(wallet.id)).toBe('100.00');
    });

    it('ROLLBACK de um WIN já gasto é recusado, pra não deixar o saldo negativo', async () => {
        const wallet = await newWallet('100.00');
        const winId = newExternalId();

        await send(wallet, WagerTransactionKind.Win, '100.00', winId); // saldo 200
        await send(wallet, WagerTransactionKind.Bet, '150.00', newExternalId()); // saldo 50
        const rollback = await send(wallet, WagerTransactionKind.Rollback, '100.00', newExternalId(), winId);

        expect(rollback.status).toBe(WagerTransactionStatus.Rejected);
        expect(rollback.failureCode).toBe(FailureCode.ReversalWouldCauseNegativeBalance);
        expect(await balanceOf(wallet.id)).toBe('50.00');
    });

    it('REFUND que chega antes da aposta fica esperando, sem mexer no saldo', async () => {
        const wallet = await newWallet('100.00');

        const refund = await send(
            wallet,
            WagerTransactionKind.Refund,
            '30.00',
            newExternalId(),
            newExternalId(),
        );

        expect(refund.status).toBe(WagerTransactionStatus.PendingReference);
        expect(await balanceOf(wallet.id)).toBe('100.00');
    });

    it('dois REFUNDs da mesma aposta ao mesmo tempo: só um passa', async () => {
        const wallet = await newWallet('100.00');
        const betId = newExternalId();
        await send(wallet, WagerTransactionKind.Bet, '30.00', betId); // saldo 70

        const results = await Promise.all([
            send(wallet, WagerTransactionKind.Refund, '30.00', newExternalId(), betId),
            send(wallet, WagerTransactionKind.Refund, '30.00', newExternalId(), betId),
        ]);

        const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
        const rejected = results.filter((r) => r.status === WagerTransactionStatus.Rejected);
        expect(processed).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.failureCode).toBe(FailureCode.AlreadyReversed);
        expect(await balanceOf(wallet.id)).toBe('100.00');
    });
});