import { Migration } from '@mikro-orm/migrations';

export class Migration03WalletLedgerEntries extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table wallet_ledger_entries (
        id             uuid          primary key,
        wallet_id      uuid          not null references wallets(id),
        transaction_id uuid          not null references wager_transactions(id),
        direction      text          not null,
        amount         numeric(19,2) not null,
        currency       char(3)       not null,
        balance_before numeric(19,2) not null,
        balance_after  numeric(19,2) not null,
        created_at     timestamptz   not null default now(),

        constraint ledger_one_entry_per_wallet_transaction unique (wallet_id, transaction_id),
        constraint ledger_direction_valid check (direction in ('DEBIT', 'CREDIT')),
        constraint ledger_amount_positive check (amount > 0),
        constraint ledger_balances_non_negative check (balance_before >= 0 and balance_after >= 0),
        constraint ledger_arithmetic_correct check (
          (direction = 'CREDIT' and balance_after = balance_before + amount)
          or
          (direction = 'DEBIT'  and balance_after = balance_before - amount)
        )
      );
    `);

    this.addSql(`
      create function forbid_ledger_changes() returns trigger as 
      $$
      begin
        raise exception 'wallet_ledger_entries is immutable: % is not allowed', tg_op;
      end;
      $$ language plpgsql;
    `);

    this.addSql(`
      create trigger wallet_ledger_entries_immutable
      before update or delete on wallet_ledger_entries
      for each row execute function forbid_ledger_changes();
    `);
  }

  async down(): Promise<void> {
    this.addSql('drop table wallet_ledger_entries;');
    this.addSql('drop function forbid_ledger_changes();');
  }
}