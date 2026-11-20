import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser, Public, SkipTenant } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser } from '../../common/types/auth.types';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: any, @Req() req: any) {
    return this.authService.register(body, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('login')
  login(@Body() body: any, @Req() req: any) {
    return this.authService.login(body, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }, @Req() req: any) {
    return this.authService.refresh(body?.refreshToken, req.ip);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sessionId, user.userId);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body?.email || '');
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body?.token, body?.newPassword);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: { currentPassword?: string; newPassword?: string }) {
    return this.authService.changePassword(user.userId, user.sessionId, body?.currentPassword || '', body?.newPassword || '');
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const organizations = await this.authService.getAuthorizedOrganizations(user.userId);
    return { user, organizations };
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupMfa(user.userId, user.email);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('mfa/verify')
  verifyMfa(@CurrentUser() user: AuthenticatedUser, @Body() body: { code: string }) {
    return this.authService.verifyMfaSetup(user.userId, body?.code || '');
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.userId, id);
  }
}
