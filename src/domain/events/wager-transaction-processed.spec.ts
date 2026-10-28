import { describe, expect, it } from 'bun:test';
import { Money } from '../money.js';
import { WagerTransaction } from '../wager-transaction.js';
import { WagerTransactionKind } from '../wager-transaction-enums.js';
import { WagerTransactionProcessed } from './wager-transaction-processed.js';

const occurredAt = new Date();

const makeEvent = (kind = WagerTransactionKind.Bet, amount = '25.00') => {
    const transaction = WagerTransaction.create({
        id: 't1',
        providerId: 'provider-a',
        externalTransactionId: 'tx-1',
        idempotencyKey: 'provider-a:tx-1',
        payloadHash: 'abc',
        walletId: 'w1',
        playerId: 'p1',
        roundId: 'r1',
        gameId: 'g1',
        kind,
        money: Money.from({ amount, currency: 'BRL' }),
        createdAt: occurredAt,
    });
    return WagerTransactionProcessed.from(transaction, {
        eventId: 'e1',
        correlationId: 'c1',
        occurredAt,
    });
};

describe('WagerTransactionProcessed', () => {
    it('tem o tipo e a versão definidos no próprio evento', () => {
        const json = makeEvent().toJSON();
        expect(json.eventType).toBe('WagerTransactionProcessed');
        expect(json.version).toBe(1);
    });

    it('usa o id da transação como aggregateId', () => {
        expect(makeEvent().toJSON().aggregateId).toBe('t1');
    });

    it('carrega o conteúdo da transação com dinheiro em texto decimal', () => {
        expect(makeEvent().toJSON().data).toEqual({
            transactionId: 't1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            walletId: 'w1',
            playerId: 'p1',
            roundId: 'r1',
            kind: WagerTransactionKind.Bet,
            money: { amount: '25.00', currency: 'BRL' },
        });
    });

    it('também serve pra LOSS, que não mexe no saldo', () => {
        const json = makeEvent(WagerTransactionKind.Loss, '0.00').toJSON();
        expect(json.data.kind).toBe(WagerTransactionKind.Loss);
        expect(json.data.money).toEqual({ amount: '0.00', currency: 'BRL' });
    });

    it('serializa a data em formato ISO-8601', () => {
        expect(makeEvent().toJSON().occurredAt).toBe('2026-10-28T12:00:00.000Z');
    });
});