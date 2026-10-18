import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'pesu_dbms_level3_polyglot_secret_2026';

export interface UserTokenPayload {
  user_id: string;
  username: string;
  system_role: string;
}

/**
 * Hashes a plaintext password with bcrypt using salt work factor of 12.
 * @param password Plaintext password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 * @param password Plaintext password
 * @param hash Stored bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a JWT token containing user identity and system role with process.env.JWT_SECRET.
 * @param payload Object containing user_id, username, and system_role
 */
export function signToken(payload: { user_id: string; username: string; system_role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verifies and decodes a JWT token using process.env.JWT_SECRET.
 * Returns decoded payload if valid, or null if invalid/expired.
 * @param token JWT string
 */
export function verifyToken(token: string): { user_id: string; username: string; system_role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { user_id: string; username: string; system_role: string };
  } catch {
    return null;
  }
}
