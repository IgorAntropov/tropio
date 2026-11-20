import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const scryptOptions = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
};
const dummyHash = `scrypt$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`;

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function csrfToken(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('tropio:csrf:v1').digest('base64url');
}

export function equalSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, scryptOptions, (error, result) => {
      if (error) {
        reject(error);
      }
      else {
        resolve(result);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function matchesPassword(password: string, encoded: string | undefined): Promise<boolean> {
  const supported = encoded !== undefined && /^scrypt\$[\w-]{22}\$[\w-]{43}$/.test(encoded);
  const [, salt = '', expected = ''] = (supported ? encoded : dummyHash).split('$');
  const actual = await derive(password, Buffer.from(salt, 'base64url'));
  return equalSecret(actual.toString('base64url'), expected) && supported;
}
