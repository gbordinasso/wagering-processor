import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
    CurrencyMismatchError,
    IdempotencyConflictError,
    InsufficientFundsError,
    InvalidTransactionError,
    WalletNotFoundError,
} from '../domain/errors.js';
import { FailureCode } from '../domain/failure-code.js';
import { Money, type MoneyProps } from '../domain/money.js';
import { WagerTransaction } from '../domain/wager-transaction.js';
import {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../domain/wager-transaction-enums.js';
import type { WalletLedgerEntry } from '../domain/wallet-ledger-entry.js';
import { LedgerRepository } from '../wallets/ledger.repository.js';
import { WalletRepository } from '../wallets/wallet.repository.js';
import { computePayloadHash } from './payload-hash.js';
import { WagerTransactionRepository } from './wager-transaction.repository.js';
import { OutboxMessage } from '../domain/outbox-message.js';
import type { IntegrationEvent, EventContext } from '../domain/events/integration-event.js';
import { WagerTransactionProcessed } from '../domain/events/wager-transaction-processed.js';
import { WagerTransactionRejected } from '../domain/events/wager-transaction-rejected.js';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { WagerTransactionPendingReference } from '../domain/events/wager-transaction-pending-reference.js';
import { checkReference } from './reference-rules.js';

export interface ProcessTransactionInput {
    idempotencyKey: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    referenceExternalTransactionId?: string;
}

export interface ProcessTransactionResult {
    transactionId: string;
    status: WagerTransactionStatus;
    failureCode?: FailureCode;
    balance: MoneyProps;
    replayed: boolean;
}

@Injectable()
export class ProcessTransactionService {
    constructor(
        private readonly em: EntityManager,
        private readonly wallets: WalletRepository,
        private readonly transactions: WagerTransactionRepository,
        private readonly ledger: LedgerRepository,
        private readonly outbox: OutboxRepository,
    ) { }

    async execute(input: ProcessTransactionInput): Promise<ProcessTransactionResult> {
        const supported = [
            WagerTransactionKind.Bet,
            WagerTransactionKind.Win,
            WagerTransactionKind.Loss,
            WagerTransactionKind.Refund,
            WagerTransactionKind.Rollback,
        ];
        if (!supported.includes(input.kind)) {
            throw new InvalidTransactionError(`${input.kind} is not supported yet`);
        }

        const money = Money.from(input.money);
        const now = new Date();

        const payloadHash = computePayloadHash({
            providerId: input.providerId,
            externalTransactionId: input.externalTransactionId,
            playerId: input.playerId,
            walletId: input.walletId,
            roundId: input.roundId,
            gameId: input.gameId,
            kind: input.kind,
            money,
            referenceExternalTransactionId: input.referenceExternalTransactionId,
        });

        return this.em.transactional(async (em) => {
            const wallet = await this.wallets.findByIdForUpdate(em, input.walletId);
            if (!wallet) {
                throw new WalletNotFoundError(input.walletId);
            }

            const existing = await this.transactions.findByIdempotencyKey(em, input.idempotencyKey);
            if (existing) {
                if (!existing.matchesPayload(payloadHash)) {
                    throw new IdempotencyConflictError(input.idempotencyKey);
                }
                return {
                    transactionId: existing.id,
                    status: existing.getStatus(),
                    failureCode: existing.getFailureCode(),
                    balance: wallet.getBalance().toJSON(),
                    replayed: true,
                };
            }

            const transaction = WagerTransaction.create({
                id: randomUUID(),
                providerId: input.providerId,
                externalTransactionId: input.externalTransactionId,
                idempotencyKey: input.idempotencyKey,
                payloadHash,
                walletId: input.walletId,
                playerId: input.playerId,
                roundId: input.roundId,
                gameId: input.gameId,
                kind: input.kind,
                money,
                referenceExternalTransactionId: input.referenceExternalTransactionId,
                createdAt: now,
            });
            await this.transactions.insert(em, transaction);

            const context: EventContext = {
                eventId: randomUUID(),
                correlationId: input.idempotencyKey,
                occurredAt: now,
            };

            if (!transaction.affectsBalance()) {
                transaction.markProcessed(undefined, now);
                await this.transactions.update(em, transaction);
                await this.enqueue(em, WagerTransactionProcessed.from(transaction, context));

                return {
                    transactionId: transaction.id,
                    status: transaction.getStatus(),
                    balance: wallet.getBalance().toJSON(),
                    replayed: false,
                };
            }

            let reference: WagerTransaction | undefined;
            if (transaction.requiresReference()) {
                const referenceExternalId = transaction.referenceExternalTransactionId;
                if (referenceExternalId === undefined) {
                    throw new InvalidTransactionError('reference is required');
                }
                const found = await this.transactions.findByProviderAndExternalId(
                    em,
                    input.providerId,
                    referenceExternalId,
                );

                if (!found) {
                    transaction.markPendingReference();
                    await this.transactions.update(em, transaction);
                    await this.enqueue(
                        em,
                        WagerTransactionPendingReference.from(transaction, context),
                    );
                    return {
                        transactionId: transaction.id,
                        status: transaction.getStatus(),
                        balance: wallet.getBalance().toJSON(),
                        replayed: false,
                    };
                }
                reference = found;
            }

            if (reference) {
                const failureCode =
                    checkReference(transaction, reference) ??
                    ((await this.transactions.hasProcessedReversalOf(em, reference.id))
                        ? FailureCode.AlreadyReversed
                        : undefined);

                if (failureCode) {
                    transaction.reject(failureCode);
                    await this.transactions.update(em, transaction);
                    await this.enqueue(em, WagerTransactionRejected.from(transaction, context));
                    return {
                        transactionId: transaction.id,
                        status: transaction.getStatus(),
                        failureCode,
                        balance: wallet.getBalance().toJSON(),
                        replayed: false,
                    };
                }
            }

            let entry: WalletLedgerEntry;

            try {
                entry = wallet.applyMovement(transaction.ledgerDirectionFor(reference), money, {
                    entryId: randomUUID(),
                    transactionId: transaction.id,
                    at: now,
                });
            } catch (error) {
                let failureCode = this.toFailureCode(error);
                if (!failureCode) {
                    throw error;
                }
                if (
                    failureCode === FailureCode.InsufficientFunds &&
                    transaction.kind === WagerTransactionKind.Rollback
                ) {
                    failureCode = FailureCode.ReversalWouldCauseNegativeBalance;
                }
                transaction.reject(failureCode);
                await this.transactions.update(em, transaction);
                await this.enqueue(em, WagerTransactionRejected.from(transaction, context));

                return {
                    transactionId: transaction.id,
                    status: transaction.getStatus(),
                    failureCode,
                    balance: wallet.getBalance().toJSON(),
                    replayed: false,
                };
            }
            transaction.markProcessed(reference?.id, now);

            await this.wallets.save(em, wallet);
            await this.ledger.insert(em, entry);
            await this.transactions.update(em, transaction);
            await this.enqueue(em, WagerTransactionProcessed.from(transaction, context));

            return {
                transactionId: transaction.id,
                status: transaction.getStatus(),
                balance: wallet.getBalance().toJSON(),
                replayed: false,
            };
        });
    }

    private async enqueue(em: EntityManager, event: IntegrationEvent<unknown>): Promise<void> {
        const message = OutboxMessage.enqueue({
            id: event.eventId,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: { ...event.toJSON() },
            occurredAt: event.occurredAt,
        });
        await this.outbox.insert(em, message);
    }

    private toFailureCode(error: unknown): FailureCode | undefined {
        if (error instanceof InsufficientFundsError) {
            return FailureCode.InsufficientFunds;
        }
        if (error instanceof CurrencyMismatchError) {
            return FailureCode.CurrencyMismatch;
        }
        return undefined;
    }
}