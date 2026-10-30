import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Money } from '../domain/money.js';
import { Wallet } from '../domain/wallet.js';

interface WalletRow {
    id: string;
    player_id: string;
    currency: string;
    balance: string;
    version: number;
}

@Injectable()
export class WalletRepository {
    async findByIdForUpdate(em: EntityManager, walletId: string): Promise<Wallet | null> {
        const rows = await em.execute<WalletRow[]>(
            'select id, player_id, currency, balance, version from wallets where id = ? for update',
            [walletId],
        );
        const row = rows[0];
        if (!row) {
            return null;
        }
        return Wallet.rehydrate({
            id: row.id,
            playerId: row.player_id,
            balance: Money.from({ amount: row.balance, currency: row.currency }),
            version: Number(row.version),
        });
    }

    async save(em: EntityManager, wallet: Wallet): Promise<void> {
        await em.execute(
            'update wallets set balance = ?, version = ?, updated_at = now() where id = ?',
            [wallet.getBalance().toJSON().amount, wallet.getVersion(), wallet.id],
        );
    }
}