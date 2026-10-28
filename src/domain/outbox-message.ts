import { InvalidOutboxMessageError } from './errors.js';

export interface EnqueueOutboxProps {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    occurredAt: Date;
}

export interface OutboxMessageState extends EnqueueOutboxProps {
    attempts: number;
    nextAttemptAt: Date;
    publishedAt?: Date;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;

export class OutboxMessage {
    private constructor(
        public readonly id: string,
        public readonly aggregateId: string,
        public readonly eventType: string,
        public readonly payload: Readonly<Record<string, unknown>>,
        public readonly occurredAt: Date,
        private attempts: number,
        private nextAttemptAt: Date,
        private publishedAt?: Date,
    ) { }

    static enqueue(props: EnqueueOutboxProps): OutboxMessage {
        if (props.aggregateId.trim() === '') {
            throw new InvalidOutboxMessageError('aggregateId cannot be empty');
        }
        if (props.eventType.trim() === '') {
            throw new InvalidOutboxMessageError('eventType cannot be empty');
        }
        return new OutboxMessage(
            props.id,
            props.aggregateId,
            props.eventType,
            props.payload,
            props.occurredAt,
            0,
            props.occurredAt,
        );
    }

    static rehydrate(state: OutboxMessageState): OutboxMessage {
        return new OutboxMessage(
            state.id,
            state.aggregateId,
            state.eventType,
            state.payload,
            state.occurredAt,
            state.attempts,
            state.nextAttemptAt,
            state.publishedAt,
        );
    }

    getAttempts(): number {
        return this.attempts;
    }

    getNextAttemptAt(): Date {
        return this.nextAttemptAt;
    }

    getPublishedAt(): Date | undefined {
        return this.publishedAt;
    }

    isPending(): boolean {
        return this.publishedAt === undefined;
    }

    isDue(now: Date): boolean {
        return this.isPending() && this.nextAttemptAt.getTime() <= now.getTime();
    }

    markPublished(at: Date): void {
        this.assertPending();
        this.publishedAt = at;
    }

    scheduleRetry(now: Date): void {
        this.assertPending();
        this.attempts += 1;
        const delay = Math.min(BASE_DELAY_MS * 2 ** (this.attempts - 1), MAX_DELAY_MS);
        this.nextAttemptAt = new Date(now.getTime() + delay);
    }

    private assertPending(): void {
        if (!this.isPending()) {
            throw new InvalidOutboxMessageError('Outbox message was already published');
        }
    }
}