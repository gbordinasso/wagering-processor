import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError, InvalidMoneyError } from './errors.js';
import { Money } from './money.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const usd = (amount: string) => Money.from({ amount, currency: 'USD' });

describe('Money', () => {
  describe('criação', () => {
    it('cria a partir de string decimal', () => {
      expect(brl('25.00').toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });

    it('sempre serializa com 2 casas decimais', () => {
      expect(brl('25').toJSON().amount).toBe('25.00');
      expect(brl('25.5').toJSON().amount).toBe('25.50');
    });

    const invalidAmounts = ['', 'abc', 'NaN', 'Infinity', '1e3', '-5.00', '10.001', ' 10.00', '1,50'];
    for (const amount of invalidAmounts) {
      it(`rejeita amount inválido: "${amount}"`, () => {
        expect(() => brl(amount)).toThrow(InvalidMoneyError);
      });
    }

    it('rejeita amount que não seja string (ex.: number)', () => {
      expect(() => Money.from({ amount: 25 as unknown as string, currency: 'BRL' })).toThrow(
        InvalidMoneyError,
      );
    });

    it('rejeita moeda inválida', () => {
      expect(() => Money.from({ amount: '1.00', currency: 'brl' })).toThrow(InvalidMoneyError);
      expect(() => Money.from({ amount: '1.00', currency: 'REAL' })).toThrow(InvalidMoneyError);
    });
  });

  describe('operações', () => {
    it('soma sem erro de ponto flutuante (0.10 + 0.20 = 0.30)', () => {
      expect(brl('0.10').add(brl('0.20')).toJSON().amount).toBe('0.30');
    });

    it('subtrai', () => {
      expect(brl('100.00').subtract(brl('80.00')).toJSON().amount).toBe('20.00');
    });

    it('subtração pode resultar em valor negativo', () => {
      const result = brl('10.00').subtract(brl('25.00'));
      expect(result.isNegative()).toBe(true);
      expect(result.toJSON().amount).toBe('-15.00');
    });

    it('é imutável: operações não alteram o original', () => {
      const original = brl('10.00');
      original.add(brl('5.00'));
      expect(original.toJSON().amount).toBe('10.00');
    });

    it('negate inverte o sinal', () => {
      expect(brl('10.00').negate().toJSON().amount).toBe('-10.00');
    });
  });

  describe('consultas', () => {
    it('zero, positivo e negativo', () => {
      expect(Money.zero('BRL').isZero()).toBe(true);
      expect(brl('1.00').isPositive()).toBe(true);
      expect(brl('0.00').isPositive()).toBe(false);
      expect(brl('0.00').isNegative()).toBe(false);
    });

    it('isLessThan compara valores', () => {
      expect(brl('10.00').isLessThan(brl('80.00'))).toBe(true);
      expect(brl('80.00').isLessThan(brl('10.00'))).toBe(false);
    });

    it('equals considera valor e moeda', () => {
      expect(brl('10.00').equals(brl('10'))).toBe(true);
      expect(brl('10.00').equals(usd('10.00'))).toBe(false);
    });
  });

  describe('conflito de moeda', () => {
    it('add, subtract e isLessThan lançam erro com moedas diferentes', () => {
      expect(() => brl('10.00').add(usd('1.00'))).toThrow(CurrencyMismatchError);
      expect(() => brl('10.00').subtract(usd('1.00'))).toThrow(CurrencyMismatchError);
      expect(() => brl('10.00').isLessThan(usd('1.00'))).toThrow(CurrencyMismatchError);
    });
  });
});