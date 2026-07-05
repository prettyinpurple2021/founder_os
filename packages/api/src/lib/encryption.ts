import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const BASE64_32_BYTE_KEY_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/;

/**
 * Returns the validated 32-byte encryption key from the ENCRYPTION_KEY env variable.
 * Throws if the key is missing or not exactly 64 hex characters (32 bytes).
 */
function getKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. A 32-byte hex or base64-encoded key is required.',
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    return Buffer.from(encryptionKey, 'hex');
  }

  if (BASE64_32_BYTE_KEY_PATTERN.test(encryptionKey)) {
    const base64Key = Buffer.from(encryptionKey, 'base64');
    if (base64Key.length === 32 && base64Key.toString('base64') === encryptionKey) {
      return base64Key;
    }
  }

  throw new Error('ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.');
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 12-byte IV.
 * Returns a combined string in format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with encrypt().
 * Expects format: iv:authTag:ciphertext (all hex-encoded).
 * Throws if the data has been tampered with (GCM authentication failure).
 */
export function decrypt(encryptedString: string): string {
  const key = getKey();

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Decrypts the stored GitHub access token for a user.
 * Accepts any object with an accessToken field (e.g., Prisma User model).
 */
export function getDecryptedToken(user: { accessToken: string }): string {
  return decrypt(user.accessToken);
}
