import { describe, expect, it } from 'bun:test';
import { InvalidOutboxMessageError } from './errors.js';
import { OutboxMessage, type EnqueueOutboxProps } from './outbox-message.js';

const now = new Date();

// Cria um evento de teste. Dá pra trocar qualquer campo pelo "overrides".
const makeProps = (overrides: Partial<EnqueueOutboxProps> = {}): EnqueueOutboxProps => ({
  id: 'o1',
  aggregateId: 'wallet-1',
  eventType: 'WalletBalanceChanged',
  payload: { balance: '75.00' },
  occurredAt: now,
  ...overrides,
});

describe('OutboxMessage', () => {
  describe('criação', () => {
    it('nasce pendente, sem tentativas e pronta pra publicar', () => {
      const message = OutboxMessage.enqueue(makeProps());
      expect(message.isPending()).toBe(true);
      expect(message.getAttempts()).toBe(0);
      expect(message.isDue(now)).toBe(true);
    });

    it('rejeita aggregateId vazio', () => {
      expect(() => OutboxMessage.enqueue(makeProps({ aggregateId: ' ' }))).toThrow(
        InvalidOutboxMessageError,
      );
    });

    it('rejeita eventType vazio', () => {
      expect(() => OutboxMessage.enqueue(makeProps({ eventType: '' }))).toThrow(
        InvalidOutboxMessageError,
      );
    });
  });

  describe('publicação', () => {
    it('markPublished deixa de ser pendente e guarda a hora', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.markPublished(now);
      expect(message.isPending()).toBe(false);
      expect(message.getPublishedAt()).toBe(now);
      expect(message.isDue(now)).toBe(false);
    });

    it('não permite publicar duas vezes', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.markPublished(now);
      expect(() => message.markPublished(now)).toThrow(InvalidOutboxMessageError);
    });
  });

  describe('retentativas (backoff)', () => {
    it('a primeira falha agenda a próxima tentativa pra 1 segundo depois', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.scheduleRetry(now);
      expect(message.getAttempts()).toBe(1);
      expect(message.getNextAttemptAt().getTime()).toBe(now.getTime() + 1000);
    });

    it('a espera dobra a cada falha', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.scheduleRetry(now);
      message.scheduleRetry(now);
      message.scheduleRetry(now);
      expect(message.getAttempts()).toBe(3);
      expect(message.getNextAttemptAt().getTime()).toBe(now.getTime() + 4000);
    });

    it('a espera tem um teto de 5 minutos', () => {
      const message = OutboxMessage.enqueue(makeProps());
      for (let i = 0; i < 20; i++) {
        message.scheduleRetry(now);
      }
      expect(message.getNextAttemptAt().getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    });

    it('não está pronta antes da hora da próxima tentativa', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.scheduleRetry(now);
      expect(message.isDue(now)).toBe(false);
      expect(message.isDue(new Date(now.getTime() + 1000))).toBe(true);
    });

    it('não agenda retry de um evento já publicado', () => {
      const message = OutboxMessage.enqueue(makeProps());
      message.markPublished(now);
      expect(() => message.scheduleRetry(now)).toThrow(InvalidOutboxMessageError);
    });
  });

  describe('rehydrate', () => {
    it('reconstrói o estado guardado no banco', () => {
      const message = OutboxMessage.rehydrate({
        ...makeProps(),
        attempts: 2,
        nextAttemptAt: now,
        publishedAt: now,
      });
      expect(message.getAttempts()).toBe(2);
      expect(message.isPending()).toBe(false);
    });
  });
});