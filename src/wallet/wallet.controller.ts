import { Controller, Get, Param, Post, Body, Query, Request, UseGuards, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetTransactionsDto } from './dto/transaction.dto';
import { CreateDepositRequestDto } from './dto/deposit-request.dto';
import { CreateWithdrawalRequestDto } from './dto/withdrawal-request.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    // Get balance for the logged-in user
    @Get('my-balance')
    async getMyBalance(@Request() req) {
        const balance = await this.walletService.getBalance(req.user.userId);
        return { balance };
    }

    // Add balance (top-up) for the logged-in user
    @Post('add-balance')
    @UseInterceptors(FileInterceptor('paymentScreenshot'))
    async addBalance(
        @Request() req,
        @Body() body: CreateDepositRequestDto,
        @UploadedFile() paymentScreenshot?: Express.Multer.File,
    ) {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount must be greater than 0');
        }
        if (amount > 100000) {
            throw new BadRequestException('Maximum top-up amount is PKR 1,00,000');
        }
        const request = await this.walletService.createDepositRequest(req.user.userId, { ...body, amount: String(amount) }, paymentScreenshot);
        return {
            message: 'Payment submitted successfully. Admin will review and add the amount after approval.',
            request,
        };
    }

    @Get('deposit-requests/my')
    async getMyDepositRequests(@Request() req) {
        return this.walletService.getMyDepositRequests(req.user.userId);
    }

    @Post('withdrawal-requests')
    async createWithdrawalRequest(@Request() req, @Body() body: CreateWithdrawalRequestDto) {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount must be greater than 0');
        }
        const request = await this.walletService.createWithdrawalRequest(req.user.userId, { ...body, amount: String(amount) });
        return {
            message: 'Withdrawal request submitted. Admin will process the payout manually.',
            request,
        };
    }

    @Get('withdrawal-requests/my')
    async getMyWithdrawalRequests(@Request() req) {
        return this.walletService.getMyWithdrawalRequests(req.user.userId);
    }

    // Get transactions for logged-in user
    @Get('my-transactions')
    async getMyTransactions(@Request() req, @Query() query: GetTransactionsDto) {
        return await this.walletService.getTransactions(req.user.userId, query);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get('deposit-requests/pending')
    async getPendingDepositRequests() {
        return this.walletService.getPendingDepositRequests();
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post('deposit-requests/:requestId/approve')
    async approveDepositRequest(@Request() req, @Param('requestId') requestId: string) {
        return this.walletService.approveDepositRequest(requestId, req.user.userId);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post('deposit-requests/:requestId/reject')
    async rejectDepositRequest(
        @Request() req,
        @Param('requestId') requestId: string,
        @Body() body: { reason?: string },
    ) {
        return this.walletService.rejectDepositRequest(requestId, req.user.userId, body.reason);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get('withdrawal-requests/pending')
    async getPendingWithdrawalRequests() {
        return this.walletService.getPendingWithdrawalRequests();
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post('withdrawal-requests/:requestId/mark-paid')
    async markWithdrawalPaid(@Request() req, @Param('requestId') requestId: string, @Body() body: { note?: string }) {
        return this.walletService.markWithdrawalPaid(requestId, req.user.userId, body.note);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post('withdrawal-requests/:requestId/reject')
    async rejectWithdrawalRequest(@Request() req, @Param('requestId') requestId: string, @Body() body: { reason?: string }) {
        return this.walletService.rejectWithdrawalRequest(requestId, req.user.userId, body.reason);
    }

    // Admin-only routes
    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get(':userId/balance')
    async getBalance(@Param('userId') userId: string) {
        return await this.walletService.getBalance(userId);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post(':userId/credit/:amount')
    async credit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.credit(userId, amount);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Post(':userId/debit/:amount')
    async debit(@Param('userId') userId: string, @Param('amount') amount: number) {
        return await this.walletService.debit(userId, amount);
    }

    @UseGuards(RolesGuard)
    @Roles('admin')
    @Get(':userId/transactions')
    async getTransactions(@Param('userId') userId: string, @Query() query: GetTransactionsDto) {
        return await this.walletService.getTransactions(userId, query);
    }
}
