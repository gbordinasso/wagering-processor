import { describe, expect, it } from 'bun:test';
import { Money } from '../domain/money.js';
import { computePayloadHash, type PayloadHashInput } from './payload-hash.js';

const makeInput = (overrides: Partial<PayloadHashInput> = {}): PayloadHashInput => ({
    providerId: 'provider-a',
    externalTransactionId: 'tx-1',
    playerId: 'p1',
    walletId: 'w1',
    roundId: 'r1',
    gameId: 'g1',
    kind: 'BET',
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    ...overrides,
});

describe('computePayloadHash', () => {
    it('gera um SHA-256 em hexadecimal (64 caracteres)', () => {
        expect(computePayloadHash(makeInput())).toMatch(/^[0-9a-f]{64}$/);
    });

    it('o mesmo conteúdo gera sempre o mesmo hash', () => {
        expect(computePayloadHash(makeInput())).toBe(computePayloadHash(makeInput()));
    });

    it('"25" e "25.00" geram o mesmo hash', () => {
        const a = computePayloadHash(makeInput({ money: Money.from({ amount: '25', currency: 'BRL' }) }));
        const b = computePayloadHash(makeInput({ money: Money.from({ amount: '25.00', currency: 'BRL' }) }));
        expect(a).toBe(b);
    });

    it('a ordem dos campos no objeto não importa', () => {
        const normal = makeInput();
        const embaralhado: PayloadHashInput = {
            money: normal.money,
            kind: normal.kind,
            gameId: normal.gameId,
            roundId: normal.roundId,
            walletId: normal.walletId,
            playerId: normal.playerId,
            externalTransactionId: normal.externalTransactionId,
            providerId: normal.providerId,
        };
        expect(computePayloadHash(embaralhado)).toBe(computePayloadHash(normal));
    });

    it('valor diferente gera hash diferente', () => {
        const other = makeInput({ money: Money.from({ amount: '30.00', currency: 'BRL' }) });
        expect(computePayloadHash(other)).not.toBe(computePayloadHash(makeInput()));
    });

    it('moeda diferente gera hash diferente', () => {
        const other = makeInput({ money: Money.from({ amount: '25.00', currency: 'USD' }) });
        expect(computePayloadHash(other)).not.toBe(computePayloadHash(makeInput()));
    });

    it('tipo diferente gera hash diferente', () => {
        expect(computePayloadHash(makeInput({ kind: 'WIN' }))).not.toBe(
            computePayloadHash(makeInput()),
        );
    });

    it('referência diferente gera hash diferente', () => {
        const a = computePayloadHash(makeInput({ kind: 'REFUND', referenceExternalTransactionId: 'tx-0' }));
        const b = computePayloadHash(makeInput({ kind: 'REFUND', referenceExternalTransactionId: 'tx-9' }));
        expect(a).not.toBe(b);
    });
});