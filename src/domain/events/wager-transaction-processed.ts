import type { MoneyProps } from '../money.js';
import type { WagerTransaction } from '../wager-transaction.js';
import type { WagerTransactionKind } from '../wager-transaction-enums.js';
import { IntegrationEvent, type EventContext } from './integration-event.js';

export interface WagerTransactionProcessedData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
    readonly eventType = 'WagerTransactionProcessed';
    readonly version = 1;

    static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
        return new WagerTransactionProcessed({
            eventId: ctx.eventId,
            aggregateId: transaction.id,
            correlationId: ctx.correlationId,
            causationId: ctx.causationId,
            occurredAt: ctx.occurredAt,
            data: {
                transactionId: transaction.id,
                providerId: transaction.providerId,
                externalTransactionId: transaction.externalTransactionId,
                walletId: transaction.walletId,
                playerId: transaction.playerId,
                roundId: transaction.roundId,
                kind: transaction.kind,
                money: transaction.money.toJSON(),
            },
        });
    }
}