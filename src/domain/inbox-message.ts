import { InvalidInboxMessageError } from './errors.js';

export interface ReceiveInboxProps {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: Date;
}

export interface InboxMessageState extends ReceiveInboxProps {
    processedAt?: Date;
}

export class InboxMessage {
    private constructor(
        public readonly messageId: string,
        public readonly consumerName: string,
        public readonly payloadHash: string,
        public readonly receivedAt: Date,
        private processedAt?: Date,
    ) { }

    static receive(props: ReceiveInboxProps): InboxMessage {
        if (props.messageId.trim() === '') {
            throw new InvalidInboxMessageError('messageId cannot be empty');
        }
        if (props.consumerName.trim() === '') {
            throw new InvalidInboxMessageError('consumerName cannot be empty');
        }
        return new InboxMessage(
            props.messageId,
            props.consumerName,
            props.payloadHash,
            props.receivedAt,
        );
    }

    static rehydrate(state: InboxMessageState): InboxMessage {
        return new InboxMessage(
            state.messageId,
            state.consumerName,
            state.payloadHash,
            state.receivedAt,
            state.processedAt,
        );
    }

    isProcessed(): boolean {
        return this.processedAt !== undefined;
    }

    getProcessedAt(): Date | undefined {
        return this.processedAt;
    }

    markProcessed(at: Date): void {
        if (this.isProcessed()) {
            throw new InvalidInboxMessageError('Inbox message was already processed');
        }
        this.processedAt = at;
    }
}