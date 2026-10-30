import { BadRequestException, Body, Controller, Get, Headers, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, } from '@nestjs/common';
import type { Response } from 'express';
import { ProcessTransactionService } from './process-transaction.service.js';
import { GetTransactionService } from './get-transaction.service.js';

type Kind = Parameters<ProcessTransactionService['execute']>[0]['kind'];

const ALLOWED_KINDS = ['BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('wagering/transactions')
export class WageringController {
    constructor(
        private readonly processTransaction: ProcessTransactionService,
        private readonly getTransaction: GetTransactionService,
    ) { }

    @Post()
    async create(
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() body: unknown,
        @Res({ passthrough: true }) res: Response,
    ) {
        if (!idempotencyKey || idempotencyKey.trim() === '' || idempotencyKey.length > 200) {
            throw new BadRequestException('Idempotency-Key header is required (max 200 chars)');
        }

        const data = (body ?? {}) as Record<string, unknown>;
        const money = (data.money ?? {}) as Record<string, unknown>;

        const walletId = this.readUuid(data.walletId, 'walletId');
        const playerId = this.readUuid(data.playerId, 'playerId');
        const providerId = this.readText(data.providerId, 'providerId');
        const externalTransactionId = this.readText(data.externalTransactionId, 'externalTransactionId');
        const roundId = this.readText(data.roundId, 'roundId');
        const gameId = this.readText(data.gameId, 'gameId');
        const amount = this.readText(money.amount, 'money.amount');
        const currency = this.readText(money.currency, 'money.currency');

        if (typeof data.kind !== 'string' || !ALLOWED_KINDS.includes(data.kind)) {
            throw new BadRequestException(`kind must be one of: ${ALLOWED_KINDS.join(', ')}`);
        }

        const reference =
            data.referenceExternalTransactionId === undefined
                ? undefined
                : this.readText(data.referenceExternalTransactionId, 'referenceExternalTransactionId');

        const result = await this.processTransaction.execute({
            idempotencyKey,
            providerId,
            externalTransactionId,
            walletId,
            playerId,
            roundId,
            gameId,
            kind: data.kind as Kind,
            money: { amount, currency },
            referenceExternalTransactionId: reference,
        });

        res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
        return result;
    }

    @Get()
    async findByExternalId(
        @Query('providerId') providerId?: string,
        @Query('externalTransactionId') externalTransactionId?: string,
    ) {
        if (!providerId || !externalTransactionId) {
            throw new BadRequestException('providerId and externalTransactionId are required');
        }
        const transaction = await this.getTransaction.findByExternalId(
            providerId,
            externalTransactionId,
        );
        if (!transaction) {
            throw new NotFoundException('Transaction not found');
        }
        return transaction;
    }

    @Get(':transactionId')
    async findOne(@Param('transactionId', new ParseUUIDPipe()) transactionId: string) {
        const transaction = await this.getTransaction.findById(transactionId);
        if (!transaction) {
            throw new NotFoundException('Transaction not found');
        }
        return transaction;
    }

    private readText(value: unknown, field: string): string {
        if (typeof value !== 'string' || value.trim() === '') {
            throw new BadRequestException(`${field} must be a non-empty string`);
        }
        return value;
    }

    private readUuid(value: unknown, field: string): string {
        if (typeof value !== 'string' || !UUID.test(value)) {
            throw new BadRequestException(`${field} must be a UUID`);
        }
        return value;
    }
}