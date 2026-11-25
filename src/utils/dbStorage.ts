import { EMPTY_DATABASE, STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import type {
  AdminSettings,
  Department,
  FeverStatus,
  ReportFactor,
  SavedRoutine,
  StressFactor,
  StressReport,
  Student,
  StudentHealthDatabase,
  UserAccount,
  UserRole,
} from "../types";

const DB_STORAGE_KEY = "health_ai_monitoring_db_v4";
const ADMIN_SETTINGS_STORAGE_KEY = "health_ai_admin_settings_v1";
export const INITIAL_MAX_ADMINS = 1;
export const MAX_ADMINS_CEILING = 25;
export const DEFAULT_MAX_LOGIN_ATTEMPTS = 2;
export const MIN_LOGIN_ATTEMPTS = 1;
export const MAX_LOGIN_ATTEMPTS_CEILING = 10;

function isValidRole(role: unknown): role is UserRole {
  return role === "Admin" || role === "Student";
}

function isValidDepartment(item: unknown): item is Department {
  if (typeof item !== "object" || item === null) return false;
  const d = item as Record<string, unknown>;
  return (
    typeof d.dept_id === "string" &&
    d.dept_id.trim().length > 0 &&
    typeof d.dept_name === "string" &&
    d.dept_name.trim().length > 0 &&
    typeof d.building === "string"
  );
}

function isValidUser(item: unknown): item is UserAccount {
  if (typeof item !== "object" || item === null) return false;
  const u = item as Record<string, unknown>;
  return (
    typeof u.user_id === "string" &&
    u.user_id.trim().length > 0 &&
    typeof u.username === "string" &&
    u.username.trim().length > 0 &&
    typeof u.password_hash === "string" &&
    u.password_hash.trim().length > 0 &&
    isValidRole(u.role)
  );
}

function isValidStudent(item: unknown): item is Student {
  if (typeof item !== "object" || item === null) return false;
  const s = item as Record<string, unknown>;
  const nameVal =
    typeof s.name === "string" && s.name.trim().length > 0
      ? s.name.trim()
      : typeof s.full_name === "string"
        ? s.full_name.trim()
        : "";
  return (
    typeof s.student_id === "string" &&
    s.student_id.trim().length > 0 &&
    nameVal.length > 0 &&
    typeof s.class_section === "string" &&
    typeof s.roll_no === "string"
  );
}

function normalizeStudent(raw: Student): Student {
  const cleanName = (raw.name || raw.full_name || "").trim();
  const cleanDeptName =
    typeof raw.dept_name === "string" && raw.dept_name.trim() ? raw.dept_name.trim() : undefined;
  return {
    student_id: raw.student_id.trim(),
    dept_id: typeof raw.dept_id === "string" && raw.dept_id.trim() ? raw.dept_id.trim() : null,
    dept_name: cleanDeptName,
    user_id: typeof raw.user_id === "string" && raw.user_id.trim() ? raw.user_id.trim() : null,
    name: cleanName,
    full_name: cleanName,
    email: typeof raw.email === "string" ? raw.email.trim() : "",
    semester: typeof raw.semester === "string" && raw.semester.trim() ? raw.semester.trim() : "Sem 1",
    class_section: raw.class_section.trim(),
    roll_no: raw.roll_no.trim(),
    age: typeof raw.age === "number" && Number.isFinite(raw.age) ? raw.age : 19,
    created_at:
      typeof raw.created_at === "string" && raw.created_at.trim()
        ? raw.created_at.trim()
        : new Date().toISOString().slice(0, 10),
  };
}

function isValidStressReport(item: unknown): item is StressReport {
  if (typeof item !== "object" || item === null) return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.report_id === "string" &&
    r.report_id.trim().length > 0 &&
    typeof r.student_id === "string" &&
    r.student_id.trim().length > 0 &&
    typeof r.submission_date === "string" &&
    typeof r.stress_level === "number" &&
    Number.isFinite(r.stress_level) &&
    typeof r.remarks === "string"
  );
}

function normalizeStressReport(raw: StressReport): StressReport {
  const stressLevel = Math.min(10, Math.max(1, Math.round(raw.stress_level)));
  return {
    ...raw,
    report_id: raw.report_id.trim(),
    student_id: raw.student_id.trim(),
    stress_level: stressLevel,
    submission_date: raw.submission_date.trim() || new Date().toISOString().slice(0, 10),
    remarks: raw.remarks.trim(),
    sleep_hours:
      typeof raw.sleep_hours === "number" && Number.isFinite(raw.sleep_hours) ? raw.sleep_hours : 7.0,
    water_intake:
      typeof raw.water_intake === "number" && Number.isFinite(raw.water_intake)
        ? Math.round(raw.water_intake)
        : 6,
    wellness_index:
      typeof raw.wellness_index === "number" && Number.isFinite(raw.wellness_index)
        ? Math.min(100, Math.max(1, Math.round(raw.wellness_index)))
        : 70,
    ai_assessment: typeof raw.ai_assessment === "string" ? raw.ai_assessment : "",
  };
}

function isValidStressFactor(item: unknown): item is StressFactor {
  if (typeof item !== "object" || item === null) return false;
  const f = item as Record<string, unknown>;
  return (
    typeof f.factor_id === "string" &&
    f.factor_id.trim().length > 0 &&
    typeof f.factor_name === "string" &&
    f.factor_name.trim().length > 0 &&
    typeof f.description === "string"
  );
}

function isValidReportFactor(item: unknown): item is ReportFactor {
  if (typeof item !== "object" || item === null) return false;
  const rf = item as Record<string, unknown>;
  return (
    typeof rf.report_id === "string" &&
    rf.report_id.trim().length > 0 &&
    typeof rf.factor_id === "string" &&
    rf.factor_id.trim().length > 0
  );
}

function isValidRoutine(item: unknown): item is SavedRoutine {
  if (typeof item !== "object" || item === null) return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.routine_id === "string" &&
    r.routine_id.trim().length > 0 &&
    typeof r.student_id === "string" &&
    r.student_id.trim().length > 0 &&
    typeof r.title === "string" &&
    Array.isArray(r.blocks)
  );
}

export function enforceReferentialIntegrity(raw: Partial<StudentHealthDatabase>): StudentHealthDatabase {
  const deptMap = new Map<string, Department>();
  for (const d of Array.isArray(raw.departments) ? raw.departments : []) {
    if (isValidDepartment(d)) {
      const id = d.dept_id.trim();
      deptMap.set(id, {
        dept_id: id,
        dept_name: d.dept_name.trim(),
        building: d.building.trim(),
        created_at: d.created_at || new Date().toISOString().slice(0, 10),
      });
    }
  }

  const rawUsers = Array.isArray(raw.users) ? raw.users.filter(isValidUser) : [];
  const rawStudents = Array.isArray(raw.students) ? raw.students.filter(isValidStudent) : [];

  const studentIds = new Set(rawStudents.map((s) => s.student_id.trim()));
  const userMap = new Map<string, UserAccount>();
  for (const u of rawUsers) {
    const uid = u.user_id.trim();
    const linkedStu = u.student_id && studentIds.has(u.student_id.trim()) ? u.student_id.trim() : null;
    userMap.set(uid, {
      user_id: uid,
      student_id: linkedStu,
      username: u.username.trim(),
      display_name: typeof u.display_name === "string" && u.display_name.trim() ? u.display_name.trim() : undefined,
      password_hash: u.password_hash.trim(),
      role: u.role,
      created_at: u.created_at || new Date().toISOString().slice(0, 10),
    });
  }

  const studentMap = new Map<string, Student>();
  for (const s of rawStudents) {
    const normalized = normalizeStudent(s);
    normalized.dept_id =
      normalized.dept_id && deptMap.has(normalized.dept_id) ? normalized.dept_id : null;
    normalized.user_id =
      normalized.user_id && userMap.has(normalized.user_id) ? normalized.user_id : null;
    studentMap.set(normalized.student_id, normalized);
  }

  const validStudentIds = new Set(studentMap.keys());
  const reportMap = new Map<string, StressReport>();
  for (const r of Array.isArray(raw.stress_reports) ? raw.stress_reports : []) {
    if (isValidStressReport(r) && validStudentIds.has(r.student_id.trim())) {
      const normalized = normalizeStressReport(r);
      reportMap.set(normalized.report_id, normalized);
    }
  }

  const factorMap = new Map<string, StressFactor>();
  for (const f of Array.isArray(raw.stress_factors) ? raw.stress_factors : []) {
    if (isValidStressFactor(f)) {
      const fid = f.factor_id.trim();
      factorMap.set(fid, {
        factor_id: fid,
        factor_name: f.factor_name.trim(),
        description: f.description.trim(),
        created_at: f.created_at || new Date().toISOString().slice(0, 10),
      });
    }
  }

  const reportFactorKeys = new Set<string>();
  const report_factors: ReportFactor[] = [];
  for (const rf of Array.isArray(raw.report_factors) ? raw.report_factors : []) {
    if (isValidReportFactor(rf)) {
      const rid = rf.report_id.trim();
      const fid = rf.factor_id.trim();
      if (reportMap.has(rid) && factorMap.has(fid)) {
        const key = `${rid}::${fid}`;
        if (!reportFactorKeys.has(key)) {
          reportFactorKeys.add(key);
          report_factors.push({ report_id: rid, factor_id: fid });
        }
      }
    }
  }

  const saved_routines = Array.isArray(raw.saved_routines)
    ? raw.saved_routines.filter((rtn) => isValidRoutine(rtn) && validStudentIds.has(rtn.student_id))
    : [];

  return {
    departments: Array.from(deptMap.values()),
    users: Array.from(userMap.values()),
    students: Array.from(studentMap.values()),
    stress_reports: Array.from(reportMap.values()),
    stress_factors: Array.from(factorMap.values()),
    report_factors,
    saved_routines,
  };
}

export function loadDatabase(): StudentHealthDatabase {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return EMPTY_DATABASE;
    }
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      saveDatabase(EMPTY_DATABASE);
      return EMPTY_DATABASE;
    }
    const parsed = JSON.parse(raw) as Partial<StudentHealthDatabase>;
    if (!parsed || typeof parsed !== "object") {
      saveDatabase(EMPTY_DATABASE);
      return EMPTY_DATABASE;
    }
    const validated = enforceReferentialIntegrity(parsed);
    return validated;
  } catch {
    return EMPTY_DATABASE;
  }
}

export function saveDatabase(db: StudentHealthDatabase): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function normalizeAdminSettings(
  raw: Partial<AdminSettings> | null | undefined,
  currentAdminCount = 0
): AdminSettings {
  const minAllowedAdmins = Math.max(INITIAL_MAX_ADMINS, currentAdminCount);
  const rawMaxAdmins =
    typeof raw?.maxAdmins === "number" && Number.isFinite(raw.maxAdmins)
      ? Math.round(raw.maxAdmins)
      : INITIAL_MAX_ADMINS;
  const maxAdmins = Math.min(
    MAX_ADMINS_CEILING,
    Math.max(minAllowedAdmins, rawMaxAdmins)
  );

  const rawMaxAttempts =
    typeof raw?.maxLoginAttempts === "number" && Number.isFinite(raw.maxLoginAttempts)
      ? Math.round(raw.maxLoginAttempts)
      : DEFAULT_MAX_LOGIN_ATTEMPTS;
  const maxLoginAttempts = Math.min(
    MAX_LOGIN_ATTEMPTS_CEILING,
    Math.max(MIN_LOGIN_ATTEMPTS, rawMaxAttempts)
  );

  return { maxAdmins, maxLoginAttempts };
}

export function loadAdminSettings(currentAdminCount = 0): AdminSettings {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return normalizeAdminSettings(null, currentAdminCount);
    }
    const raw = window.localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY);
    if (!raw) {
      const defaults = normalizeAdminSettings(null, currentAdminCount);
      window.localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<AdminSettings>;
    return normalizeAdminSettings(parsed, currentAdminCount);
  } catch {
    return normalizeAdminSettings(null, currentAdminCount);
  }
}

export function saveAdminSettings(
  settings: Partial<AdminSettings>,
  currentAdminCount = 0
): AdminSettings {
  const normalized = normalizeAdminSettings(settings, currentAdminCount);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Ignore storage quota errors safely
  }
  return normalized;
}

export function resetAdminSettings(): AdminSettings {
  const defaults: AdminSettings = {
    maxAdmins: INITIAL_MAX_ADMINS,
    maxLoginAttempts: DEFAULT_MAX_LOGIN_ATTEMPTS,
  };
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
    }
  } catch {
    // Ignore storage errors
  }
  return defaults;
}

export function clearDatabase(): StudentHealthDatabase {
  saveDatabase(EMPTY_DATABASE);
  resetAdminSettings();
  return EMPTY_DATABASE;
}

export function validateAndRestoreBackup(jsonText: string): {
  ok: boolean;
  error?: string;
  db?: StudentHealthDatabase;
} {
  try {
    const parsed = JSON.parse(jsonText) as Partial<StudentHealthDatabase>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Backup file must be a JSON object with relational tables." };
    }
    const hasKnownKey =
      "departments" in parsed ||
      "users" in parsed ||
      "students" in parsed ||
      "stress_reports" in parsed ||
      "stress_factors" in parsed ||
      "report_factors" in parsed;
    if (!hasKnownKey) {
      return {
        ok: false,
        error: "Backup JSON does not contain recognized relational table keys.",
      };
    }
    const restored = enforceReferentialIntegrity(parsed);
    saveDatabase(restored);
    return { ok: true, db: restored };
  } catch {
    return { ok: false, error: "Invalid JSON syntax in backup file." };
  }
}

// Deterministic fallback hash for environments without crypto.subtle
function fallbackSaltedDigest(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}`;
}

export function validateStrongPassword(password: string): {
  valid: boolean;
  error?: string;
  checks: {
    minLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
} {
  const minLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);
  const valid = minLength && hasLetter && hasNumber && hasSymbol;
  let error: string | undefined;
  if (!minLength) {
    error = "Password must be at least 8 characters long.";
  } else if (!hasLetter || !hasNumber || !hasSymbol) {
    error = "Password must include letters, numbers, and at least one symbol (e.g., !@#$%).";
  }
  return {
    valid,
    error,
    checks: { minLength, hasLetter, hasNumber, hasSymbol },
  };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export async function hashPassword(rawPassword: string): Promise<string> {
  const clean = rawPassword.trim();
  const saltBytes = new Uint8Array(8);
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(saltBytes);
    } else {
      for (let i = 0; i < saltBytes.length; i++) {
        saltBytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const salt = Array.from(saltBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoded = new TextEncoder().encode(`${salt}:${clean}`);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      return `sha256$${salt}$${hex}`;
    }
    return `sha256$${salt}$${fallbackSaltedDigest(`${salt}:${clean}`)}`;
  } catch {
    const salt = Date.now().toString(16);
    return `sha256$${salt}$${fallbackSaltedDigest(`${salt}:${clean}`)}`;
  }
}

export async function verifyPassword(rawPassword: string, storedHash: string): Promise<boolean> {
  const clean = rawPassword.trim();
  if (!clean || !storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "sha256") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoded = new TextEncoder().encode(`${salt}:${clean}`);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      if (timingSafeStringEqual(hex, expectedHex)) return true;
    }
  } catch {
    // Fallback below if crypto.subtle is unavailable
  }

  const fallbackHex = fallbackSaltedDigest(`${salt}:${clean}`);
  return timingSafeStringEqual(fallbackHex, expectedHex);
}

export function getAdminCount(db: StudentHealthDatabase): number {
  return db.users.filter((u) => u.role === "Admin").length;
}

function generatePrefixedId(existingIds: string[], prefix: string, baseStart: number): string {
  let maxNum = baseStart;
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existingIds) {
    const match = regex.exec(id);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${maxNum + 1}`;
}

export function generateNextDeptId(departments: Department[]): string {
  return generatePrefixedId(
    departments.map((d) => d.dept_id),
    "DEPT",
    100
  );
}

export function generateNextUserId(users: UserAccount[]): string {
  return generatePrefixedId(
    users.map((u) => u.user_id),
    "USR",
    1000
  );
}

export function generateNextStudentId(students: Student[]): string {
  return generatePrefixedId(
    students.map((s) => s.student_id),
    "STU",
    1000
  );
}

export function generateNextReportId(reports: StressReport[]): string {
  return generatePrefixedId(
    reports.map((r) => r.report_id),
    "RPT",
    3000
  );
}

export function generateNextFactorId(factors: StressFactor[]): string {
  return generatePrefixedId(
    factors.map((f) => f.factor_id),
    "FAC",
    100
  );
}

export function generateNextRoutineId(routines: SavedRoutine[]): string {
  return generatePrefixedId(
    routines.map((r) => r.routine_id),
    "RTN",
    5000
  );
}

// --- Referential Integrity CRUD Helpers ---

export function insertDepartment(
  db: StudentHealthDatabase,
  input: { dept_name: string; building: string }
): { ok: boolean; error?: string; db: StudentHealthDatabase; department?: Department } {
  const deptName = input.dept_name.trim();
  const building = input.building.trim();
  if (!deptName) return { ok: false, error: "Department name is required.", db };
  if (!building) return { ok: false, error: "Building is required.", db };
  const duplicate = db.departments.some(
    (d) => d.dept_name.toLowerCase() === deptName.toLowerCase()
  );
  if (duplicate) {
    return { ok: false, error: `Department "${deptName}" already exists.`, db };
  }
  const department: Department = {
    dept_id: generateNextDeptId(db.departments),
    dept_name: deptName,
    building,
    created_at: new Date().toISOString().slice(0, 10),
  };
  return {
    ok: true,
    department,
    db: { ...db, departments: [...db.departments, department] },
  };
}

export function updateDepartment(
  db: StudentHealthDatabase,
  deptId: string,
  input: { dept_name: string; building: string }
): { ok: boolean; error?: string; db: StudentHealthDatabase } {
  const deptName = input.dept_name.trim();
  const building = input.building.trim();
  if (!deptName || !building) {
    return { ok: false, error: "Department name and building are required.", db };
  }
  const duplicate = db.departments.some(
    (d) => d.dept_id !== deptId && d.dept_name.toLowerCase() === deptName.toLowerCase()
  );
  if (duplicate) {
    return { ok: false, error: `Department "${deptName}" already exists.`, db };
  }
  return {
    ok: true,
    db: {
      ...db,
      departments: db.departments.map((d) =>
        d.dept_id === deptId ? { ...d, dept_name: deptName, building } : d
      ),
    },
  };
}

export function deleteDepartment(
  db: StudentHealthDatabase,
  deptId: string,
  cascadeUnlink = false
): { ok: boolean; error?: string; db: StudentHealthDatabase; linkedCount: number } {
  const linkedCount = db.students.filter((s) => s.dept_id === deptId).length;
  if (linkedCount > 0 && !cascadeUnlink) {
    return {
      ok: false,
      error: `Cannot delete ${deptId}: ${linkedCount} student(s) reference this department. Unlink students or confirm cascade.`,
      db,
      linkedCount,
    };
  }
  return {
    ok: true,
    linkedCount,
    db: {
      ...db,
      departments: db.departments.filter((d) => d.dept_id !== deptId),
      students: db.students.map((s) => (s.dept_id === deptId ? { ...s, dept_id: null } : s)),
    },
  };
}

export function insertUser(
  db: StudentHealthDatabase,
  input: {
    username: string;
    display_name?: string;
    password_hash: string;
    role: UserRole;
    student_id?: string | null;
  },
  maxAdminsLimit?: number
): { ok: boolean; error?: string; db: StudentHealthDatabase; user?: UserAccount } {
  const username = input.username.trim();
  const displayName = input.display_name?.trim() || undefined;
  if (!username) return { ok: false, error: "Username is required.", db };
  if (!input.password_hash) return { ok: false, error: "Password hash is required.", db };

  const adminCount = getAdminCount(db);
  const effectiveMaxAdmins =
    typeof maxAdminsLimit === "number" && Number.isFinite(maxAdminsLimit)
      ? Math.max(INITIAL_MAX_ADMINS, Math.round(maxAdminsLimit))
      : loadAdminSettings(adminCount).maxAdmins;

  if (input.role === "Admin" && adminCount >= effectiveMaxAdmins) {
    return {
      ok: false,
      error: `Maximum limit of ${effectiveMaxAdmins} admin account${effectiveMaxAdmins === 1 ? "" : "s"} reached.`,
      db,
    };
  }
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: `Username "${username}" already exists.`, db };
  }

  const studentId = input.student_id?.trim() || null;
  if (studentId && !db.students.some((s) => s.student_id === studentId)) {
    return { ok: false, error: `Foreign key error: student_id "${studentId}" does not exist.`, db };
  }
  if (studentId && db.users.some((u) => u.student_id === studentId)) {
    return {
      ok: false,
      error: `Student "${studentId}" is already linked to another user account (1:1 constraint).`,
      db,
    };
  }

  const user: UserAccount = {
    user_id: generateNextUserId(db.users),
    student_id: studentId,
    username,
    display_name: displayName,
    password_hash: input.password_hash,
    role: input.role,
    created_at: new Date().toISOString().slice(0, 10),
  };

  const nextStudents = studentId
    ? db.students.map((s) => (s.student_id === studentId ? { ...s, user_id: user.user_id } : s))
    : db.students;

  return {
    ok: true,
    user,
    db: { ...db, users: [...db.users, user], students: nextStudents },
  };
}

export function updateUser(
  db: StudentHealthDatabase,
  userId: string,
  input: {
    username: string;
    display_name?: string;
    role: UserRole;
    student_id?: string | null;
    password_hash?: string;
  },
  maxAdminsLimit?: number
): { ok: boolean; error?: string; db: StudentHealthDatabase } {
  const username = input.username.trim();
  if (!username) return { ok: false, error: "Username is required.", db };
  const currentUser = db.users.find((u) => u.user_id === userId);
  const adminCount = getAdminCount(db);
  const effectiveMaxAdmins =
    typeof maxAdminsLimit === "number" && Number.isFinite(maxAdminsLimit)
      ? Math.max(INITIAL_MAX_ADMINS, Math.round(maxAdminsLimit))
      : loadAdminSettings(adminCount).maxAdmins;

  if (
    input.role === "Admin" &&
    currentUser?.role !== "Admin" &&
    adminCount >= effectiveMaxAdmins
  ) {
    return {
      ok: false,
      error: `Maximum limit of ${effectiveMaxAdmins} admin account${effectiveMaxAdmins === 1 ? "" : "s"} reached.`,
      db,
    };
  }
  if (db.users.some((u) => u.user_id !== userId && u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: `Username "${username}" is already in use.`, db };
  }
  const studentId = input.student_id?.trim() || null;
  if (studentId && !db.students.some((s) => s.student_id === studentId)) {
    return { ok: false, error: `Foreign key error: student_id "${studentId}" does not exist.`, db };
  }
  if (studentId && db.users.some((u) => u.user_id !== userId && u.student_id === studentId)) {
    return {
      ok: false,
      error: `Student "${studentId}" is already linked to another user account.`,
      db,
    };
  }

  const nextUsers = db.users.map((u) =>
    u.user_id === userId
      ? {
          ...u,
          username,
          display_name:
            input.display_name !== undefined
              ? input.display_name.trim() || undefined
              : u.display_name,
          role: input.role,
          student_id: studentId,
          password_hash: input.password_hash || u.password_hash,
        }
      : u
  );

  const nextStudents = db.students.map((s) => {
    if (s.student_id === studentId) return { ...s, user_id: userId };
    if (s.user_id === userId && s.student_id !== studentId) return { ...s, user_id: null };
    return s;
  });

  return { ok: true, db: { ...db, users: nextUsers, students: nextStudents } };
}

export function deleteUser(
  db: StudentHealthDatabase,
  userId: string
): { ok: boolean; error?: string; db: StudentHealthDatabase } {
  return {
    ok: true,
    db: {
      ...db,
      users: db.users.filter((u) => u.user_id !== userId),
      students: db.students.map((s) => (s.user_id === userId ? { ...s, user_id: null } : s)),
    },
  };
}

export function insertStudent(
  db: StudentHealthDatabase,
  input: {
    name: string;
    email?: string;
    semester?: string;
    dept_id?: string | null;
    dept_name?: string;
    user_id?: string | null;
    class_section: string;
    roll_no: string;
    age: number;
  }
): { ok: boolean; error?: string; db: StudentHealthDatabase; student?: Student } {
  const cleanName = input.name.trim();
  const cleanSection = input.class_section.trim().toUpperCase();
  const cleanRoll = input.roll_no.trim();
  const cleanEmail = (input.email ?? "").trim();
  const cleanSemester = (input.semester ?? "Sem 1").trim() || "Sem 1";
  const deptId = input.dept_id?.trim() || null;
  const linkedDept = deptId ? db.departments.find((d) => d.dept_id === deptId) : undefined;
  const cleanDeptName = input.dept_name?.trim() || linkedDept?.dept_name || undefined;
  const userId = input.user_id?.trim() || null;

  if (!cleanName) return { ok: false, error: "Student name is required.", db };
  if (!cleanSection) return { ok: false, error: "Class section is required.", db };
  if (!cleanRoll) return { ok: false, error: "Roll number is required.", db };
  if (deptId && !db.departments.some((d) => d.dept_id === deptId)) {
    return { ok: false, error: `Foreign key error: department "${deptId}" does not exist.`, db };
  }
  if (userId && !db.users.some((u) => u.user_id === userId)) {
    return { ok: false, error: `Foreign key error: user "${userId}" does not exist.`, db };
  }

  const dupRoll = db.students.some(
    (s) =>
      s.class_section.toLowerCase() === cleanSection.toLowerCase() &&
      s.roll_no.toLowerCase() === cleanRoll.toLowerCase()
  );
  if (dupRoll) {
    return {
      ok: false,
      error: `Roll number ${cleanRoll} already exists in section ${cleanSection}.`,
      db,
    };
  }

  if (cleanEmail && db.students.some((s) => s.email.toLowerCase() === cleanEmail.toLowerCase())) {
    return { ok: false, error: `Email "${cleanEmail}" is already registered.`, db };
  }

  const student: Student = {
    student_id: generateNextStudentId(db.students),
    dept_id: deptId,
    dept_name: cleanDeptName,
    user_id: userId,
    name: cleanName,
    full_name: cleanName,
    email: cleanEmail,
    semester: cleanSemester,
    class_section: cleanSection,
    roll_no: cleanRoll,
    age: input.age,
    created_at: new Date().toISOString().slice(0, 10),
  };

  const nextUsers = userId
    ? db.users.map((u) => (u.user_id === userId ? { ...u, student_id: student.student_id } : u))
    : db.users;

  return {
    ok: true,
    student,
    db: { ...db, students: [...db.students, student], users: nextUsers },
  };
}

export function updateStudent(
  db: StudentHealthDatabase,
  studentId: string,
  input: {
    name: string;
    email?: string;
    semester?: string;
    dept_id?: string | null;
    dept_name?: string;
    class_section: string;
    roll_no: string;
    age: number;
  }
): { ok: boolean; error?: string; db: StudentHealthDatabase } {
  const cleanName = input.name.trim();
  const cleanSection = input.class_section.trim().toUpperCase();
  const cleanRoll = input.roll_no.trim();
  const cleanEmail = (input.email ?? "").trim();
  const cleanSemester = (input.semester ?? "Sem 1").trim() || "Sem 1";
  const deptId = input.dept_id?.trim() || null;
  const linkedDept = deptId ? db.departments.find((d) => d.dept_id === deptId) : undefined;
  const cleanDeptName = input.dept_name?.trim() || linkedDept?.dept_name || undefined;

  if (!cleanName || !cleanSection || !cleanRoll) {
    return { ok: false, error: "Name, class section, and roll number are required.", db };
  }
  if (deptId && !db.departments.some((d) => d.dept_id === deptId)) {
    return { ok: false, error: `Foreign key error: department "${deptId}" does not exist.`, db };
  }
  const dupRoll = db.students.some(
    (s) =>
      s.student_id !== studentId &&
      s.class_section.toLowerCase() === cleanSection.toLowerCase() &&
      s.roll_no.toLowerCase() === cleanRoll.toLowerCase()
  );
  if (dupRoll) {
    return {
      ok: false,
      error: `Roll number ${cleanRoll} already exists in section ${cleanSection}.`,
      db,
    };
  }
  if (
    cleanEmail &&
    db.students.some((s) => s.student_id !== studentId && s.email.toLowerCase() === cleanEmail.toLowerCase())
  ) {
    return { ok: false, error: `Email "${cleanEmail}" is already assigned to another student.`, db };
  }

  return {
    ok: true,
    db: {
      ...db,
      students: db.students.map((s) =>
        s.student_id === studentId
          ? {
              ...s,
              name: cleanName,
              full_name: cleanName,
              email: cleanEmail,
              semester: cleanSemester,
              dept_id: deptId,
              dept_name: cleanDeptName ?? s.dept_name,
              class_section: cleanSection,
              roll_no: cleanRoll,
              age: input.age,
            }
          : s
      ),
    },
  };
}

export function deleteStudent(
  db: StudentHealthDatabase,
  studentId: string
): { ok: boolean; db: StudentHealthDatabase; cascadedReports: number } {
  const removedReportIds = new Set(
    db.stress_reports.filter((r) => r.student_id === studentId).map((r) => r.report_id)
  );
  return {
    ok: true,
    cascadedReports: removedReportIds.size,
    db: {
      ...db,
      students: db.students.filter((s) => s.student_id !== studentId),
      users: db.users.map((u) => (u.student_id === studentId ? { ...u, student_id: null } : u)),
      stress_reports: db.stress_reports.filter((r) => r.student_id !== studentId),
      report_factors: db.report_factors.filter((rf) => !removedReportIds.has(rf.report_id)),
      saved_routines: db.saved_routines.filter((rtn) => rtn.student_id !== studentId),
    },
  };
}

export function insertStressFactor(
  db: StudentHealthDatabase,
  input: { factor_name: string; description: string }
): { ok: boolean; error?: string; db: StudentHealthDatabase; factor?: StressFactor } {
  const factorName = input.factor_name.trim();
  const description = input.description.trim();
  if (!factorName) return { ok: false, error: "Factor name is required.", db };
  if (db.stress_factors.some((f) => f.factor_name.toLowerCase() === factorName.toLowerCase())) {
    return { ok: false, error: `Stress factor "${factorName}" already exists.`, db };
  }
  const factor: StressFactor = {
    factor_id: generateNextFactorId(db.stress_factors),
    factor_name: factorName,
    description: description || `${factorName} contributing factor.`,
    created_at: new Date().toISOString().slice(0, 10),
  };
  return {
    ok: true,
    factor,
    db: { ...db, stress_factors: [...db.stress_factors, factor] },
  };
}

export function deleteStressFactor(
  db: StudentHealthDatabase,
  factorId: string,
  cascade = false
): { ok: boolean; error?: string; db: StudentHealthDatabase; refCount: number } {
  const refCount = db.report_factors.filter((rf) => rf.factor_id === factorId).length;
  if (refCount > 0 && !cascade) {
    return {
      ok: false,
      error: `Cannot delete ${factorId}: referenced by ${refCount} report_factors link(s). Confirm cascade delete to remove links.`,
      db,
      refCount,
    };
  }
  return {
    ok: true,
    refCount,
    db: {
      ...db,
      stress_factors: db.stress_factors.filter((f) => f.factor_id !== factorId),
      report_factors: db.report_factors.filter((rf) => rf.factor_id !== factorId),
    },
  };
}

export function insertStressReport(
  db: StudentHealthDatabase,
  input: Omit<StressReport, "report_id"> & { factorIds?: string[] }
): { ok: boolean; error?: string; db: StudentHealthDatabase; report?: StressReport } {
  if (!db.students.some((s) => s.student_id === input.student_id)) {
    return {
      ok: false,
      error: `Foreign key error: student_id "${input.student_id}" does not exist.`,
      db,
    };
  }

  const validFactorIds = new Set(db.stress_factors.map((f) => f.factor_id));
  const requestedFactors = Array.from(new Set(input.factorIds ?? []));
  for (const fid of requestedFactors) {
    if (!validFactorIds.has(fid)) {
      return {
        ok: false,
        error: `Foreign key error: factor_id "${fid}" does not exist in stress_factors.`,
        db,
      };
    }
  }

  const { factorIds: _unused, ...reportPayload } = input;
  const report: StressReport = normalizeStressReport({
    ...reportPayload,
    report_id: generateNextReportId(db.stress_reports),
  });

  const newBridgeRows: ReportFactor[] = requestedFactors.map((factor_id) => ({
    report_id: report.report_id,
    factor_id,
  }));

  return {
    ok: true,
    report,
    db: {
      ...db,
      stress_reports: [report, ...db.stress_reports],
      report_factors: [...db.report_factors, ...newBridgeRows],
    },
  };
}

export function updateStressReport(
  db: StudentHealthDatabase,
  reportId: string,
  updates: {
    stress_level: number;
    submission_date: string;
    remarks: string;
    sleep_hours?: number;
    water_intake?: number;
    temperature_f?: number | null;
    fever_status?: FeverStatus;
    factorIds?: string[];
  }
): { ok: boolean; error?: string; db: StudentHealthDatabase; report?: StressReport } {
  const existing = db.stress_reports.find((r) => r.report_id === reportId);
  if (!existing) {
    return { ok: false, error: `Report ${reportId} not found.`, db };
  }

  const validFactorIds = new Set(db.stress_factors.map((f) => f.factor_id));
  const requestedFactors =
    updates.factorIds !== undefined ? Array.from(new Set(updates.factorIds)) : null;

  if (requestedFactors) {
    for (const fid of requestedFactors) {
      if (!validFactorIds.has(fid)) {
        return {
          ok: false,
          error: `Foreign key error: factor_id "${fid}" does not exist.`,
          db,
        };
      }
    }
  }

  const sleepHours =
    typeof updates.sleep_hours === "number" && Number.isFinite(updates.sleep_hours)
      ? Math.min(18, Math.max(0, Math.round(updates.sleep_hours * 10) / 10))
      : existing.sleep_hours;
  const waterIntake =
    typeof updates.water_intake === "number" && Number.isFinite(updates.water_intake)
      ? Math.min(30, Math.max(0, Math.round(updates.water_intake)))
      : existing.water_intake;
  const stressLevel = Math.min(10, Math.max(1, Math.round(updates.stress_level)));
  const feverStatus = updates.fever_status ?? existing.fever_status ?? "None";
  const wellnessIndex = calculateDailyWellnessScore({
    sleepHours,
    waterIntake,
    stressScore: stressLevel,
    feverStatus,
    symptomCount: existing.symptoms?.length ?? 0,
  });

  const updatedReport: StressReport = {
    ...existing,
    stress_level: stressLevel,
    submission_date: updates.submission_date.trim() || existing.submission_date,
    remarks: updates.remarks.trim(),
    sleep_hours: sleepHours,
    water_intake: waterIntake,
    temperature_f:
      updates.temperature_f !== undefined ? updates.temperature_f : existing.temperature_f,
    fever_status: feverStatus,
    wellness_index: wellnessIndex,
    updated_at: new Date().toISOString().slice(0, 10),
  };

  const nextReportFactors =
    requestedFactors !== null
      ? [
          ...db.report_factors.filter((rf) => rf.report_id !== reportId),
          ...requestedFactors.map((factor_id) => ({ report_id: reportId, factor_id })),
        ]
      : db.report_factors;

  return {
    ok: true,
    report: updatedReport,
    db: {
      ...db,
      stress_reports: db.stress_reports.map((r) => (r.report_id === reportId ? updatedReport : r)),
      report_factors: nextReportFactors,
    },
  };
}

export function deleteStressReport(
  db: StudentHealthDatabase,
  reportId: string
): { ok: boolean; db: StudentHealthDatabase } {
  return {
    ok: true,
    db: {
      ...db,
      stress_reports: db.stress_reports.filter((r) => r.report_id !== reportId),
      report_factors: db.report_factors.filter((rf) => rf.report_id !== reportId),
    },
  };
}

export function getStressBand(score: number): "Low" | "Moderate" | "High" {
  if (score <= 3) return "Low";
  if (score <= 7) return "Moderate";
  return "High";
}

export function inferFeverStatusFromTemp(tempF: number | null | undefined): FeverStatus {
  if (typeof tempF !== "number" || !Number.isFinite(tempF)) return "None";
  if (tempF >= 102.3) return "High";
  if (tempF >= 100.5) return "Moderate";
  if (tempF >= 99.5) return "Mild";
  return "None";
}

export function calculateDailyWellnessScore(params: {
  sleepHours: number;
  waterIntake: number;
  stressScore: number;
  feverStatus: FeverStatus;
  symptomCount: number;
}): number {
  const sleepPts = Math.min(35, Math.round((params.sleepHours / 8) * 35));
  const waterPts = Math.min(25, Math.round((params.waterIntake / 8) * 25));
  const stressPts = Math.max(0, Math.round(((10 - params.stressScore) / 9) * 30));
  const basePts = Math.min(100, sleepPts + waterPts + stressPts + 10);

  const feverPenalty =
    params.feverStatus === "High"
      ? 24
      : params.feverStatus === "Moderate"
        ? 16
        : params.feverStatus === "Mild"
          ? 8
          : 0;
  const symptomPenalty = Math.min(16, params.symptomCount * 4);

  return Math.max(15, Math.min(100, basePts - feverPenalty - symptomPenalty));
}

export function buildDailyTrackerAssessment(params: {
  studentName: string;
  feverStatus: FeverStatus;
  temperatureF: number | null;
  sleepHours: number;
  waterIntake: number;
  stressScore: number;
  symptoms: string[];
}): { ai_assessment: string; actionable_tips: string[]; disclaimer: string } {
  const tempLabel =
    typeof params.temperatureF === "number" && Number.isFinite(params.temperatureF)
      ? `${params.temperatureF.toFixed(1)}°F (${(((params.temperatureF - 32) * 5) / 9).toFixed(1)}°C)`
      : "not measured";

  const symptomSummary =
    params.symptoms.length > 0 ? params.symptoms.join(", ") : "no acute symptoms reported";

  let statusLine = `Daily check-in logged for ${params.studentName}. Fever status: ${params.feverStatus} (Temp: ${tempLabel}). Symptoms: ${symptomSummary}.`;
  const tips: string[] = [];

  if (params.feverStatus === "High") {
    statusLine +=
      " Because a high fever is recorded, prioritize rest, alert a parent/guardian or campus clinic, and arrange an in-person doctor evaluation promptly—especially if fever persists or warning signs appear.";
    tips.push("Tell a parent/guardian or school nurse right away and consult a licensed doctor.");
    tips.push(
      "Rest in a cool, comfortable room and take small, steady sips of water or oral rehydration fluids."
    );
    tips.push("Avoid strenuous study/exercise and do not take unprescribed medications.");
  } else if (params.feverStatus === "Moderate" || params.feverStatus === "Mild") {
    statusLine +=
      " Prioritize rest, steady hydration, light nutritious meals, and re-checking temperature every few hours to monitor recovery.";
    tips.push("Rest away from heavy screen strain and monitor your temperature every 4–6 hours.");
    tips.push("Drink water, warm broth, or oral fluids steadily throughout the day.");
    tips.push("See a licensed doctor if fever crosses 102°F, lasts beyond 48 hours, or worsens.");
  } else {
    statusLine += ` Logged ${params.sleepHours.toFixed(1)}h sleep, ${params.waterIntake} glasses of water, and stress ${params.stressScore}/10.`;
    tips.push(
      params.sleepHours < 7
        ? "Aim for 7.5–8.5 hours of sleep tonight to support immune and academic recovery."
        : "Keep up your steady sleep routine."
    );
    tips.push(
      params.waterIntake < 6
        ? "Increase water intake toward 7–8 glasses spaced across the day."
        : "Maintain consistent daily hydration."
    );
    if (params.symptoms.length > 0) {
      tips.push("Monitor your logged symptoms and seek medical care if any discomfort escalates.");
    }
  }

  return {
    ai_assessment: statusLine,
    actionable_tips: tips,
    disclaimer: STANDARD_WELLNESS_DISCLAIMER,
  };
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
