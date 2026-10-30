export class DomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

export class InvalidMoneyError extends DomainError { }

export class CurrencyMismatchError extends DomainError {
    constructor(a: string, b: string) {
        super(`Currency mismatch: ${a} vs ${b}`);
    }
}

export class InvalidWalletError extends DomainError { }

export class InsufficientFundsError extends DomainError { }

export class InvalidTransactionError extends DomainError { }

export class InvalidTransactionStateError extends DomainError { }

export class InvalidLedgerEntryError extends DomainError { }

export class InvalidInboxMessageError extends DomainError { }

export class InvalidOutboxMessageError extends DomainError { }

export class WalletNotFoundError extends DomainError {
    constructor(walletId: string) {
        super(`Wallet not found: ${walletId}`);
    }
}

export class IdempotencyConflictError extends DomainError {
    constructor(idempotencyKey: string) {
        super(`Idempotency key "${idempotencyKey}" was already used with a different payload`);
    }
}