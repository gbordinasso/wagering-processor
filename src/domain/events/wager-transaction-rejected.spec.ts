import { describe, expect, it } from 'bun:test';
import { InvalidTransactionStateError } from '../errors.js';
import { FailureCode } from '../failure-code.js';
import { Money } from '../money.js';
import { WagerTransaction } from '../wager-transaction.js';
import { WagerTransactionKind } from '../wager-transaction-enums.js';
import { WagerTransactionRejected } from './wager-transaction-rejected.js';

const occurredAt = new Date();
const ctx = { eventId: 'e1', correlationId: 'c1', occurredAt };

const makeTransaction = () =>
    WagerTransaction.create({
        id: 't1',
        providerId: 'provider-a',
        externalTransactionId: 'tx-1',
        idempotencyKey: 'provider-a:tx-1',
        payloadHash: 'abc',
        walletId: 'w1',
        playerId: 'p1',
        roundId: 'r1',
        gameId: 'g1',
        kind: WagerTransactionKind.Bet,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        createdAt: occurredAt,
    });

const makeRejectedTransaction = () => {
    const transaction = makeTransaction();
    transaction.reject(FailureCode.InsufficientFunds);
    return transaction;
};

describe('WagerTransactionRejected', () => {
    it('tem o tipo e a versão definidos no próprio evento', () => {
        const json = WagerTransactionRejected.from(makeRejectedTransaction(), ctx).toJSON();
        expect(json.eventType).toBe('WagerTransactionRejected');
        expect(json.version).toBe(1);
    });

    it('usa o id da transação como aggregateId', () => {
        const json = WagerTransactionRejected.from(makeRejectedTransaction(), ctx).toJSON();
        expect(json.aggregateId).toBe('t1');
    });

    it('carrega o conteúdo da transação e o código de falha', () => {
        const json = WagerTransactionRejected.from(makeRejectedTransaction(), ctx).toJSON();
        expect(json.data).toEqual({
            transactionId: 't1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            walletId: 'w1',
            playerId: 'p1',
            roundId: 'r1',
            kind: WagerTransactionKind.Bet,
            money: { amount: '25.00', currency: 'BRL' },
            failureCode: FailureCode.InsufficientFunds,
        });
    });

    it('não gera o evento de uma transação que ainda está PENDING', () => {
        expect(() => WagerTransactionRejected.from(makeTransaction(), ctx)).toThrow(
            InvalidTransactionStateError,
        );
    });

    it('não gera o evento de uma transação PROCESSED', () => {
        const transaction = makeTransaction();
        transaction.markProcessed(undefined, occurredAt);
        expect(() => WagerTransactionRejected.from(transaction, ctx)).toThrow(
            InvalidTransactionStateError,
        );
    });
});