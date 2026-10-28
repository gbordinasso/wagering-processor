import { describe, expect, it } from 'bun:test';
import { InvalidTransactionError, InvalidTransactionStateError } from './errors.js';
import { FailureCode } from './failure-code.js';
import { Money } from './money.js';
import { WagerTransaction, type CreateWagerTransactionProps } from './wager-transaction.js';
import { WagerTransactionKind, WagerTransactionStatus } from './wager-transaction-enums.js';

const makeTransaction = (overrides: Partial<CreateWagerTransactionProps> = {}) =>
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
        createdAt: new Date(),
        ...overrides,
    });

describe('WagerTransaction', () => {
    describe('criação', () => {
        it('nasce com status PENDING', () => {
            expect(makeTransaction().getStatus()).toBe(WagerTransactionStatus.Pending);
        });

        it('REFUND sem referência é rejeitado', () => {
            expect(() => makeTransaction({ kind: WagerTransactionKind.Refund })).toThrow(
                InvalidTransactionError,
            );
        });

        it('ROLLBACK sem referência é rejeitado', () => {
            expect(() => makeTransaction({ kind: WagerTransactionKind.Rollback })).toThrow(
                InvalidTransactionError,
            );
        });

        it('REFUND com referência é aceito e exige referência', () => {
            const refund = makeTransaction({
                kind: WagerTransactionKind.Refund,
                referenceExternalTransactionId: 'tx-0',
            });
            expect(refund.requiresReference()).toBe(true);
        });

        it('BET não exige referência', () => {
            expect(makeTransaction().requiresReference()).toBe(false);
        });

        it('BET com valor zero é rejeitada', () => {
            expect(() => makeTransaction({ money: Money.zero('BRL') })).toThrow(InvalidTransactionError);
        });

        it('LOSS com valor zero é aceita', () => {
            const loss = makeTransaction({ kind: WagerTransactionKind.Loss, money: Money.zero('BRL') });
            expect(loss.getStatus()).toBe(WagerTransactionStatus.Pending);
        });
    });

    describe('transições', () => {
        it('markProcessed guarda a referência e a hora', () => {
            const transaction = makeTransaction();
            const at = new Date();
            transaction.markProcessed('ref-1', at);
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Processed);
            expect(transaction.getReferenceTransactionId()).toBe('ref-1');
            expect(transaction.getProcessedAt()).toBe(at);
        });

        it('markPendingReference muda o status e não é estado final', () => {
            const transaction = makeTransaction();
            transaction.markPendingReference();
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.PendingReference);
            expect(transaction.isTerminal()).toBe(false);
        });

        it('PENDING_REFERENCE ainda pode virar PROCESSED', () => {
            const transaction = makeTransaction();
            transaction.markPendingReference();
            transaction.markProcessed('ref-1', new Date());
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Processed);
        });

        it('reject guarda o código de falha e vira estado final', () => {
            const transaction = makeTransaction();
            transaction.reject(FailureCode.InsufficientFunds);
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Rejected);
            expect(transaction.getFailureCode()).toBe(FailureCode.InsufficientFunds);
            expect(transaction.isTerminal()).toBe(true);
        });

        it('fail guarda o código de falha e vira estado final', () => {
            const transaction = makeTransaction();
            transaction.fail(FailureCode.ReferenceNotFound);
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Failed);
            expect(transaction.isTerminal()).toBe(true);
        });
    });

    describe('estados finais não mudam mais', () => {
        it('PROCESSED não pode ser rejeitada', () => {
            const transaction = makeTransaction();
            transaction.markProcessed(undefined, new Date());
            expect(() => transaction.reject(FailureCode.AmountMismatch)).toThrow(
                InvalidTransactionStateError,
            );
        });

        it('REJECTED não pode ser processada', () => {
            const transaction = makeTransaction();
            transaction.reject(FailureCode.InsufficientFunds);
            expect(() => transaction.markProcessed(undefined, new Date())).toThrow(
                InvalidTransactionStateError,
            );
        });

        it('FAILED não pode voltar a PENDING_REFERENCE', () => {
            const transaction = makeTransaction();
            transaction.fail(FailureCode.ReferenceNotFound);
            expect(() => transaction.markPendingReference()).toThrow(InvalidTransactionStateError);
        });
    });

    describe('consultas', () => {
        it('BET afeta o saldo, LOSS não', () => {
            expect(makeTransaction().affectsBalance()).toBe(true);
            const loss = makeTransaction({ kind: WagerTransactionKind.Loss, money: Money.zero('BRL') });
            expect(loss.affectsBalance()).toBe(false);
        });

        it('matchesPayload é verdadeiro pro mesmo hash', () => {
            expect(makeTransaction({ payloadHash: 'abc' }).matchesPayload('abc')).toBe(true);
        });

        it('matchesPayload é falso pra hash diferente (conflito de idempotência)', () => {
            expect(makeTransaction({ payloadHash: 'abc' }).matchesPayload('xyz')).toBe(false);
        });
    });
});