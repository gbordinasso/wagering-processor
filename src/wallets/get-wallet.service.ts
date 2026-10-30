import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletNotFoundError } from '../domain/errors.js';

type WalletRow = {
    id: string;
    player_id: string;
    currency: string;
    balance: string;
    version: number;
};

@Injectable()
export class GetWalletService {
    constructor(private readonly em: EntityManager) { }

    async execute(walletId: string) {
        const rows = await this.em.execute<WalletRow[]>(
            'select id, player_id, currency, balance, version from wallets where id = ?',
            [walletId],
        );

        const row = rows[0];
        if (!row) {
            throw new WalletNotFoundError(walletId);
        }

        return {
            id: row.id,
            playerId: row.player_id,
            balance: { amount: String(row.balance), currency: row.currency },
            version: Number(row.version),
        };
    }
}