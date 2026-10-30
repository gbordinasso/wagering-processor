import { Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { OutboxMessage } from '../domain/outbox-message.js';

@Injectable()
export class OutboxRepository {
    async insert(em: EntityManager, message: OutboxMessage): Promise<void> {
        await em.execute(
            `insert into outbox_messages
                (id, aggregate_id, event_type, payload, occurred_at, attempts, next_attempt_at, published_at)
             values (?, ?, ?, ?::jsonb, ?, ?, ?, ?)`,
            [
                message.id,
                message.aggregateId,
                message.eventType,
                JSON.stringify(message.payload),
                message.occurredAt,
                message.getAttempts(),
                message.getNextAttemptAt(),
                message.getPublishedAt() ?? null,
            ],
        );
    }
}