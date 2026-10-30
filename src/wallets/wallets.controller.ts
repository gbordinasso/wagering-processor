import { BadRequestException, Body, Controller, Post, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CreateWalletService, type CreateWalletResult } from './create-wallet.service.js';
import { GetWalletService } from './get-wallet.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateWalletBody {
    playerId?: unknown;
    initialBalance?: { amount?: unknown; currency?: unknown };
}

@Controller('wallets')
export class WalletsController {
    constructor(
        private readonly createWallet: CreateWalletService,
        private readonly getWallet: GetWalletService,
    ) { }

    @Post()
    async create(@Body() body: CreateWalletBody): Promise<CreateWalletResult> {
        const playerId = body?.playerId;
        const initialBalance = body?.initialBalance;

        if (typeof playerId !== 'string' || !UUID_PATTERN.test(playerId)) {
            throw new BadRequestException('playerId must be a UUID');
        }
        if (
            !initialBalance ||
            typeof initialBalance.amount !== 'string' ||
            typeof initialBalance.currency !== 'string'
        ) {
            throw new BadRequestException(
                'initialBalance must be { amount: string, currency: string }',
            );
        }

        return this.createWallet.execute({
            playerId,
            initialBalance: {
                amount: initialBalance.amount,
                currency: initialBalance.currency,
            },
        });
    }

    @Get(':walletId')
    async findOne(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
        return this.getWallet.execute(walletId);
    }
}