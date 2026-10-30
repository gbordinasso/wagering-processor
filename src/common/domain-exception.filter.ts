import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import {
    CurrencyMismatchError,
    DomainError,
    IdempotencyConflictError,
    InvalidMoneyError,
    InvalidTransactionError,
    InvalidTransactionStateError,
    InvalidWalletError,
    WalletNotFoundError,
} from '../domain/errors.js';

@Catch(DomainError, UniqueConstraintViolationException)
export class DomainExceptionFilter extends BaseExceptionFilter {
    catch(error: unknown, host: ArgumentsHost): void {
        const { status, code, message } = this.translate(error);

        const http = new HttpException(
            { statusCode: status, error: code, message },
            status,
        );
        super.catch(http, host);
    }

    private translate(error: unknown): { status: number; code: string; message: string } {
        if (error instanceof UniqueConstraintViolationException) {
            return {
                status: HttpStatus.CONFLICT,
                code: 'ALREADY_EXISTS',
                message: 'Resource already exists',
            };
        }

        if (error instanceof WalletNotFoundError) {
            return { status: HttpStatus.NOT_FOUND, code: 'WALLET_NOT_FOUND', message: error.message };
        }

        if (error instanceof IdempotencyConflictError) {
            return { status: HttpStatus.CONFLICT, code: 'IDEMPOTENCY_CONFLICT', message: error.message };
        }

        if (error instanceof InvalidTransactionStateError) {
            return { status: HttpStatus.CONFLICT, code: 'INVALID_STATE', message: error.message };
        }

        if (
            error instanceof InvalidMoneyError ||
            error instanceof InvalidWalletError ||
            error instanceof InvalidTransactionError
        ) {
            return { status: HttpStatus.BAD_REQUEST, code: 'INVALID_INPUT', message: error.message };
        }

        if (error instanceof CurrencyMismatchError) {
            return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: 'CURRENCY_MISMATCH', message: error.message };
        }

        const message = error instanceof Error ? error.message : 'Business rule violated';
        return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: 'BUSINESS_RULE_VIOLATION', message };
    }
}