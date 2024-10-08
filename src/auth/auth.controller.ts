import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Request,
    Response,
    UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { GetCurrentUser, GetCurrentUserId, Public } from '../common/decorators'
import { AtGuard } from '../common/guards'
import { AuthService } from './auth.service'
import { SigninDto, SignupDto } from './dto'
import { GoogleOAuthGuard } from './google-oauth.guard'
import { Tokens } from './types'
import { TokensResponse } from './types/tokensResponse.type'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Public()
    @Get('google/login')
    @UseGuards(GoogleOAuthGuard)
    async googleAuth() {
        return { msg: 'Google Authentication' }
    }

    @Public()
    @Get('google-redirect')
    @UseGuards(GoogleOAuthGuard)
    async googleAuthRedirect(@Request() req, @Response() res) {
        const token = req.user
        return res.redirect(`http://localhost:5173/login/?access_token=${token.access_token}&refresh_token=${token.refresh_token}`)
    }

    @Public()
    @Post('local/signup')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Sign up' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'User successfully signed up',
        type: TokensResponse,
    })
    @ApiResponse({
        status: HttpStatus.FORBIDDEN,
        description: 'Credentials incorrect',
    })
    signupLocal(@Body() dto: SignupDto): Promise<Tokens> {
        return this.authService.signupLocal(dto)
    }

    @Public()
    @Post('local/signin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Sign in' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'User successfully signed in',
        type: TokensResponse,
    })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    signinLocal(@Body() dto: SigninDto): Promise<Tokens> {
        return this.authService.signinLocal(dto)
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Log out' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'User successfully logged out',
    })
    logout(@GetCurrentUserId() userId: string): Promise<boolean> {
        return this.authService.logout(userId)
    }

    @Public()
    // @UseGuards(RtGuard)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refresh tokens' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Tokens successfully refreshed',
        type: TokensResponse,
    })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    refreshTokens(
        @Body('userId') userId: string,
        @Body('refreshToken') refreshToken: string,
    ): Promise<Tokens> {
        return this.authService.refreshTokens(userId, refreshToken)
    }

    @UseGuards(AtGuard)
    @Get('local/getCurrentUser')
    getMe(
        @GetCurrentUser()
        user: {
            userId: string
            role: string
        },
    ) {
        return this.authService.getUserById(user.userId)
    }


}
