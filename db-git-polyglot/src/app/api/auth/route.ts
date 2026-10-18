import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { hashPassword, verifyPassword, signToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth
 * Returns all registered users for demo switcher and collaborator invitations.
 */
export async function GET() {
  try {
    const result = await query(
      `SELECT user_id, username, email, system_role, created_at 
       FROM users 
       ORDER BY created_at ASC;`
    );
    return NextResponse.json({ success: true, users: result.rows });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth
 * Handles user registration and login.
 * Body: { action: 'register' | 'login', ... }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'register') {
      const { username, email, password, system_role = 'USER' } = body;

      if (!username || username.trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'Username must be at least 3 characters long' },
          { status: 400 }
        );
      }

      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!email || !emailRegex.test(email.trim())) {
        return NextResponse.json(
          { success: false, error: 'Invalid email address format' },
          { status: 400 }
        );
      }

      if (!password || password.length < 6) {
        return NextResponse.json(
          { success: false, error: 'Password must be at least 6 characters long' },
          { status: 400 }
        );
      }

      const validRole = system_role === 'ADMIN' ? 'ADMIN' : 'USER';
      const password_hash = await hashPassword(password);

      const result = await query(
        `INSERT INTO users (username, email, password_hash, system_role)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, username, email, system_role, created_at;`,
        [username.trim(), email.trim().toLowerCase(), password_hash, validRole]
      );

      const newUser = result.rows[0];
      const token = signToken({
        user_id: newUser.user_id,
        username: newUser.username,
        system_role: newUser.system_role,
      });

      const response = NextResponse.json(
        { success: true, user: newUser, token },
        { status: 201 }
      );

      // Set secure HTTP-only cookie
      response.cookies.set('dbgit_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });

      return response;
    } else if (action === 'login') {
      const { emailOrUsername, email, username, password } = body;
      const identifier = (emailOrUsername || email || username || '').trim();

      if (!identifier || !password) {
        return NextResponse.json(
          { success: false, error: 'Identifier (email/username) and password are required' },
          { status: 400 }
        );
      }

      const result = await query(
        `SELECT user_id, username, email, password_hash, system_role, created_at
         FROM users
         WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1);`,
        [identifier]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid email/username or password' },
          { status: 401 }
        );
      }

      const user = result.rows[0];
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Invalid email/username or password' },
          { status: 401 }
        );
      }

      const token = signToken({
        user_id: user.user_id,
        username: user.username,
        system_role: user.system_role,
      });

      const userResponse = {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        system_role: user.system_role,
        created_at: user.created_at,
      };

      const response = NextResponse.json(
        { success: true, user: userResponse, token },
        { status: 200 }
      );

      response.cookies.set('dbgit_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported action: '${action}'. Use 'register' or 'login'.` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Auth API error:', error);
    // PostgreSQL unique constraint violation code is 23505
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A user with this username or email already exists.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
