/**
 * WOC SSO 验证模块 — 新增文件 panel/server/src/sso.ts
 *
 * 将此文件放入 fork 后的 WechatOnCloud/panel/server/src/ 目录。
 * 独立模块设计，减少对 index.ts 的侵入性修改，便于后续合并上游更新。
 *
 * 功能：验证主项目签发的 HMAC-SHA256 SSO token，自动创建/同步用户并建立会话。
 */
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { findByUsername, createSub, publicUser, type User } from './store.js';
import { createSession, SESSION_TTL_MS } from './sessions.js';

const SSO_SECRET = process.env.WOC_SSO_SECRET || '';
const SSO_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 分钟

// 已使用的 token（防重放）
const usedTokens = new Set<string>();
setInterval(() => { if (usedTokens.size > 500) usedTokens.clear(); }, 10 * 60 * 1000);

interface SsoPayload {
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  ts: number;
}

/**
 * 验证 SSO token
 * 格式：base64url(payload).timestamp.signature
 */
export function verifySsoToken(token: string): SsoPayload | null {
  if (!SSO_SECRET) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [payloadStr, ts, sig] = parts;

    // 验证 HMAC 签名
    const data = `${payloadStr}.${ts}`;
    const expectedSig = createHmac('sha256', SSO_SECRET).update(data).digest('base64url');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    // 验证时间戳
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > SSO_TOKEN_TTL_MS) return null;

    // 防重放
    if (usedTokens.has(token)) return null;
    usedTokens.add(token);

    // 解析 payload
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString()) as SsoPayload;
    if (!payload.username || typeof payload.username !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * SSO 登录处理：验证 token → 查找/创建用户 → 建立会话
 * 返回 session token（用于设置 cookie）和用户公开信息
 */
export function handleSsoLogin(token: string): { sessionToken: string; user: ReturnType<typeof publicUser> } | { error: string; code: number } {
  if (!SSO_SECRET) {
    return { error: 'SSO not configured', code: 503 };
  }

  const payload = verifySsoToken(token);
  if (!payload) {
    return { error: 'SSO token invalid or expired', code: 401 };
  }

  // 查找用户
  let user: User | undefined = findByUsername(payload.username);

  if (!user) {
    if (payload.role === 'admin') {
      // admin 用户应该已存在（WOC 初始化时创建），如果不存在则报错
      return { error: 'Admin account not found in WOC', code: 404 };
    }
    // 自动创建子账号（JIT provisioning）
    const randomPwd = randomBytes(16).toString('hex');
    try {
      user = createSub(payload.username, randomPwd, []) as any;
      console.log(`[SSO] 自动创建子账号: ${payload.username}`);
    } catch (e: any) {
      return { error: `Failed to create user: ${e.message}`, code: 500 };
    }
  }

  if ((user as any).disabled) {
    return { error: '账户已禁用', code: 403 };
  }

  // 建立会话
  const sessionToken = createSession((user as any).id);
  return { sessionToken, user: publicUser(user as any) };
}

export { SESSION_TTL_MS };
