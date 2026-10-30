import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { FailureCode } from '../domain/failure-code.js';
import { Money } from '../domain/money.js';
import { WagerTransaction } from '../domain/wager-transaction.js';
import type {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../domain/wager-transaction-enums.js';

interface TransactionRow {
    id: string;
    provider_id: string;
    external_transaction_id: string;
    idempotency_key: string;
    payload_hash: string;
    wallet_id: string;
    player_id: string;
    round_id: string;
    game_id: string;
    kind: string;
    amount: string;
    currency: string;
    reference_external_transaction_id: string | null;
    reference_transaction_id: string | null;
    status: string;
    failure_code: string | null;
    created_at: Date | string;
    processed_at: Date | string | null;
}

@Injectable()
export class WagerTransactionRepository {
    async insert(em: EntityManager, transaction: WagerTransaction): Promise<void> {
        await em.execute(
            `insert into wager_transactions
                (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
                 wallet_id, player_id, round_id, game_id, kind, amount, currency,
                 reference_external_transaction_id, reference_transaction_id,
                 status, failure_code, created_at, processed_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                transaction.id,
                transaction.providerId,
                transaction.externalTransactionId,
                transaction.idempotencyKey,
                transaction.payloadHash,
                transaction.walletId,
                transaction.playerId,
                transaction.roundId,
                transaction.gameId,
                transaction.kind,
                transaction.money.toJSON().amount,
                transaction.money.currency,
                transaction.referenceExternalTransactionId ?? null,
                transaction.getReferenceTransactionId() ?? null,
                transaction.getStatus(),
                transaction.getFailureCode() ?? null,
                transaction.createdAt,
                transaction.getProcessedAt() ?? null,
            ],
        );
    }

    async findByIdempotencyKey(
        em: EntityManager,
        idempotencyKey: string,
    ): Promise<WagerTransaction | null> {
        const rows = await em.execute<TransactionRow[]>(
            'select * from wager_transactions where idempotency_key = ?',
            [idempotencyKey],
        );
        const row = rows[0];
        return row ? this.toTransaction(row) : null;
    }

    async findByProviderAndExternalId(
        em: EntityManager,
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null> {
        const rows = await em.execute<TransactionRow[]>(
            'select * from wager_transactions where provider_id = ? and external_transaction_id = ?',
            [providerId, externalTransactionId],
        );
        const row = rows[0];
        return row ? this.toTransaction(row) : null;
    }

    async findById(em: EntityManager, id: string): Promise<WagerTransaction | null> {
        const rows = await em.execute<TransactionRow[]>(
            'select * from wager_transactions where id = ?',
            [id],
        );
        const row = rows[0];
        return row ? this.toTransaction(row) : null;
    }

    async hasProcessedReversalOf(
        em: EntityManager,
        referenceTransactionId: string,
    ): Promise<boolean> {
        const rows = await em.execute<{ id: string }[]>(
            `select id from wager_transactions
              where reference_transaction_id = ? and status = 'PROCESSED'
              limit 1`,
            [referenceTransactionId],
        );
        return rows.length > 0;
    }

    async update(em: EntityManager, transaction: WagerTransaction): Promise<void> {
        await em.execute(
            `update wager_transactions
                set status = ?, failure_code = ?, reference_transaction_id = ?, processed_at = ?
              where id = ?`,
            [
                transaction.getStatus(),
                transaction.getFailureCode() ?? null,
                transaction.getReferenceTransactionId() ?? null,
                transaction.getProcessedAt() ?? null,
                transaction.id,
            ],
        );
    }

    private toTransaction(row: TransactionRow): WagerTransaction {
        return WagerTransaction.rehydrate({
            id: row.id,
            providerId: row.provider_id,
            externalTransactionId: row.external_transaction_id,
            idempotencyKey: row.idempotency_key,
            payloadHash: row.payload_hash,
            walletId: row.wallet_id,
            playerId: row.player_id,
            roundId: row.round_id,
            gameId: row.game_id,
            kind: row.kind as WagerTransactionKind,
            money: Money.from({ amount: row.amount, currency: row.currency }),
            referenceExternalTransactionId: row.reference_external_transaction_id ?? undefined,
            createdAt: new Date(row.created_at),
            status: row.status as WagerTransactionStatus,
            referenceTransactionId: row.reference_transaction_id ?? undefined,
            failureCode: (row.failure_code ?? undefined) as FailureCode | undefined,
            processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
        });
    }
}