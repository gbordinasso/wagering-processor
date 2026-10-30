import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Money, type MoneyProps } from '../domain/money.js';
import { WagerTransaction } from '../domain/wager-transaction.js';
import { WagerTransactionKind } from '../domain/wager-transaction-enums.js';
import { Wallet } from '../domain/wallet.js';
import { WalletLedgerEntry, LedgerDirection } from '../domain/wallet-ledger-entry.js';

export interface CreateWalletInput {
    playerId: string;
    initialBalance: MoneyProps;
}

export interface CreateWalletResult {
    id: string;
    playerId: string;
    balance: MoneyProps;
    version: number;
}

@Injectable()
export class CreateWalletService {
    constructor(private readonly em: EntityManager) { }

    async execute(input: CreateWalletInput): Promise<CreateWalletResult> {
        const initialBalance = Money.from(input.initialBalance);
        const now = new Date();

        const wallet = Wallet.open({
            id: randomUUID(),
            playerId: input.playerId,
            openingBalance: initialBalance,
        });

        await this.em.transactional(async (em) => {
            await em.execute(
                'insert into wallets (id, player_id, currency, balance, version) values (?, ?, ?, ?, ?)',
                [
                    wallet.id,
                    wallet.playerId,
                    wallet.getCurrency(),
                    wallet.getBalance().toJSON().amount,
                    wallet.getVersion(),
                ],
            );

            if (initialBalance.isPositive()) {
                const opening = WagerTransaction.create({
                    id: randomUUID(),
                    providerId: 'system',
                    externalTransactionId: `opening:${wallet.id}`,
                    idempotencyKey: `opening:${wallet.id}`,
                    payloadHash: 'opening',
                    walletId: wallet.id,
                    playerId: wallet.playerId,
                    roundId: 'opening',
                    gameId: 'opening',
                    kind: WagerTransactionKind.Opening,
                    money: initialBalance,
                    createdAt: now,
                });
                opening.markProcessed(undefined, now);

                const entry = WalletLedgerEntry.create({
                    id: randomUUID(),
                    walletId: wallet.id,
                    transactionId: opening.id,
                    direction: LedgerDirection.Credit,
                    money: initialBalance,
                    balanceBefore: Money.zero(initialBalance.currency),
                    balanceAfter: initialBalance,
                    createdAt: now,
                });

                await em.execute(
                    `insert into wager_transactions
                        (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
                         wallet_id, player_id, round_id, game_id, kind, amount, currency,
                         status, created_at, processed_at)
                     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        opening.id,
                        opening.providerId,
                        opening.externalTransactionId,
                        opening.idempotencyKey,
                        opening.payloadHash,
                        opening.walletId,
                        opening.playerId,
                        opening.roundId,
                        opening.gameId,
                        opening.kind,
                        opening.money.toJSON().amount,
                        opening.money.currency,
                        opening.getStatus(),
                        opening.createdAt,
                        opening.getProcessedAt(),
                    ],
                );

                await em.execute(
                    `insert into wallet_ledger_entries
                        (id, wallet_id, transaction_id, direction, amount, currency,
                         balance_before, balance_after, created_at)
                     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        entry.id,
                        entry.walletId,
                        entry.transactionId,
                        entry.direction,
                        entry.money.toJSON().amount,
                        entry.money.currency,
                        entry.balanceBefore.toJSON().amount,
                        entry.balanceAfter.toJSON().amount,
                        entry.createdAt,
                    ],
                );
            }
        });

        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.getBalance().toJSON(),
            version: wallet.getVersion(),
        };
    }
}