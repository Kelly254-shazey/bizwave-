import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { envConfig } from '../config/env.config';
import { IS_PUBLIC_KEY } from '../common/decorators/auth.decorators';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../common/types/auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = authHeader.slice(7).trim();

    let payload: any;
    try {
      payload = jwt.verify(token, envConfig.jwtSecret);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }

    if (payload.type !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    // Verify active non-revoked session in PostgreSQL
    const sessionRes = await this.db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin, u.preferred_language, u.status,
              s.id AS session_id, s.revoked_at, s.expires_at
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND u.id = $2`,
      [payload.sid, payload.sub],
    );

    if (sessionRes.rowCount === 0) {
      throw new UnauthorizedException('Session not found');
    }
    const row = sessionRes.rows[0];
    if (row.revoked_at || new Date(row.expires_at) < new Date() || row.status !== 'active') {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    const user: AuthenticatedUser = {
      userId: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      sessionId: row.session_id,
      isPlatformAdmin: Boolean(row.is_platform_admin),
      preferredLanguage: row.preferred_language === 'sw' ? 'sw' : 'en',
    };
    req.user = user;
    return true;
  }
}
