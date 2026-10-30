import { FailureCode } from '../domain/failure-code.js';
import type { WagerTransaction } from '../domain/wager-transaction.js';
import {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../domain/wager-transaction-enums.js';

const REVERSIBLE_KINDS: Partial<Record<WagerTransactionKind, WagerTransactionKind[]>> = {
    [WagerTransactionKind.Refund]: [WagerTransactionKind.Bet],
    [WagerTransactionKind.Rollback]: [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
    ],
};

export function checkReference(
    transaction: WagerTransaction,
    reference: WagerTransaction,
): FailureCode | undefined {
    if (
        reference.walletId !== transaction.walletId ||
        reference.playerId !== transaction.playerId ||
        reference.roundId !== transaction.roundId
    ) {
        return FailureCode.ReferenceMismatch;
    }

    if (reference.getStatus() !== WagerTransactionStatus.Processed) {
        return FailureCode.ReferenceMismatch;
    }

    const allowed = REVERSIBLE_KINDS[transaction.kind] ?? [];
    if (!allowed.includes(reference.kind)) {
        return FailureCode.InvalidReferenceKind;
    }

    if (reference.money.currency !== transaction.money.currency) {
        return FailureCode.CurrencyMismatch;
    }

    if (!reference.money.equals(transaction.money)) {
        return FailureCode.AmountMismatch;
    }

    return undefined;
}