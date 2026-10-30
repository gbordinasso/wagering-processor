import { describe, expect, it } from 'bun:test';
import { InvalidLedgerEntryError } from './errors.js';
import { Money } from './money.js';
import {
    LedgerDirection,
    WalletLedgerEntry,
    type CreateLedgerEntryProps,
} from './wallet-ledger-entry.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

const makeEntry = (overrides: Partial<CreateLedgerEntryProps> = {}) =>
    WalletLedgerEntry.create({
        id: 'l1',
        walletId: 'w1',
        transactionId: 't1',
        direction: LedgerDirection.Debit,
        money: brl('25.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('75.00'),
        createdAt: new Date(),
        ...overrides,
    });

describe('WalletLedgerEntry', () => {
    describe('criação válida', () => {
        it('cria um débito com a conta certa', () => {
            expect(makeEntry().isBalanced()).toBe(true);
        });

        it('cria um crédito com a conta certa', () => {
            const credit = makeEntry({
                direction: LedgerDirection.Credit,
                balanceAfter: brl('125.00'),
            });
            expect(credit.isBalanced()).toBe(true);
        });

        it('permite um débito que zera o saldo', () => {
            const entry = makeEntry({ balanceBefore: brl('25.00'), balanceAfter: brl('0.00') });
            expect(entry.balanceAfter.isZero()).toBe(true);
        });
    });

    describe('rejeições', () => {
        it('rejeita débito com a conta errada', () => {
            expect(() => makeEntry({ balanceAfter: brl('70.00') })).toThrow(InvalidLedgerEntryError);
        });

        it('rejeita crédito com a conta errada', () => {
            expect(() =>
                makeEntry({ direction: LedgerDirection.Credit, balanceAfter: brl('75.00') }),
            ).toThrow(InvalidLedgerEntryError);
        });

        it('rejeita débito em que o saldo subiu', () => {
            expect(() => makeEntry({ balanceAfter: brl('125.00') })).toThrow(InvalidLedgerEntryError);
        });

        it('rejeita valor zero', () => {
            expect(() => makeEntry({ money: Money.zero('BRL'), balanceAfter: brl('100.00') })).toThrow(
                InvalidLedgerEntryError,
            );
        });

        it('rejeita saldo negativo', () => {
            expect(() =>
                makeEntry({
                    direction: LedgerDirection.Credit,
                    money: brl('15.00'),
                    balanceBefore: brl('10.00').negate(),
                    balanceAfter: brl('5.00'),
                }),
            ).toThrow(InvalidLedgerEntryError);
        });
    });

    describe('rehydrate', () => {
        it('reconstrói o lançamento com os dados guardados no banco', () => {
            const entry = WalletLedgerEntry.rehydrate({
                id: 'l1',
                walletId: 'w1',
                transactionId: 't1',
                direction: LedgerDirection.Debit,
                money: brl('25.00'),
                balanceBefore: brl('100.00'),
                balanceAfter: brl('75.00'),
                createdAt: new Date(),
            });
            expect(entry.direction).toBe(LedgerDirection.Debit);
            expect(entry.balanceAfter.toJSON().amount).toBe('75.00');
            expect(entry.isBalanced()).toBe(true);
        });

        it('não revalida, mas o isBalanced ainda detecta uma linha inconsistente', () => {
            const entry = WalletLedgerEntry.rehydrate({
                id: 'l1',
                walletId: 'w1',
                transactionId: 't1',
                direction: LedgerDirection.Debit,
                money: brl('25.00'),
                balanceBefore: brl('100.00'),
                balanceAfter: brl('70.00'),
                createdAt: new Date(),
            });
            expect(entry.isBalanced()).toBe(false);
        });
    });
});