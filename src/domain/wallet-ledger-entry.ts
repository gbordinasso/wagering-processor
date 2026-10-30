import { InvalidLedgerEntryError } from './errors.js';
import { Money } from './money.js';

export enum LedgerDirection {
    Debit = 'DEBIT',
    Credit = 'CREDIT',
}

export interface CreateLedgerEntryProps {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
}

export type LedgerEntryState = CreateLedgerEntryProps;

export class WalletLedgerEntry {
    private constructor(
        public readonly id: string,
        public readonly walletId: string,
        public readonly transactionId: string,
        public readonly direction: LedgerDirection,
        public readonly money: Money,
        public readonly balanceBefore: Money,
        public readonly balanceAfter: Money,
        public readonly createdAt: Date,
    ) { }

    static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
        if (!props.money.isPositive()) {
            throw new InvalidLedgerEntryError('Ledger entry amount must be positive');
        }
        if (props.balanceBefore.isNegative() || props.balanceAfter.isNegative()) {
            throw new InvalidLedgerEntryError('Ledger balances cannot be negative');
        }
        const entry = new WalletLedgerEntry(
            props.id,
            props.walletId,
            props.transactionId,
            props.direction,
            props.money,
            props.balanceBefore,
            props.balanceAfter,
            props.createdAt,
        );
        if (!entry.isBalanced()) {
            throw new InvalidLedgerEntryError('Ledger entry is not balanced');
        }
        return entry;
    }

    static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
        return new WalletLedgerEntry(
            state.id,
            state.walletId,
            state.transactionId,
            state.direction,
            state.money,
            state.balanceBefore,
            state.balanceAfter,
            state.createdAt,
        );
    }

    isBalanced(): boolean {
        const expected =
            this.direction === LedgerDirection.Credit
                ? this.balanceBefore.add(this.money)
                : this.balanceBefore.subtract(this.money);
        return expected.equals(this.balanceAfter);
    }
}