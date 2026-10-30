import { createHash } from 'node:crypto';
import { Money } from '../domain/money.js';

export interface PayloadHashInput {
    providerId: string;
    externalTransactionId: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: Money;
    referenceExternalTransactionId?: string;
}

export function computePayloadHash(input: PayloadHashInput): string {
    const canonical = JSON.stringify({
        externalTransactionId: input.externalTransactionId,
        gameId: input.gameId,
        kind: input.kind,
        money: input.money.toJSON(),
        playerId: input.playerId,
        providerId: input.providerId,
        referenceExternalTransactionId: input.referenceExternalTransactionId ?? null,
        roundId: input.roundId,
        walletId: input.walletId,
    });
    return createHash('sha256').update(canonical).digest('hex');
}