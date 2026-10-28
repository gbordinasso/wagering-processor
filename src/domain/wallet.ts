import { InsufficientFundsError, InvalidWalletError } from './errors.js';
import { Money } from './money.js';

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