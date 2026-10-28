import { InvalidTransactionStateError } from '../errors.js';
import type { MoneyProps } from '../money.js';
import type { WagerTransaction } from '../wager-transaction.js';
import { WagerTransactionKind, WagerTransactionStatus } from '../wager-transaction-enums.js';
import { IntegrationEvent, type EventContext } from './integration-event.js';

export interface WagerTransactionPendingReferenceData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
    readonly eventType = 'WagerTransactionPendingReference';
    readonly version = 1;

    static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
        const reference = transaction.referenceExternalTransactionId;
        if (transaction.getStatus() !== WagerTransactionStatus.PendingReference || reference === undefined) {
            throw new InvalidTransactionStateError(
                'Only a transaction waiting for its reference can produce this event',
            );
        }
        return new WagerTransactionPendingReference({
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
                referenceExternalTransactionId: reference,
            },
        });
    }
}