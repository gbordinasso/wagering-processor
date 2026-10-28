import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError, InsufficientFundsError, InvalidWalletError } from './errors.js';
import { Money } from './money.js';
import { Wallet } from './wallet.js';

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
});