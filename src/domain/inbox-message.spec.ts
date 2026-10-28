import { describe, expect, it } from 'bun:test';
import { InvalidInboxMessageError } from './errors.js';
import { InboxMessage, type ReceiveInboxProps } from './inbox-message.js';

const makeProps = (overrides: Partial<ReceiveInboxProps> = {}): ReceiveInboxProps => ({
    messageId: 'msg-123',
    consumerName: 'wager-consumer',
    payloadHash: 'abc',
    receivedAt: new Date(),
    ...overrides,
});

describe('InboxMessage', () => {
    it('nasce sem ter sido processada', () => {
        const message = InboxMessage.receive(makeProps());
        expect(message.isProcessed()).toBe(false);
        expect(message.getProcessedAt()).toBeUndefined();
    });

    it('rejeita messageId vazio', () => {
        expect(() => InboxMessage.receive(makeProps({ messageId: ' ' }))).toThrow(
            InvalidInboxMessageError,
        );
    });

    it('rejeita consumerName vazio', () => {
        expect(() => InboxMessage.receive(makeProps({ consumerName: '' }))).toThrow(
            InvalidInboxMessageError,
        );
    });

    it('markProcessed marca como processada e guarda a hora', () => {
        const message = InboxMessage.receive(makeProps());
        const at = new Date();
        message.markProcessed(at);
        expect(message.isProcessed()).toBe(true);
        expect(message.getProcessedAt()).toBe(at);
    });

    it('não permite processar duas vezes', () => {
        const message = InboxMessage.receive(makeProps());
        message.markProcessed(new Date());
        expect(() => message.markProcessed(new Date())).toThrow(InvalidInboxMessageError);
    });

    it('rehydrate reconstrói uma mensagem já processada', () => {
        const at = new Date();
        const message = InboxMessage.rehydrate({ ...makeProps(), processedAt: at });
        expect(message.isProcessed()).toBe(true);
        expect(message.getProcessedAt()).toBe(at);
    });
});