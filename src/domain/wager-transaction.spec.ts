import { describe, expect, it } from 'bun:test';
import { InvalidTransactionError, InvalidTransactionStateError } from './errors.js';
import { FailureCode } from './failure-code.js';
import { Money } from './money.js';
import { WagerTransaction, type CreateWagerTransactionProps } from './wager-transaction.js';
import { WagerTransactionKind, WagerTransactionStatus } from './wager-transaction-enums.js';
import { LedgerDirection } from './wallet-ledger-entry.js';

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

    describe('rehydrate', () => {
        const baseState = {
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
        };

        it('reconstrói uma transação rejeitada com o código de falha', () => {
            const transaction = WagerTransaction.rehydrate({
                ...baseState,
                status: WagerTransactionStatus.Rejected,
                failureCode: FailureCode.InsufficientFunds,
            });
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Rejected);
            expect(transaction.getFailureCode()).toBe(FailureCode.InsufficientFunds);
            expect(transaction.isTerminal()).toBe(true);
        });

        it('reconstrói uma transação processada com referência e hora', () => {
            const at = new Date();
            const transaction = WagerTransaction.rehydrate({
                ...baseState,
                status: WagerTransactionStatus.Processed,
                referenceTransactionId: 'ref-1',
                processedAt: at,
            });
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Processed);
            expect(transaction.getReferenceTransactionId()).toBe('ref-1');
            expect(transaction.getProcessedAt()).toBe(at);
        });

        it('mantém PENDING_REFERENCE, que ainda pode mudar', () => {
            const transaction = WagerTransaction.rehydrate({
                ...baseState,
                status: WagerTransactionStatus.PendingReference,
            });
            expect(transaction.isTerminal()).toBe(false);
            transaction.markProcessed('ref-1', new Date());
            expect(transaction.getStatus()).toBe(WagerTransactionStatus.Processed);
        });

        it('uma transação já finalizada continua não podendo mudar', () => {
            const transaction = WagerTransaction.rehydrate({
                ...baseState,
                status: WagerTransactionStatus.Processed,
            });
            expect(() => transaction.reject(FailureCode.AmountMismatch)).toThrow(
                InvalidTransactionStateError,
            );
        });
    });

    describe('ledgerDirectionFor', () => {
        const makeRollback = () =>
            makeTransaction({
                kind: WagerTransactionKind.Rollback,
                referenceExternalTransactionId: 'tx-0',
            });

        it('BET debita', () => {
            expect(makeTransaction().ledgerDirectionFor()).toBe(LedgerDirection.Debit);
        });

        it('WIN credita', () => {
            const win = makeTransaction({ kind: WagerTransactionKind.Win });
            expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
        });

        it('REFUND credita', () => {
            const refund = makeTransaction({
                kind: WagerTransactionKind.Refund,
                referenceExternalTransactionId: 'tx-0',
            });
            expect(refund.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
        });

        it('OPENING credita', () => {
            const opening = makeTransaction({ kind: WagerTransactionKind.Opening });
            expect(opening.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
        });

        it('ROLLBACK de uma BET credita (inverso do débito)', () => {
            const bet = makeTransaction();
            expect(makeRollback().ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
        });

        it('ROLLBACK de um WIN debita (inverso do crédito)', () => {
            const win = makeTransaction({ kind: WagerTransactionKind.Win });
            expect(makeRollback().ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
        });

        it('ROLLBACK sem a transação referenciada é erro', () => {
            expect(() => makeRollback().ledgerDirectionFor()).toThrow(InvalidTransactionError);
        });

        it('LOSS não tem direção no extrato', () => {
            const loss = makeTransaction({
                kind: WagerTransactionKind.Loss,
                money: Money.zero('BRL'),
            });
            expect(() => loss.ledgerDirectionFor()).toThrow(InvalidTransactionError);
        });
    });
});