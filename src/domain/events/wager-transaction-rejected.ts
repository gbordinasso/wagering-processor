import { InvalidTransactionStateError } from '../errors.js';
import type { FailureCode } from '../failure-code.js';
import type { MoneyProps } from '../money.js';
import type { WagerTransaction } from '../wager-transaction.js';
import { WagerTransactionKind, WagerTransactionStatus } from '../wager-transaction-enums.js';
import { IntegrationEvent, type EventContext } from './integration-event.js';

export interface WagerTransactionRejectedData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    failureCode: FailureCode;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
    readonly eventType = 'WagerTransactionRejected';
    readonly version = 1;

    static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
        const failureCode = transaction.getFailureCode();
        if (transaction.getStatus() !== WagerTransactionStatus.Rejected || failureCode === undefined) {
            throw new InvalidTransactionStateError('Only a rejected transaction can produce this event');
        }
        return new WagerTransactionRejected({
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
                failureCode,
            },
        });
    }
}