import { describe, expect, it } from 'bun:test';
import { Money } from '../money.js';
import { Wallet } from '../wallet.js';
import { LedgerDirection, WalletLedgerEntry } from '../wallet-ledger-entry.js';
import { WalletBalanceChanged } from './wallet-balance-changed.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const occurredAt = new Date();

const makeEvent = (causationId?: string) => {
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', openingBalance: brl('100.00') });
    wallet.debit(brl('25.00'));
    const entry = WalletLedgerEntry.create({
        id: 'l1',
        walletId: 'w1',
        transactionId: 't1',
        direction: LedgerDirection.Debit,
        money: brl('25.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('75.00'),
        createdAt: occurredAt,
    });
    return WalletBalanceChanged.from(wallet, entry, {
        eventId: 'e1',
        correlationId: 'c1',
        causationId,
        occurredAt,
    });
};

describe('WalletBalanceChanged', () => {
    it('tem o tipo e a versão definidos no próprio evento', () => {
        const json = makeEvent().toJSON();
        expect(json.eventType).toBe('WalletBalanceChanged');
        expect(json.version).toBe(1);
    });

    it('usa o id da carteira como aggregateId', () => {
        expect(makeEvent().toJSON().aggregateId).toBe('w1');
    });

    it('carrega o conteúdo com dinheiro em texto decimal', () => {
        expect(makeEvent().toJSON().data).toEqual({
            walletId: 'w1',
            transactionId: 't1',
            direction: LedgerDirection.Debit,
            money: { amount: '25.00', currency: 'BRL' },
            balanceBefore: { amount: '100.00', currency: 'BRL' },
            balanceAfter: { amount: '75.00', currency: 'BRL' },
            walletVersion: 2,
        });
    });

    it('serializa a data em formato ISO-8601', () => {
        expect(makeEvent().toJSON().occurredAt).toBe(occurredAt.toISOString());
    });

    it('vira JSON sem perder nada (é o que vai pra outbox)', () => {
        const parsed = JSON.parse(JSON.stringify(makeEvent('cause-1')));
        expect(parsed.causationId).toBe('cause-1');
        expect(parsed.data.balanceAfter).toEqual({ amount: '75.00', currency: 'BRL' });
    });

    it('o causationId é opcional', () => {
        expect(makeEvent().toJSON().causationId).toBeUndefined();
    });
});