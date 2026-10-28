import { describe, expect, it } from 'bun:test';
import { InvalidTransactionStateError } from '../errors.js';
import { Money } from '../money.js';
import { WagerTransaction } from '../wager-transaction.js';
import { WagerTransactionKind } from '../wager-transaction-enums.js';
import { WagerTransactionPendingReference } from './wager-transaction-pending-reference.js';

const occurredAt = new Date();
const ctx = { eventId: 'e1', correlationId: 'c1', occurredAt };

const makeRefund = () =>
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
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'tx-0',
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        createdAt: occurredAt,
    });

const makeWaitingRefund = () => {
    const transaction = makeRefund();
    transaction.markPendingReference();
    return transaction;
};

describe('WagerTransactionPendingReference', () => {
    it('tem o tipo e a versão definidos no próprio evento', () => {
        const json = WagerTransactionPendingReference.from(makeWaitingRefund(), ctx).toJSON();
        expect(json.eventType).toBe('WagerTransactionPendingReference');
        expect(json.version).toBe(1);
    });

    it('usa o id da transação como aggregateId', () => {
        const json = WagerTransactionPendingReference.from(makeWaitingRefund(), ctx).toJSON();
        expect(json.aggregateId).toBe('t1');
    });

    it('carrega o conteúdo da transação e a referência que está faltando', () => {
        const json = WagerTransactionPendingReference.from(makeWaitingRefund(), ctx).toJSON();
        expect(json.data).toEqual({
            transactionId: 't1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            walletId: 'w1',
            playerId: 'p1',
            roundId: 'r1',
            kind: WagerTransactionKind.Refund,
            money: { amount: '25.00', currency: 'BRL' },
            referenceExternalTransactionId: 'tx-0',
        });
    });

    it('não gera o evento de uma transação que ainda está PENDING', () => {
        expect(() => WagerTransactionPendingReference.from(makeRefund(), ctx)).toThrow(
            InvalidTransactionStateError,
        );
    });

    it('não gera o evento de uma transação PROCESSED', () => {
        const transaction = makeRefund();
        transaction.markProcessed(undefined, occurredAt);
        expect(() => WagerTransactionPendingReference.from(transaction, ctx)).toThrow(
            InvalidTransactionStateError,
        );
    });
});