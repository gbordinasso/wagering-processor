import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { WagerTransaction } from '../domain/wager-transaction.js';
import { WagerTransactionRepository } from './wager-transaction.repository.js';

@Injectable()
export class GetTransactionService {
    constructor(
        private readonly em: EntityManager,
        private readonly transactions: WagerTransactionRepository,
    ) { }

    async findById(id: string) {
        const transaction = await this.transactions.findById(this.em, id);
        return transaction ? this.toView(transaction) : null;
    }

    async findByExternalId(providerId: string, externalTransactionId: string) {
        const transaction = await this.transactions.findByProviderAndExternalId(
            this.em,
            providerId,
            externalTransactionId,
        );
        return transaction ? this.toView(transaction) : null;
    }

    private toView(transaction: WagerTransaction) {
        return {
            id: transaction.id,
            providerId: transaction.providerId,
            externalTransactionId: transaction.externalTransactionId,
            walletId: transaction.walletId,
            playerId: transaction.playerId,
            roundId: transaction.roundId,
            gameId: transaction.gameId,
            kind: transaction.kind,
            money: transaction.money.toJSON(),
            status: transaction.getStatus(),
            failureCode: transaction.getFailureCode() ?? null,
            referenceExternalTransactionId: transaction.referenceExternalTransactionId ?? null,
            referenceTransactionId: transaction.getReferenceTransactionId() ?? null,
            createdAt: transaction.createdAt.toISOString(),
            processedAt: transaction.getProcessedAt()?.toISOString() ?? null,
        };
    }
}