import { InvalidTransactionError, InvalidTransactionStateError } from './errors.js';
import { FailureCode } from './failure-code.js';
import { Money } from './money.js';
import { WagerTransactionKind, WagerTransactionStatus } from './wager-transaction-enums.js';
import { LedgerDirection } from './wallet-ledger-entry.js';

export interface CreateWagerTransactionProps {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    createdAt: Date;
}

export interface WagerTransactionState extends CreateWagerTransactionProps {
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: FailureCode;
    processedAt?: Date;
}

function kindRequiresReference(kind: WagerTransactionKind): boolean {
    return kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
}

export class WagerTransaction {
    private constructor(
        public readonly id: string,
        public readonly providerId: string,
        public readonly externalTransactionId: string,
        public readonly idempotencyKey: string,
        public readonly payloadHash: string,
        public readonly walletId: string,
        public readonly playerId: string,
        public readonly roundId: string,
        public readonly gameId: string,
        public readonly kind: WagerTransactionKind,
        public readonly money: Money,
        public readonly referenceExternalTransactionId: string | undefined,
        public readonly createdAt: Date,
        private status: WagerTransactionStatus,
        private referenceTransactionId?: string,
        private failureCode?: FailureCode,
        private processedAt?: Date,
    ) { }

    static create(props: CreateWagerTransactionProps): WagerTransaction {
        if (kindRequiresReference(props.kind) && !props.referenceExternalTransactionId) {
            throw new InvalidTransactionError(`${props.kind} requires a reference transaction`);
        }
        if (props.kind !== WagerTransactionKind.Loss && !props.money.isPositive()) {
            throw new InvalidTransactionError(`${props.kind} amount must be positive`);
        }
        return new WagerTransaction(
            props.id,
            props.providerId,
            props.externalTransactionId,
            props.idempotencyKey,
            props.payloadHash,
            props.walletId,
            props.playerId,
            props.roundId,
            props.gameId,
            props.kind,
            props.money,
            props.referenceExternalTransactionId,
            props.createdAt,
            WagerTransactionStatus.Pending,
        );
    }

    static rehydrate(state: WagerTransactionState): WagerTransaction {
        return new WagerTransaction(
            state.id,
            state.providerId,
            state.externalTransactionId,
            state.idempotencyKey,
            state.payloadHash,
            state.walletId,
            state.playerId,
            state.roundId,
            state.gameId,
            state.kind,
            state.money,
            state.referenceExternalTransactionId,
            state.createdAt,
            state.status,
            state.referenceTransactionId,
            state.failureCode,
            state.processedAt,
        );
    }

    getStatus(): WagerTransactionStatus {
        return this.status;
    }

    requiresReference(): boolean {
        return kindRequiresReference(this.kind);
    }

    affectsBalance(): boolean {
        return this.kind !== WagerTransactionKind.Loss;
    }

    matchesPayload(payloadHash: string): boolean {
        return this.payloadHash === payloadHash;
    }

    ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
        switch (this.kind) {
            case WagerTransactionKind.Bet:
                return LedgerDirection.Debit;

            case WagerTransactionKind.Opening:

            case WagerTransactionKind.Win:

            case WagerTransactionKind.Refund:
                return LedgerDirection.Credit;

            case WagerTransactionKind.Rollback: {
                if (!reference) {
                    throw new InvalidTransactionError(
                        'ROLLBACK needs the referenced transaction to define its direction',
                    );
                }
                return reference.ledgerDirectionFor() === LedgerDirection.Debit
                    ? LedgerDirection.Credit
                    : LedgerDirection.Debit;
            }

            case WagerTransactionKind.Loss:
                throw new InvalidTransactionError(
                    'LOSS does not move the balance, so it has no ledger direction',
                );
        }
    }

    isTerminal(): boolean {
        return (
            this.status === WagerTransactionStatus.Processed ||
            this.status === WagerTransactionStatus.Rejected ||
            this.status === WagerTransactionStatus.Failed
        );
    }

    markProcessed(referenceTransactionId: string | undefined, at: Date): void {
        this.assertNotTerminal();
        this.status = WagerTransactionStatus.Processed;
        this.referenceTransactionId = referenceTransactionId;
        this.processedAt = at;
    }

    markPendingReference(): void {
        this.assertNotTerminal();
        this.status = WagerTransactionStatus.PendingReference;
    }

    reject(code: FailureCode): void {
        this.assertNotTerminal();
        this.status = WagerTransactionStatus.Rejected;
        this.failureCode = code;
    }

    fail(code: FailureCode): void {
        this.assertNotTerminal();
        this.status = WagerTransactionStatus.Failed;
        this.failureCode = code;
    }

    getFailureCode(): FailureCode | undefined {
        return this.failureCode;
    }

    getReferenceTransactionId(): string | undefined {
        return this.referenceTransactionId;
    }

    getProcessedAt(): Date | undefined {
        return this.processedAt;
    }

    private assertNotTerminal(): void {
        if (this.isTerminal()) {
            throw new InvalidTransactionStateError(`Transaction is already ${this.status}`);
        }
    }
}