import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError, InsufficientFundsError, InvalidWalletError } from './errors.js';
import { Money } from './money.js';
import { Wallet } from './wallet.js';
import { LedgerDirection } from './wallet-ledger-entry.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const usd = (amount: string) => Money.from({ amount, currency: 'USD' });

const openWallet = (balance: string) =>
    Wallet.open({ id: 'w1', playerId: 'p1', openingBalance: brl(balance) });

describe('Wallet', () => {
    describe('abertura', () => {
        it('abre com o saldo inicial e versão 1', () => {
            const wallet = openWallet('100.00');
            expect(wallet.getBalance().toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
            expect(wallet.getVersion()).toBe(1);
            expect(wallet.getCurrency()).toBe('BRL');
        });

        it('rejeita saldo inicial negativo', () => {
            const negative = brl('10.00').negate();
            expect(() =>
                Wallet.open({ id: 'w1', playerId: 'p1', openingBalance: negative }),
            ).toThrow(InvalidWalletError);
        });
    });

    describe('credit', () => {
        it('soma ao saldo e aumenta a versão', () => {
            const wallet = openWallet('100.00');
            wallet.credit(brl('50.00'));
            expect(wallet.getBalance().toJSON().amount).toBe('150.00');
            expect(wallet.getVersion()).toBe(2);
        });

        it('rejeita valor zero', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.credit(Money.zero('BRL'))).toThrow(InvalidWalletError);
        });

        it('rejeita moeda diferente da carteira', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.credit(usd('10.00'))).toThrow(CurrencyMismatchError);
        });
    });

    describe('debit', () => {
        it('subtrai do saldo e aumenta a versão', () => {
            const wallet = openWallet('100.00');
            wallet.debit(brl('30.00'));
            expect(wallet.getBalance().toJSON().amount).toBe('70.00');
            expect(wallet.getVersion()).toBe(2);
        });

        it('permite debitar exatamente o saldo, ficando com zero', () => {
            const wallet = openWallet('100.00');
            wallet.debit(brl('100.00'));
            expect(wallet.getBalance().isZero()).toBe(true);
        });

        it('rejeita débito maior que o saldo', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.debit(brl('110.00'))).toThrow(InsufficientFundsError);
        });

        it('débito recusado não altera saldo nem versão', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.debit(brl('110.00'))).toThrow(InsufficientFundsError);
            expect(wallet.getBalance().toJSON().amount).toBe('100.00');
            expect(wallet.getVersion()).toBe(1);
        });

        it('rejeita valor zero', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.debit(Money.zero('BRL'))).toThrow(InvalidWalletError);
        });

        it('rejeita moeda diferente da carteira', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.debit(usd('10.00'))).toThrow(CurrencyMismatchError);
        });

        it('cenário obrigatório: saldo 100, duas apostas de 80', () => {
            const wallet = openWallet('100.00');
            wallet.debit(brl('80.00'));
            expect(() => wallet.debit(brl('80.00'))).toThrow(InsufficientFundsError);
            expect(wallet.getBalance().toJSON().amount).toBe('20.00');
        });
    });

    describe('rehydrate', () => {
        it('reconstrói a carteira com o estado guardado, sem mexer na versão', () => {
            const wallet = Wallet.rehydrate({
                id: 'w1',
                playerId: 'p1',
                balance: brl('75.00'),
                version: 5,
            });
            expect(wallet.getBalance().toJSON().amount).toBe('75.00');
            expect(wallet.getVersion()).toBe(5);
            expect(wallet.getCurrency()).toBe('BRL');
        });

        it('a carteira reconstruída continua funcionando (o débito sobe a versão)', () => {
            const wallet = Wallet.rehydrate({
                id: 'w1',
                playerId: 'p1',
                balance: brl('75.00'),
                version: 5,
            });
            wallet.debit(brl('25.00'));
            expect(wallet.getBalance().toJSON().amount).toBe('50.00');
            expect(wallet.getVersion()).toBe(6);
        });
    });

    describe('applyMovement', () => {
        const ctx = {
            entryId: 'l1',
            transactionId: 't1',
            at: new Date(),
        };

        it('débito: muda o saldo e devolve o lançamento com a conta certa', () => {
            const wallet = openWallet('100.00');
            const entry = wallet.applyMovement(LedgerDirection.Debit, brl('25.00'), ctx);
            expect(wallet.getBalance().toJSON().amount).toBe('75.00');
            expect(entry.direction).toBe(LedgerDirection.Debit);
            expect(entry.balanceBefore.toJSON().amount).toBe('100.00');
            expect(entry.balanceAfter.toJSON().amount).toBe('75.00');
            expect(entry.isBalanced()).toBe(true);
        });

        it('crédito: muda o saldo e devolve o lançamento com a conta certa', () => {
            const wallet = openWallet('100.00');
            const entry = wallet.applyMovement(LedgerDirection.Credit, brl('50.00'), ctx);
            expect(wallet.getBalance().toJSON().amount).toBe('150.00');
            expect(entry.direction).toBe(LedgerDirection.Credit);
            expect(entry.isBalanced()).toBe(true);
        });

        it('o lançamento aponta pra carteira e pra transação', () => {
            const entry = openWallet('100.00').applyMovement(LedgerDirection.Debit, brl('25.00'), ctx);
            expect(entry.walletId).toBe('w1');
            expect(entry.transactionId).toBe('t1');
        });

        it('sobe a versão da carteira', () => {
            const wallet = openWallet('100.00');
            wallet.applyMovement(LedgerDirection.Debit, brl('25.00'), ctx);
            expect(wallet.getVersion()).toBe(2);
        });

        it('débito sem saldo é recusado e não altera nada', () => {
            const wallet = openWallet('100.00');
            expect(() => wallet.applyMovement(LedgerDirection.Debit, brl('110.00'), ctx)).toThrow(
                InsufficientFundsError,
            );
            expect(wallet.getBalance().toJSON().amount).toBe('100.00');
            expect(wallet.getVersion()).toBe(1);
        });

        it('moeda diferente é recusada', () => {
            expect(() =>
                openWallet('100.00').applyMovement(LedgerDirection.Credit, usd('10.00'), ctx),
            ).toThrow(CurrencyMismatchError);
        });
    });
});