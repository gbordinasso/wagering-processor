import { Migration } from '@mikro-orm/migrations';

export class Migration05OutboxMessages extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table outbox_messages (
        id              uuid        primary key,
        aggregate_id    text        not null,
        event_type      text        not null,
        payload         jsonb       not null,
        occurred_at     timestamptz not null default now(),
        attempts        integer     not null default 0,
        next_attempt_at timestamptz not null default now(),
        published_at    timestamptz,

        constraint outbox_attempts_non_negative check (attempts >= 0)
      );
    `);

    this.addSql(`
      create index outbox_pending_idx
      on outbox_messages (next_attempt_at)
      where published_at is null;
    `);
  }

  async down(): Promise<void> {
    this.addSql('drop table outbox_messages;');
  }
}