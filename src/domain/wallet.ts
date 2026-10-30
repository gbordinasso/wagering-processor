import { InsufficientFundsError, InvalidWalletError } from './errors.js';
import { Money } from './money.js';
import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry.js';

export interface WalletState {
    id: string;
    playerId: string;
    balance: Money;
    version: number;
}

export interface LedgerContext {
    entryId: string;
    transactionId: string;
    at: Date;
}

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerId: string,
        private balance: Money,
        private version: number,
    ) {

    }

    static open(props: { id: string; playerId: string; openingBalance: Money }): Wallet {
        if (props.openingBalance.isNegative()) {
            throw new InvalidWalletError('Opening balance cannot be negative');
        }
        return new Wallet(props.id, props.playerId, props.openingBalance, 1);
    }

    static rehydrate(state: WalletState): Wallet {
        return new Wallet(state.id, state.playerId, state.balance, state.version);
    }

    credit(amount: Money): void {
        if (!amount.isPositive()) {
            throw new InvalidWalletError('Credit amount must be positive');
        }
        this.balance = this.balance.add(amount);
        this.version += 1;
    }

    debit(amount: Money): void {
        if (!amount.isPositive()) {
            throw new InvalidWalletError('Debit amount must be positive');
        }
        if (this.balance.isLessThan(amount)) {
            throw new InsufficientFundsError(
                `Insufficient funds: balance ${this.balance.toString()}, requested ${amount.toString()}`,
            );
        }
        this.balance = this.balance.subtract(amount);
        this.version += 1;
    }

    applyMovement(direction: LedgerDirection, amount: Money, ctx: LedgerContext): WalletLedgerEntry {
        const balanceBefore = this.balance;
        if (direction === LedgerDirection.Debit) {
            this.debit(amount);
        } else {
            this.credit(amount);
        }
        return WalletLedgerEntry.create({
            id: ctx.entryId,
            walletId: this.id,
            transactionId: ctx.transactionId,
            direction,
            money: amount,
            balanceBefore,
            balanceAfter: this.balance,
            createdAt: ctx.at,
        });
    }

    getBalance(): Money {
        return this.balance;
    }

    getVersion(): number {
        return this.version;
    }

    getCurrency(): string {
        return this.balance.currency;
    }
}