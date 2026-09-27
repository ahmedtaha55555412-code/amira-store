/**
 * Amira Store — admin password hashing + policy (PHASE-03).
 *
 * - bcrypt (bcryptjs, pure JS — no native build step, safe on Vercel's Node.js
 *   runtime) with cost 12. bcrypt remains a maintained, well-studied password
 *   hashing choice for a single-admin application.
 * - Raw passwords NEVER leave this module's call sites: they are passed
 *   straight into hash/verify and are never logged, stored, or embedded in
 *   errors (PHASE-03 task 11 — no session/credential leakage).
 */

import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

/** Hash a plain-text password. Output format: bcrypt ($2b$…). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verify a plain-text password against a stored hash.
 * Malformed/unknown hash formats verify to `false` instead of throwing so a
 * corrupted row can never crash a login request.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * bcrypt hash of an unrelated random value. Public constant (NOT a secret):
 * it exists only to equalize CPU work when the submitted username does not
 * exist, so response timing cannot be used to enumerate accounts.
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$Kvq1Jf0Dbn91MoUacsiObevo6jO9ND76imngEaflS2ynnXCdrK6qm';

/**
 * Password policy for new passwords (bootstrap + change-password).
 * Returns human-readable Arabic issues; an empty array means the password is
 * acceptable. Policy: length ≥ 12 with upper-case, lower-case and digit.
 */
export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) {
    issues.push('يجب أن تتكون كلمة المرور من ١٢ حرفًا على الأقل.');
  }
  if (!/[a-z]/.test(password)) {
    issues.push('يجب أن تحتوي كلمة المرور على حرف لاتيني صغير واحد على الأقل.');
  }
  if (!/[A-Z]/.test(password)) {
    issues.push('يجب أن تحتوي كلمة المرور على حرف لاتيني كبير واحد على الأقل.');
  }
  if (!/[0-9]/.test(password)) {
    issues.push('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.');
  }
  return issues;
}

/**
 * Username policy for the single admin identity (bootstrap + change checks).
 * ASCII login identity by design (documented in DATA_DICTIONARY note for
 * PHASE-03): stable, URL/email-free, and free of confusing Unicode.
 */
export function usernameIssues(username: string): string[] {
  const issues: string[] = [];
  if (username.length < 3 || username.length > 64) {
    issues.push('اسم المستخدم يجب أن يكون بين ٣ و ٦٤ حرفًا.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    issues.push(
      'اسم المستخدم يقبل الحروف اللاتينية والأرقام والرموز (_ . -) فقط.',
    );
  }
  return issues;
}
