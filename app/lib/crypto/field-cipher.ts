/**
 * Prisma Client Extension cho transparent field encryption.
 *
 * Cách dùng:
 *   import { db } from "@/lib/db"; // đã wrap extension - tự encrypt/decrypt
 *
 * Cấu hình mỗi model trong ENCRYPTION_MAP - không cần thay đổi schema field type
 * (vẫn là String/String? nhưng giá trị trong DB là ciphertext).
 *
 * Blind index fields:
 *   - email_bidx, phone_bidx (exact match - String? @unique)
 *   - citizenName_bidx (trigram - String[])
 *
 * KHÔNG encrypt cột:
 *   - id, createdAt, updatedAt, foreign keys (assigneeId, userId, ...)
 *   - status enum, role, department (cần query/filter)
 *   - các blind index columns (lưu hash để search)
 */
import { Prisma } from "@prisma/client";
import { encrypt, decrypt, isEncrypted } from "./envelope";
import { exactBidx, trigramBidx } from "./blind-index";

interface FieldConfig {
  encrypt: boolean;
  bidx?: "exact" | "trigram" | null;
  /** Cột blind index tương ứng (nếu bidx != null) */
  bidxColumn?: string;
}

/**
 * Map config: table → { field → config }.
 * BẬT/TẮT encryption từng field tại đây để dễ migrate dần.
 */
const ENC_CONFIG: Record<string, Record<string, FieldConfig>> = {
  user: {
    // email: exact bidx để login lookup. NOTE: nếu enable encrypt User.email cần migrate carefully + update Better Auth queries.
    // KHÔNG encrypt User.email trong phase này vì Better Auth dùng email làm key lookup nội bộ.
    phone: { encrypt: true, bidx: "exact", bidxColumn: "phoneBidx" },
    responsibilities: { encrypt: true },
  },
  iHanoiComplaint: {
    content: { encrypt: true },
    citizenName: { encrypt: true, bidx: "trigram", bidxColumn: "citizenNameBidx" },
    citizenPhone: { encrypt: true, bidx: "exact", bidxColumn: "citizenPhoneBidx" },
    citizenAddress: { encrypt: true },
    resolution: { encrypt: true },
  },
  tTHCRecord: {
    applicantName: { encrypt: true, bidx: "trigram", bidxColumn: "applicantNameBidx" },
    applicantPhone: { encrypt: true, bidx: "exact", bidxColumn: "applicantPhoneBidx" },
    notes: { encrypt: true },
  },
  taskNote: {
    content: { encrypt: true },
  },
  task: {
    description: { encrypt: true },
  },
  progressReport: {
    notes: { encrypt: true },
    blockers: { encrypt: true },
  },
  uBNDDirective: {
    content: { encrypt: true },
    phongResponse: { encrypt: true },
  },
  chatHistory: {
    question: { encrypt: true },
    answer: { encrypt: true },
  },
  notification: {
    message: { encrypt: true },
  },
  account: {
    accessToken: { encrypt: true },
    refreshToken: { encrypt: true },
    idToken: { encrypt: true },
  },
};

/** Pascal-case model name → camelCase table name dùng trong Prisma query API. */
function getModelName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Encrypt 1 record (in-place mutate data object). */
function encryptRecord(modelKey: string, data: any): any {
  const cfg = ENC_CONFIG[modelKey];
  if (!cfg || !data) return data;
  const out = { ...data };
  for (const [field, fc] of Object.entries(cfg)) {
    const v = out[field];
    if (typeof v !== "string" || v === "") continue;
    if (fc.encrypt && !isEncrypted(v)) {
      out[field] = encrypt(v, modelKey, field);
    }
    if (fc.bidx && fc.bidxColumn) {
      // Plain value gốc (trước encrypt) đã có ở v
      const plain = isEncrypted(v) ? null : v;
      if (plain) {
        if (fc.bidx === "exact") {
          out[fc.bidxColumn] = exactBidx(plain, modelKey, field);
        } else if (fc.bidx === "trigram") {
          out[fc.bidxColumn] = trigramBidx(plain, modelKey, field);
        }
      }
    }
  }
  return out;
}

/** Decrypt 1 record (return new object). */
function decryptRecord(modelKey: string, record: any): any {
  const cfg = ENC_CONFIG[modelKey];
  if (!cfg || !record) return record;
  const out: any = { ...record };
  for (const [field, fc] of Object.entries(cfg)) {
    if (!fc.encrypt) continue;
    const v = out[field];
    if (typeof v !== "string" || !v) continue;
    try {
      out[field] = decrypt(v, modelKey, field);
    } catch (e) {
      console.error(`[field-cipher] decrypt fail ${modelKey}.${field}:`, e);
      // Giữ ciphertext nếu decrypt fail - tránh crash UI
    }
  }
  return out;
}

/** Recursively decrypt nested includes (vd task.notes[], task.assignee). */
function decryptRecursive(record: any, modelKey: string): any {
  if (!record || typeof record !== "object") return record;
  let out = decryptRecord(modelKey, record);

  // Walk through known relation field names? Quá phức tạp.
  // → Cách đơn giản: chỉ decrypt cấp top-level. Caller dùng include thì các nested records
  // không được decrypt ở root extension - cần dùng db.<model>.findMany() riêng để decrypt.
  //
  // Tuy nhiên, hỗ trợ 1 mức nested cho common patterns:
  for (const key of Object.keys(out)) {
    const child = out[key];
    if (Array.isArray(child) && child.length > 0 && typeof child[0] === "object" && child[0]?.id) {
      // Heuristic: array of objects with id → likely a relation
      // Try to match by field name → model
      const childModel = guessModelFromRelation(key);
      if (childModel && ENC_CONFIG[childModel]) {
        out[key] = child.map((c) => decryptRecord(childModel, c));
      }
    } else if (child && typeof child === "object" && child.id && !Array.isArray(child)) {
      const childModel = guessModelFromRelation(key);
      if (childModel && ENC_CONFIG[childModel]) {
        out[key] = decryptRecord(childModel, child);
      }
    }
  }
  return out;
}

const RELATION_TO_MODEL: Record<string, string> = {
  assignee: "user",
  creator: "user",
  confirmedBy: "user",
  reporter: "user",
  author: "user",
  user: "user",
  handler: "user",
  uploadedBy: "user",
  admin: "user",
  updatedBy: "user",
  task: "task",
  notes: "taskNote",
  progressReports: "progressReport",
  // Add as needed
};

function guessModelFromRelation(field: string): string | null {
  return RELATION_TO_MODEL[field] || null;
}

/**
 * Tạo Prisma Client Extension cho field encryption.
 * Áp dụng cho create/update/upsert (encrypt) + findMany/findUnique/findFirst (decrypt).
 */
export const fieldCipherExtension = Prisma.defineExtension({
  name: "field-cipher",
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const key = getModelName(model);
        if (ENC_CONFIG[key] && args.data) {
          args.data = encryptRecord(key, args.data);
        }
        const result = await query(args);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async createMany({ model, args, query }) {
        const key = getModelName(model);
        if (ENC_CONFIG[key] && Array.isArray(args.data)) {
          args.data = args.data.map((d: any) => encryptRecord(key, d));
        } else if (ENC_CONFIG[key] && args.data) {
          args.data = encryptRecord(key, args.data);
        }
        return query(args);
      },
      async update({ model, args, query }) {
        const key = getModelName(model);
        if (ENC_CONFIG[key] && args.data) {
          args.data = encryptRecord(key, args.data);
        }
        const result = await query(args);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async updateMany({ model, args, query }) {
        const key = getModelName(model);
        if (ENC_CONFIG[key] && args.data) {
          args.data = encryptRecord(key, args.data);
        }
        return query(args);
      },
      async upsert({ model, args, query }) {
        const key = getModelName(model);
        if (ENC_CONFIG[key]) {
          if (args.create) args.create = encryptRecord(key, args.create);
          if (args.update) args.update = encryptRecord(key, args.update);
        }
        const result = await query(args);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async findUnique({ model, args, query }) {
        const result = await query(args);
        const key = getModelName(model);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async findFirst({ model, args, query }) {
        const result = await query(args);
        const key = getModelName(model);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async findFirstOrThrow({ model, args, query }) {
        const result = await query(args);
        const key = getModelName(model);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async findUniqueOrThrow({ model, args, query }) {
        const result = await query(args);
        const key = getModelName(model);
        return ENC_CONFIG[key] ? decryptRecursive(result, key) : result;
      },
      async findMany({ model, args, query }) {
        const result = await query(args);
        const key = getModelName(model);
        if (!ENC_CONFIG[key] || !Array.isArray(result)) return result;
        return result.map((r) => decryptRecursive(r, key));
      },
    },
  },
});

export { ENC_CONFIG };
