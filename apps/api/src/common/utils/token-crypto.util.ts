import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// OAuthのリフレッシュトークン等をDBへ保存する際の暗号化(AES-256-GCM)。
// 鍵は GOOGLE_TOKEN_ENCRYPTION_KEY(なければ ENCRYPTION_KEY)。長さが32バイトでなくても
// SHA-256で正規化して使う。

function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'insecure-dev-key';
  return createHash('sha256').update(raw).digest();
}

/** 平文 -> "iv:tag:ciphertext"(base64) */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** encryptToken の逆。壊れている/復号できない場合は null。 */
export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
