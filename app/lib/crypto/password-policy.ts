/**
 * Password policy cho hệ thống công vụ:
 *  - Min 12 ký tự (TT 23/2023/TT-BTTTT cấp độ 2-3)
 *  - Phức tạp: 3 trong 4 (upper, lower, digit, special)
 *  - Không trùng email/tên user (substring 4+ ký tự)
 *  - Không nằm trong top-100 common passwords
 *  - Không trùng 5 password gần nhất (check ở caller qua PasswordHistory)
 */

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "qwerty", "abc123", "password1",
  "admin", "letmein", "welcome", "monkey", "dragon", "master", "iloveyou",
  "trustno1", "sunshine", "princess", "football", "baseball", "shadow",
  "michael", "ninja", "mustang", "access", "matrix", "passw0rd", "p@ssw0rd",
  "tranphukinhte", "phongkinhte", "tranphu2026", "kinhte2026", "vietnam",
  "hanoi2026", "ubndtranphu", "matkhau", "123123123", "qwerty12345",
  "Password1", "Password123", "Admin123", "Welcome1", "Qwerty123",
  "p@ssword", "P@ssw0rd!", "Password!", "1q2w3e4r", "1qaz2wsx", "zaq12wsx",
  "111111111", "000000000", "987654321", "asdfghjkl", "qazwsxedc",
]);

export interface PasswordCheckResult {
  ok: boolean;
  errors: string[];
  /** Điểm 0-4: 0=rất yếu, 4=rất mạnh */
  strength: number;
}

export interface PasswordCheckContext {
  email?: string | null;
  name?: string | null;
  /** Lịch sử hash gần nhất (5 gần nhất) - kiểm tra trùng bằng verifyPassword ở caller */
  previousHashes?: string[];
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MAX_AGE_DAYS = 180;
export const PASSWORD_HISTORY_KEEP = 5;

/**
 * Validate password đạt policy.
 * KHÔNG check trùng password cũ ở đây (cần async verify); caller làm riêng.
 */
export function checkPasswordStrength(
  password: string,
  ctx: PasswordCheckContext = {}
): PasswordCheckResult {
  const errors: string[] = [];

  if (!password) {
    errors.push("Mật khẩu không được để trống");
    return { ok: false, errors, strength: 0 };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`);
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const complexityCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  if (complexityCount < 3) {
    errors.push(
      "Mật khẩu phải có ít nhất 3 loại ký tự: chữ hoa, chữ thường, chữ số, ký tự đặc biệt"
    );
  }

  // Check common password (case-insensitive, cả chuỗi và substring chính)
  const pwLower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(pwLower)) {
    errors.push("Mật khẩu này quá phổ biến, vui lòng chọn mật khẩu khác");
  } else {
    // Pattern "password+digits" hoặc "admin+digits" cũng phổ biến
    const weakRoots = ["password", "passw0rd", "admin", "welcome", "qwerty", "matkhau", "kinhte", "tranphu"];
    for (const root of weakRoots) {
      if (pwLower.includes(root) && password.length <= 14) {
        errors.push(`Mật khẩu chứa từ phổ biến "${root}" → quá dễ đoán`);
        break;
      }
    }
  }

  // Repeated chars (aaaaa, 11111)
  if (/(.)\1{4,}/.test(password)) {
    errors.push("Mật khẩu không được lặp lại 1 ký tự quá 4 lần");
  }

  // Sequential (123456, abcdef)
  if (hasSequential(password)) {
    errors.push("Mật khẩu không được chứa chuỗi liên tiếp dài (vd: 12345, abcde)");
  }

  // Trùng email/tên
  if (ctx.email) {
    const local = ctx.email.split("@")[0].toLowerCase();
    if (local.length >= 4 && pwLower.includes(local)) {
      errors.push("Mật khẩu không được chứa phần email của bạn");
    }
  }
  if (ctx.name) {
    // Tokenize name: tách từng từ, check từng token >= 4 ký tự
    const tokens = removeAccents(ctx.name)
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const t of tokens) {
      if (pwLower.includes(t)) {
        errors.push("Mật khẩu không được chứa tên của bạn");
        break;
      }
    }
  }

  // Strength score
  let strength = 0;
  if (password.length >= 12) strength++;
  if (password.length >= 16) strength++;
  if (complexityCount >= 3) strength++;
  if (complexityCount === 4 && password.length >= 14) strength++;

  return { ok: errors.length === 0, errors, strength };
}

function hasSequential(pw: string): boolean {
  const seqs = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const lower = pw.toLowerCase();
  for (const seq of seqs) {
    for (let i = 0; i <= seq.length - 5; i++) {
      const chunk = seq.slice(i, i + 5);
      if (lower.includes(chunk) || lower.includes(chunk.split("").reverse().join(""))) {
        return true;
      }
    }
  }
  return false;
}

function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Kiểm tra mật khẩu có hết hạn không (qua field passwordChangedAt) */
export function isPasswordExpired(passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false; // Chưa có timestamp → không enforce
  const ageMs = Date.now() - new Date(passwordChangedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > PASSWORD_MAX_AGE_DAYS;
}
