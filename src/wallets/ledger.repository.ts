import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { WalletLedgerEntry } from '../domain/wallet-ledger-entry.js';

@Injectable()
export class LedgerRepository {
    async insert(em: EntityManager, entry: WalletLedgerEntry): Promise<void> {
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
}