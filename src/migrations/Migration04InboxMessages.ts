import { Migration } from '@mikro-orm/migrations';

export class Migration04InboxMessages extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table inbox_messages (
        consumer_name text        not null,
        message_id    text        not null,
        payload_hash  text        not null,
        received_at   timestamptz not null default now(),
        processed_at  timestamptz,

        primary key (consumer_name, message_id)
      );
    `);
  }

  async down(): Promise<void> {
    this.addSql('drop table inbox_messages;');
  }
}