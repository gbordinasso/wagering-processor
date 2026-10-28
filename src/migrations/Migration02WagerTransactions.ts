import { Migration } from '@mikro-orm/migrations';

export class Migration02WagerTransactions extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table wager_transactions (
        id                                uuid          primary key,
        provider_id                       text          not null,
        external_transaction_id           text          not null,
        idempotency_key                   text          not null,
        payload_hash                      text          not null,
        wallet_id                         uuid          not null references wallets(id),
        player_id                         uuid          not null,
        round_id                          text          not null,
        game_id                           text          not null,
        kind                              text          not null,
        amount                            numeric(19,2) not null,
        currency                          char(3)       not null,
        reference_external_transaction_id text,
        reference_transaction_id          uuid          references wager_transactions(id),
        status                            text          not null,
        failure_code                      text,
        created_at                        timestamptz   not null default now(),
        processed_at                      timestamptz,

        constraint wager_tx_idempotency_key_unique unique (idempotency_key),
        constraint wager_tx_provider_external_unique unique (provider_id, external_transaction_id),
        constraint wager_tx_amount_non_negative check (amount >= 0),
        constraint wager_tx_kind_valid check (kind in ('OPENING','BET','WIN','LOSS','REFUND','ROLLBACK')),
        constraint wager_tx_status_valid check (status in ('PENDING','PENDING_REFERENCE','PROCESSED','REJECTED','FAILED'))
      );
    `);
  }

  async down(): Promise<void> {
    this.addSql('drop table wager_transactions;');
  }
}