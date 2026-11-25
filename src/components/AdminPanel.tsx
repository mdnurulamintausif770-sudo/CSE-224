import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  Droplets,
  Edit3,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Thermometer,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import type {
  AdminGuardState,
  AdminSettings,
  Department,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
  UserAccount,
} from "../types";
import {
  fetchAdminGuardStatus,
  formatRemainingCooldown,
  getLocalGuardSnapshot,
  recordAdminGuardEvent,
  resetAllAdminLocks,
  syncAdminAttemptThreshold,
} from "../utils/adminGuard";
import {
  INITIAL_MAX_ADMINS,
  MAX_ADMINS_CEILING,
  MAX_LOGIN_ATTEMPTS_CEILING,
  MIN_LOGIN_ATTEMPTS,
  getStressBand,
  hashPassword,
  validateStrongPassword,
  verifyPassword,
} from "../utils/dbStorage";
import { isCancelledError } from "../utils/safeFetch";

interface AdminPanelProps {
  students: Student[];
  reports: StressReport[];
  departments: Department[];
  stressFactors: StressFactor[];
  reportFactors: ReportFactor[];
  users: UserAccount[];
  authenticatedAdmin: UserAccount | null;
  adminSettings: AdminSettings;
  onUpdateAdminSettings: (next: Partial<AdminSettings>) => {
    ok: boolean;
    error?: string;
    settings: AdminSettings;
  };
  onRegisterAdmin: (input: {
    username: string;
    display_name: string;
    password_hash: string;
  }) => { ok: boolean; error?: string; user?: UserAccount };
  onUpdateAdminAccount: (
    userId: string,
    input: {
      username: string;
      display_name?: string;
      password_hash?: string;
    }
  ) => { ok: boolean; error?: string };
  onDeleteAdminAccount: (userId: string) => { ok: boolean; error?: string };
  onLoginAdmin: (admin: UserAccount) => void;
  onLogoutAdmin: () => void;
  onSwitchToStudent: () => void;
}

export function AdminPanel({
  students,
  reports,
  departments,
  stressFactors,
  reportFactors,
  users,
  authenticatedAdmin,
  adminSettings,
  onUpdateAdminSettings,
  onRegisterAdmin,
  onUpdateAdminAccount,
  onDeleteAdminAccount,
  onLoginAdmin,
  onLogoutAdmin,
  onSwitchToStudent,
}: AdminPanelProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const settingsSectionRef = useRef<HTMLElement | null>(null);

  const adminAccounts = useMemo(
    () => users.filter((u) => u.role === "Admin"),
    [users]
  );
  const adminCount = adminAccounts.length;
  const maxAdmins = adminSettings.maxAdmins;
  const maxAttempts = adminSettings.maxLoginAttempts;
  const isMaxAdminsReached = adminCount >= maxAdmins;

  const [authMode, setAuthMode] = useState<"login" | "signup">(() =>
    adminAccounts.length === 0 ? "signup" : "login"
  );
  const [guardState, setGuardState] = useState<AdminGuardState>(() =>
    getLocalGuardSnapshot(maxAttempts)
  );

  // Public Sign Up state
  const [signupDisplayName, setSignupDisplayName] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [showSignupPwd, setShowSignupPwd] = useState(false);

  // Login state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  const [authBusy, setAuthBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{
    type: "error" | "success" | "warning";
    text: string;
  } | null>(null);

  // Admin Settings & Management state (when unlocked)
  const [limitInput, setLimitInput] = useState<number>(adminSettings.maxAdmins);
  const [attemptThresholdInput, setAttemptThresholdInput] = useState<number>(
    adminSettings.maxLoginAttempts
  );

  // Dedicated Grant / Add Admin form state
  const [grantDisplayName, setGrantDisplayName] = useState("");
  const [grantUsername, setGrantUsername] = useState("");
  const [grantPassword, setGrantPassword] = useState("");
  const [grantConfirm, setGrantConfirm] = useState("");
  const [showGrantPwd, setShowGrantPwd] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);

  // Inline Edit / Password Reset state per admin user
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [resetPwdAdminId, setResetPwdAdminId] = useState<string | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState("");
  const [resetPwdConfirm, setResetPwdConfirm] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);

  const [mgmtFeedback, setMgmtFeedback] = useState<{
    type: "error" | "success" | "warning";
    text: string;
  } | null>(null);

  useEffect(() => {
    setLimitInput(adminSettings.maxAdmins);
    setAttemptThresholdInput(adminSettings.maxLoginAttempts);
  }, [adminSettings.maxAdmins, adminSettings.maxLoginAttempts]);

  // Sync IP & attempt status safely on mount / threshold change
  useEffect(() => {
    const controller = new AbortController();
    fetchAdminGuardStatus(controller.signal, maxAttempts)
      .then((state) => {
        setGuardState(state);
      })
      .catch((err: unknown) => {
        if (!isCancelledError(err)) {
          setGuardState(getLocalGuardSnapshot(maxAttempts));
        }
      });
    return () => controller.abort();
  }, [maxAttempts]);

  // Countdown tick while IP/client lock is active
  useEffect(() => {
    if (!guardState.isBlocked || !guardState.blockedUntil) return;
    const blockedUntilMs = guardState.blockedUntil;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.ceil((blockedUntilMs - now) / 1000);
      if (remaining <= 0) {
        window.clearInterval(timer);
        fetchAdminGuardStatus(undefined, maxAttempts)
          .then(setGuardState)
          .catch(() => setGuardState(getLocalGuardSnapshot(maxAttempts)));
      } else {
        setGuardState((prev) => ({
          ...prev,
          remainingSeconds: remaining,
        }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guardState.isBlocked, guardState.blockedUntil, maxAttempts]);

  // If all admin accounts were cleared/deleted while locked, switch to signup mode cleanly
  useEffect(() => {
    if (!authenticatedAdmin && adminCount === 0 && authMode === "login") {
      setAuthMode("signup");
    }
  }, [authenticatedAdmin, adminCount, authMode]);

  const passwordStrength = useMemo(
    () => validateStrongPassword(signupPassword),
    [signupPassword]
  );

  const grantPasswordStrength = useMemo(
    () => validateStrongPassword(grantPassword),
    [grantPassword]
  );

  const resetPasswordStrength = useMemo(
    () => validateStrongPassword(resetPwdValue),
    [resetPwdValue]
  );

  const deptMap = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of departments) map.set(d.dept_id, d);
    return map;
  }, [departments]);

  const factorMap = useMemo(() => {
    const map = new Map<string, StressFactor>();
    for (const f of stressFactors) map.set(f.factor_id, f);
    return map;
  }, [stressFactors]);

  const reportFactorsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rf of reportFactors) {
      const f = factorMap.get(rf.factor_id);
      if (!f) continue;
      const list = map.get(rf.report_id) ?? [];
      list.push(f.factor_name);
      map.set(rf.report_id, list);
    }
    return map;
  }, [reportFactors, factorMap]);

  const highStressAlertsCount = useMemo(
    () => reports.filter((r) => r.stress_level >= 8).length,
    [reports]
  );

  const selectedStudent = useMemo(
    () => students.find((s) => s.student_id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const selectedStudentDept = useMemo(() => {
    if (!selectedStudent?.dept_id) return null;
    return deptMap.get(selectedStudent.dept_id) ?? null;
  }, [selectedStudent, deptMap]);

  const selectedStudentHistory = useMemo(() => {
    if (!selectedStudent) return [];
    return reports
      .filter((r) => r.student_id === selectedStudent.student_id)
      .sort(
        (a, b) =>
          b.submission_date.localeCompare(a.submission_date) ||
          b.report_id.localeCompare(a.report_id)
      );
  }, [reports, selectedStudent]);

  const studentProblemSummary = useMemo(() => {
    if (!selectedStudent || selectedStudentHistory.length === 0) {
      return null;
    }

    const latest = selectedStudentHistory[0];
    const peakStress = Math.max(...selectedStudentHistory.map((r) => r.stress_level));
    const avgStress = (
      selectedStudentHistory.reduce((acc, r) => acc + r.stress_level, 0) /
      selectedStudentHistory.length
    ).toFixed(1);

    const symptomCounts = new Map<string, number>();
    const factorCounts = new Map<string, number>();

    for (const rpt of selectedStudentHistory) {
      for (const sym of rpt.symptoms ?? []) {
        const clean = sym.trim();
        if (clean) symptomCounts.set(clean, (symptomCounts.get(clean) ?? 0) + 1);
      }
      for (const fname of reportFactorsMap.get(rpt.report_id) ?? []) {
        factorCounts.set(fname, (factorCounts.get(fname) ?? 0) + 1);
      }
    }

    const uniqueSymptoms = Array.from(symptomCounts.entries()).sort((a, b) => b[1] - a[1]);
    const uniqueFactors = Array.from(factorCounts.entries()).sort((a, b) => b[1] - a[1]);

    const feverReports = selectedStudentHistory.filter(
      (r) => r.fever_status && r.fever_status !== "None"
    );

    return {
      latest,
      peakStress,
      avgStress,
      uniqueSymptoms,
      uniqueFactors,
      feverReports,
      hasUrgentFlag:
        peakStress >= 8 ||
        latest.fever_status === "High" ||
        latest.fever_status === "Moderate",
    };
  }, [selectedStudent, selectedStudentHistory, reportFactorsMap]);

  async function handleAdminSignUp(e: FormEvent) {
    e.preventDefault();
    setAuthFeedback(null);

    if (authBusy) return;

    const latestGuard = await fetchAdminGuardStatus(undefined, maxAttempts);
    setGuardState(latestGuard);
    if (latestGuard.isBlocked) {
      setAuthFeedback({
        type: "error",
        text: `Access temporarily blocked from ${latestGuard.ip} after ${latestGuard.maxAttempts} failed login attempts. Try again in ${formatRemainingCooldown(latestGuard.remainingSeconds)}.`,
      });
      return;
    }

    if (isMaxAdminsReached) {
      setAuthFeedback({
        type: "error",
        text: `Maximum limit of ${maxAdmins} admin account${maxAdmins === 1 ? "" : "s"} reached. Log in with an existing admin account to expand the limit.`,
      });
      return;
    }

    const cleanDisplayName = signupDisplayName.trim();
    const cleanUsername = signupUsername.trim();

    if (!cleanDisplayName) {
      setAuthFeedback({ type: "error", text: "Please enter your full name." });
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      setAuthFeedback({
        type: "error",
        text: "Please enter an admin username or email (at least 3 characters).",
      });
      return;
    }

    const pwdCheck = validateStrongPassword(signupPassword);
    if (!pwdCheck.valid) {
      setAuthFeedback({
        type: "error",
        text: pwdCheck.error ?? "Please enter a stronger password.",
      });
      return;
    }
    if (signupPassword !== signupConfirm) {
      setAuthFeedback({
        type: "error",
        text: "Password confirmation does not match.",
      });
      return;
    }

    if (users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      setAuthFeedback({
        type: "error",
        text: `Username "${cleanUsername}" is already registered.`,
      });
      return;
    }

    setAuthBusy(true);
    try {
      const passwordHash = await hashPassword(signupPassword);
      const res = onRegisterAdmin({
        username: cleanUsername,
        display_name: cleanDisplayName,
        password_hash: passwordHash,
      });

      if (!res.ok) {
        setAuthFeedback({
          type: "error",
          text: res.error ?? "Unable to register admin account.",
        });
        return;
      }

      setSignupDisplayName("");
      setSignupUsername("");
      setSignupPassword("");
      setSignupConfirm("");
      setLoginUsername(cleanUsername);
      setLoginPassword("");
      setAuthMode("login");
      setAuthFeedback({
        type: "success",
        text: `Admin account "${cleanUsername}" created (${adminCount + 1}/${maxAdmins}). Sign in below to unlock the Admin Panel.`,
      });
    } catch {
      setAuthFeedback({
        type: "error",
        text: "Unable to complete admin registration safely.",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    setAuthFeedback(null);

    if (authBusy) return;

    setAuthBusy(true);
    try {
      const latestGuard = await fetchAdminGuardStatus(undefined, maxAttempts);
      setGuardState(latestGuard);

      if (latestGuard.isBlocked) {
        setAuthFeedback({
          type: "error",
          text: `Login blocked for IP ${latestGuard.ip} after ${latestGuard.maxAttempts} failed attempts. Remaining cooldown: ${formatRemainingCooldown(latestGuard.remainingSeconds)}.`,
        });
        return;
      }

      if (adminAccounts.length === 0) {
        setAuthMode("signup");
        setAuthFeedback({
          type: "warning",
          text: "No admin accounts exist yet. Register the first admin account to begin.",
        });
        return;
      }

      const cleanUsername = loginUsername.trim();
      if (!cleanUsername || !loginPassword) {
        setAuthFeedback({
          type: "error",
          text: "Enter both your admin username/email and password.",
        });
        return;
      }

      const matched = adminAccounts.find(
        (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
      );
      const passwordOk = matched
        ? await verifyPassword(loginPassword, matched.password_hash)
        : false;

      if (!matched || !passwordOk) {
        const nextGuard = await recordAdminGuardEvent("failed_login", maxAttempts);
        setGuardState(nextGuard);
        setLoginPassword("");

        if (nextGuard.isBlocked) {
          setAuthFeedback({
            type: "error",
            text: `Security Lock Active: ${nextGuard.maxAttempts} failed login attempts detected. IP/client (${nextGuard.ip}) is blocked from Admin Login & Sign Up for ${formatRemainingCooldown(nextGuard.remainingSeconds)}.`,
          });
        } else {
          const attemptsLeft = Math.max(
            0,
            nextGuard.maxAttempts - nextGuard.failedAttempts
          );
          setAuthFeedback({
            type: "warning",
            text: `Invalid admin credentials. Warning: ${nextGuard.failedAttempts}/${nextGuard.maxAttempts} failed attempts used — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining before IP/client block.`,
          });
        }
        return;
      }

      const clearedGuard = await recordAdminGuardEvent("login_success", maxAttempts);
      setGuardState(clearedGuard);
      setLoginPassword("");
      setAuthFeedback(null);
      onLoginAdmin(matched);
    } catch {
      setAuthFeedback({
        type: "error",
        text: "Unable to verify admin credentials right now.",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  function handleSaveAdminLimit(e: FormEvent) {
    e.preventDefault();
    setMgmtFeedback(null);
    const parsed = Math.round(Number(limitInput));
    const minRequired = Math.max(INITIAL_MAX_ADMINS, adminCount);

    if (!Number.isFinite(parsed) || parsed < minRequired) {
      setMgmtFeedback({
        type: "error",
        text: `Admin limit cannot be less than ${minRequired} (currently ${adminCount} registered admin${adminCount === 1 ? "" : "s"}).`,
      });
      setLimitInput(maxAdmins);
      return;
    }
    if (parsed > MAX_ADMINS_CEILING) {
      setMgmtFeedback({
        type: "error",
        text: `Admin limit cannot exceed ${MAX_ADMINS_CEILING}.`,
      });
      return;
    }

    const res = onUpdateAdminSettings({ maxAdmins: parsed });
    if (!res.ok) {
      setMgmtFeedback({
        type: "error",
        text: res.error ?? "Unable to update admin limit.",
      });
      return;
    }
    setMgmtFeedback({
      type: "success",
      text: `Admin account limit updated to ${res.settings.maxAdmins} (${adminCount}/${res.settings.maxAdmins} active).`,
    });
  }

  async function handleSaveAttemptThreshold(e: FormEvent) {
    e.preventDefault();
    setMgmtFeedback(null);
    const parsed = Math.round(Number(attemptThresholdInput));
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_LOGIN_ATTEMPTS ||
      parsed > MAX_LOGIN_ATTEMPTS_CEILING
    ) {
      setMgmtFeedback({
        type: "error",
        text: `Failed-attempt lock threshold must be between ${MIN_LOGIN_ATTEMPTS} and ${MAX_LOGIN_ATTEMPTS_CEILING}.`,
      });
      return;
    }

    const res = onUpdateAdminSettings({ maxLoginAttempts: parsed });
    if (!res.ok) {
      setMgmtFeedback({
        type: "error",
        text: res.error ?? "Unable to update attempt threshold.",
      });
      return;
    }

    const synced = await syncAdminAttemptThreshold(res.settings.maxLoginAttempts);
    setGuardState(synced);
    setMgmtFeedback({
      type: "success",
      text: `Failed-attempt lock threshold updated to ${res.settings.maxLoginAttempts} attempt${res.settings.maxLoginAttempts === 1 ? "" : "s"}.`,
    });
  }

  async function handleResetIpLocks() {
    setMgmtFeedback(null);
    const cleared = await resetAllAdminLocks(maxAttempts);
    setGuardState(cleared);
    setMgmtFeedback({
      type: "success",
      text: `IP & failed-attempt locks cleared cleanly for ${cleared.ip}.`,
    });
  }

  async function handleGrantNewAdmin(e: FormEvent) {
    e.preventDefault();
    setMgmtFeedback(null);
    if (grantBusy) return;

    if (isMaxAdminsReached) {
      setMgmtFeedback({
        type: "error",
        text: `Maximum limit of ${maxAdmins} admin account${maxAdmins === 1 ? "" : "s"} reached. Increase the Admin Limit first to grant another admin account.`,
      });
      return;
    }

    const cleanDisplayName = grantDisplayName.trim();
    const cleanUsername = grantUsername.trim();

    if (!cleanDisplayName) {
      setMgmtFeedback({ type: "error", text: "Enter the new admin's full name." });
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      setMgmtFeedback({
        type: "error",
        text: "Enter a username or email (at least 3 characters).",
      });
      return;
    }

    const pwdCheck = validateStrongPassword(grantPassword);
    if (!pwdCheck.valid) {
      setMgmtFeedback({
        type: "error",
        text: pwdCheck.error ?? "Enter a strong password.",
      });
      return;
    }
    if (grantPassword !== grantConfirm) {
      setMgmtFeedback({
        type: "error",
        text: "New admin password confirmation does not match.",
      });
      return;
    }

    if (users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      setMgmtFeedback({
        type: "error",
        text: `Username "${cleanUsername}" is already registered.`,
      });
      return;
    }

    setGrantBusy(true);
    try {
      const passwordHash = await hashPassword(grantPassword);
      const res = onRegisterAdmin({
        username: cleanUsername,
        display_name: cleanDisplayName,
        password_hash: passwordHash,
      });

      if (!res.ok) {
        setMgmtFeedback({
          type: "error",
          text: res.error ?? "Unable to grant admin account.",
        });
        return;
      }

      setGrantDisplayName("");
      setGrantUsername("");
      setGrantPassword("");
      setGrantConfirm("");
      setMgmtFeedback({
        type: "success",
        text: `Granted admin access to ${cleanDisplayName} (${cleanUsername}). Active admins: ${adminCount + 1}/${maxAdmins}.`,
      });
    } catch {
      setMgmtFeedback({
        type: "error",
        text: "Unable to create admin account safely.",
      });
    } finally {
      setGrantBusy(false);
    }
  }

  function handleSaveAdminEdit(user: UserAccount) {
    setMgmtFeedback(null);
    const cleanName = editDisplayName.trim();
    const cleanUser = editUsername.trim();
    if (!cleanName || !cleanUser || cleanUser.length < 3) {
      setMgmtFeedback({
        type: "error",
        text: "Full name and username/email (min 3 characters) are required.",
      });
      return;
    }
    const res = onUpdateAdminAccount(user.user_id, {
      username: cleanUser,
      display_name: cleanName,
    });
    if (!res.ok) {
      setMgmtFeedback({
        type: "error",
        text: res.error ?? "Unable to update admin details.",
      });
      return;
    }
    setEditingAdminId(null);
    setMgmtFeedback({
      type: "success",
      text: `Updated admin profile for ${cleanName} (${cleanUser}).`,
    });
  }

  async function handleSaveAdminPasswordReset(user: UserAccount) {
    setMgmtFeedback(null);
    const pwdCheck = validateStrongPassword(resetPwdValue);
    if (!pwdCheck.valid) {
      setMgmtFeedback({
        type: "error",
        text: pwdCheck.error ?? "Please enter a strong password.",
      });
      return;
    }
    if (resetPwdValue !== resetPwdConfirm) {
      setMgmtFeedback({
        type: "error",
        text: "Password confirmation does not match.",
      });
      return;
    }

    const newHash = await hashPassword(resetPwdValue);
    const res = onUpdateAdminAccount(user.user_id, {
      username: user.username,
      display_name: user.display_name,
      password_hash: newHash,
    });
    if (!res.ok) {
      setMgmtFeedback({
        type: "error",
        text: res.error ?? "Unable to reset admin password.",
      });
      return;
    }
    setResetPwdAdminId(null);
    setResetPwdValue("");
    setResetPwdConfirm("");
    setMgmtFeedback({
      type: "success",
      text: `Password updated (hashed) for ${user.display_name || user.username}.`,
    });
  }

  function handleRemoveAdmin(user: UserAccount) {
    setMgmtFeedback(null);
    const isRemovingSelf = authenticatedAdmin?.user_id === user.user_id;
    const remainingAdmins = Math.max(0, adminCount - 1);
    const res = onDeleteAdminAccount(user.user_id);
    if (!res.ok) {
      setMgmtFeedback({
        type: "error",
        text: res.error ?? "Unable to remove admin account.",
      });
      return;
    }
    if (editingAdminId === user.user_id) setEditingAdminId(null);
    if (resetPwdAdminId === user.user_id) setResetPwdAdminId(null);

    if (isRemovingSelf) {
      setSelectedStudentId(null);
      setAuthMode(remainingAdmins === 0 ? "signup" : "login");
      setAuthFeedback({
        type: "success",
        text:
          remainingAdmins === 0
            ? "Your admin account was removed. Register a new first admin below."
            : "Your admin account was removed and your Admin Panel session was closed.",
      });
      return;
    }

    setMgmtFeedback({
      type: "success",
      text: `Removed admin account ${user.display_name || user.username}.`,
    });
  }

  // Password-Protected Admin Auth Gate when unauthenticated
  if (!authenticatedAdmin) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <section className="tab-surface-card rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#140A29] border tab-divider flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 tab-accent-text" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-50">
                  Admin Security Portal
                </h2>
                <p className="text-xs sm:text-sm text-slate-300/75 mt-0.5">
                  {adminCount === 0
                    ? "First-time setup: only 1 initial admin can register first. Log in afterward to expand the admin limit and add more admins."
                    : `Admin access is capped at ${maxAdmins} registered account${maxAdmins === 1 ? "" : "s"}. Sign in to manage settings or student records.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded bg-[#090514] border tab-divider tab-accent-text tabular-nums">
                Admins: {adminCount} / {maxAdmins}
              </span>
              <span
                className={`px-2.5 py-1 rounded border tabular-nums ${
                  guardState.isBlocked
                    ? "bg-rose-500/15 border-rose-400/45 text-rose-200"
                    : guardState.failedAttempts > 0
                      ? "bg-amber-500/15 border-amber-400/45 text-amber-200"
                      : "bg-[#090514] border-violet-500/30 text-slate-200"
                }`}
              >
                {guardState.isBlocked
                  ? `Blocked · ${formatRemainingCooldown(guardState.remainingSeconds)}`
                  : `Attempts: ${guardState.failedAttempts}/${guardState.maxAttempts}`}
              </span>
            </div>
          </div>

          <div className="px-3.5 py-2.5 rounded-md bg-[#090514]/85 border tab-divider flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300/80">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
              <span>
                Tracked IP / Client Guard:{" "}
                <strong className="font-mono text-slate-100">{guardState.ip}</strong>
              </span>
            </span>
            <span className="text-[11px] text-slate-400">
              Lock Rule: {guardState.maxAttempts} failed login attempt
              {guardState.maxAttempts === 1 ? "" : "s"} locks Admin Login &amp; Sign Up for 15 minutes
            </span>
          </div>

          {guardState.isBlocked && (
            <div
              role="alert"
              className="p-4 rounded-md bg-rose-500/15 border border-rose-400/45 text-xs sm:text-sm text-rose-100 flex items-start gap-3"
            >
              <Ban className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-100">
                  Access Blocked ({guardState.maxAttempts}/{guardState.maxAttempts} Failed Attempts)
                </div>
                <p className="text-rose-100/85 leading-relaxed">
                  Admin Login and new Admin Sign Up are temporarily locked for{" "}
                  <span className="font-mono font-semibold">{guardState.ip}</span>. Student features remain available.
                </p>
                <p className="text-xs font-mono text-rose-200 tabular-nums">
                  Cooldown remaining: {formatRemainingCooldown(guardState.remainingSeconds)}
                </p>
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#090514] border tab-divider">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthFeedback(null);
              }}
              className={`py-2 px-3 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                authMode === "login"
                  ? "tab-chip-active"
                  : "text-slate-300/75 hover:text-slate-100"
              }`}
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              <span>Admin Login</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setAuthFeedback(null);
              }}
              className={`py-2 px-3 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                authMode === "signup"
                  ? "tab-chip-active"
                  : "text-slate-300/75 hover:text-slate-100"
              }`}
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>Admin Sign Up ({adminCount}/{maxAdmins})</span>
            </button>
          </div>

          {authFeedback && (
            <div
              role={authFeedback.type === "error" ? "alert" : "status"}
              className={`p-3.5 rounded-md border text-xs sm:text-sm flex items-start gap-2.5 ${
                authFeedback.type === "error"
                  ? "bg-rose-500/12 border-rose-400/40 text-rose-100"
                  : authFeedback.type === "warning"
                    ? "bg-amber-500/12 border-amber-400/40 text-amber-100"
                    : "bg-emerald-500/12 border-emerald-400/40 text-emerald-100"
              }`}
            >
              {authFeedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{authFeedback.text}</span>
            </div>
          )}

          {authMode === "login" ? (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {adminCount === 0 && (
                <div className="p-3 rounded-md bg-[#090514] border tab-divider text-xs text-slate-300/85">
                  No admin account is registered yet. Switch to{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className="underline font-semibold tab-accent-text"
                  >
                    Admin Sign Up
                  </button>{" "}
                  to register the first admin account.
                </div>
              )}

              <div>
                <label
                  htmlFor="admin-login-username"
                  className="block text-xs font-medium text-slate-200 mb-1.5"
                >
                  Admin Username or Email
                </label>
                <input
                  id="admin-login-username"
                  type="text"
                  autoComplete="username"
                  disabled={guardState.isBlocked || authBusy}
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter admin username or email"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-login-password"
                  className="block text-xs font-medium text-slate-200 mb-1.5"
                >
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    id="admin-login-password"
                    type={showLoginPwd ? "text" : "password"}
                    autoComplete="current-password"
                    disabled={guardState.isBlocked || authBusy}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPwd((v) => !v)}
                    aria-label={showLoginPwd ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 p-1"
                  >
                    {showLoginPwd ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={guardState.isBlocked || authBusy}
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold tab-cta-btn inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>
                  {guardState.isBlocked
                    ? `Blocked (${formatRemainingCooldown(guardState.remainingSeconds)})`
                    : authBusy
                      ? "Verifying..."
                      : "Unlock Admin Panel"}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSignUp} className="space-y-4">
              {isMaxAdminsReached && (
                <div
                  role="alert"
                  className="p-3.5 rounded-md bg-amber-500/15 border border-amber-400/45 text-xs sm:text-sm text-amber-100 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Maximum limit of {maxAdmins} admin account{maxAdmins === 1 ? "" : "s"} reached.{" "}
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className="underline font-semibold"
                    >
                      Admin Login
                    </button>{" "}
                    as an existing admin to expand the limit or grant additional accounts.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="admin-signup-name"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Full Name
                  </label>
                  <input
                    id="admin-signup-name"
                    type="text"
                    disabled={guardState.isBlocked || isMaxAdminsReached || authBusy}
                    value={signupDisplayName}
                    onChange={(e) => setSignupDisplayName(e.target.value)}
                    placeholder="Enter admin full name"
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-signup-username"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Admin Username or Email
                  </label>
                  <input
                    id="admin-signup-username"
                    type="text"
                    autoComplete="username"
                    disabled={guardState.isBlocked || isMaxAdminsReached || authBusy}
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    placeholder="e.g. admin@campus.edu"
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="admin-signup-password"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Strong Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-signup-password"
                      type={showSignupPwd ? "text" : "password"}
                      autoComplete="new-password"
                      disabled={guardState.isBlocked || isMaxAdminsReached || authBusy}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Min 8 chars, letters + numbers + symbol"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPwd((v) => !v)}
                      aria-label={showSignupPwd ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 p-1"
                    >
                      {showSignupPwd ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-signup-confirm"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="admin-signup-confirm"
                    type={showSignupPwd ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={guardState.isBlocked || isMaxAdminsReached || authBusy}
                    value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#090514] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div
                  className={`px-2.5 py-1.5 rounded border ${
                    passwordStrength.checks.minLength
                      ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                      : "bg-[#090514] border-violet-500/20 text-slate-400"
                  }`}
                >
                  8+ characters
                </div>
                <div
                  className={`px-2.5 py-1.5 rounded border ${
                    passwordStrength.checks.hasLetter
                      ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                      : "bg-[#090514] border-violet-500/20 text-slate-400"
                  }`}
                >
                  Letters (A-Z)
                </div>
                <div
                  className={`px-2.5 py-1.5 rounded border ${
                    passwordStrength.checks.hasNumber
                      ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                      : "bg-[#090514] border-violet-500/20 text-slate-400"
                  }`}
                >
                  Number (0-9)
                </div>
                <div
                  className={`px-2.5 py-1.5 rounded border ${
                    passwordStrength.checks.hasSymbol
                      ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                      : "bg-[#090514] border-violet-500/20 text-slate-400"
                  }`}
                >
                  Symbol (!@#$)
                </div>
              </div>

              <button
                type="submit"
                disabled={guardState.isBlocked || isMaxAdminsReached || authBusy}
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold tab-cta-btn inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>
                  {isMaxAdminsReached
                    ? `Limit Reached (${adminCount}/${maxAdmins})`
                    : guardState.isBlocked
                      ? `Blocked (${formatRemainingCooldown(guardState.remainingSeconds)})`
                      : authBusy
                        ? "Creating Admin Account..."
                        : adminCount === 0
                          ? "Register First Admin Account"
                          : "Create Admin Account"}
                </span>
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Authenticated Admin Session Banner */}
      <div className="tab-surface-card rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Authenticated Admin</span>
          </span>
          <span className="text-sm font-semibold text-slate-50">
            {authenticatedAdmin.display_name || authenticatedAdmin.username}
          </span>
          <span className="font-mono text-slate-400">
            ({authenticatedAdmin.username})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 text-xs font-mono rounded bg-[#090514] border tab-divider tab-accent-text tabular-nums">
            {adminCount} / {maxAdmins} Admins
          </span>
          <span className="px-2.5 py-1 text-xs font-mono rounded bg-[#090514] border tab-divider text-slate-300">
            IP: {guardState.ip}
          </span>
          <button
            type="button"
            onClick={() =>
              settingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md tab-outline-btn"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Admin Settings</span>
          </button>
          <button
            type="button"
            onClick={onLogoutAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-500/15 border border-rose-400/40 text-rose-100 hover:bg-rose-500/25 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Logout / Lock Admin Panel</span>
          </button>
        </div>
      </div>

      {/* Live Overview Strip (Zero Fake Counts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Submitted Students</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {students.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">Each shown as a selectable name bar</div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Total Submissions</div>
          <div className="mt-1.5 text-2xl font-semibold tab-accent-text tabular-nums">
            {reports.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">Survey &amp; tracker logs in storage</div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">High-Stress Alerts (≥ 8/10)</div>
          <div className="mt-1.5 text-2xl font-semibold text-rose-300 tabular-nums">
            {highStressAlertsCount}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">Flagged submissions needing follow-up</div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Admin Capacity</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {adminCount} / {maxAdmins}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            {isMaxAdminsReached ? "Limit reached — expand below" : `${maxAdmins - adminCount} slot(s) available`}
          </div>
        </div>
      </div>

      {/* Main Student Bars & Problem Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 tab-surface-card rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b tab-divider flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 tab-accent-text shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-50 truncate">
                  Admin Panel · Student Bars
                </h2>
                <p className="text-xs text-slate-300/70">
                  Click any student bar to inspect problems &amp; history.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-mono rounded bg-[#090514] border tab-divider tab-accent-text tabular-nums shrink-0">
              {students.length}
            </span>
          </div>

          <div className="p-4">
            {students.length === 0 ? (
              <div className="px-4 py-10 text-center space-y-3">
                <p className="text-sm font-medium text-slate-100">
                  No student submissions yet
                </p>
                <p className="text-xs text-slate-300/70 leading-relaxed">
                  As students submit details and health check-ins from the Student panel, each student arrives here one by one as an animated purple name bar.
                </p>
                <button
                  type="button"
                  onClick={onSwitchToStudent}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md tab-cta-btn"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Switch to Student Mode</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5" role="list" aria-label="Submitted students">
                <AnimatePresence initial={true}>
                  {students.map((student, idx) => {
                    const isSelected = selectedStudentId === student.student_id;
                    return (
                      <motion.button
                        key={student.student_id}
                        type="button"
                        role="listitem"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedStudentId(student.student_id)}
                        initial={{ opacity: 0, y: -12, x: -16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 16 }}
                        transition={{
                          duration: 0.28,
                          delay: Math.min(idx * 0.06, 0.45),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        whileHover={{ x: 4, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={`w-full text-left px-4 py-3.5 rounded-lg border flex items-center gap-3 transition-all ${
                          isSelected
                            ? "bg-gradient-to-r from-[#2e1065] via-[#4c1d95]/85 to-[#2e1065] border-fuchsia-300/80 text-white shadow-[0_0_28px_rgba(192,132,252,0.42)]"
                            : "bg-gradient-to-r from-[#170930]/95 via-[#220f47]/90 to-[#140829]/95 border-purple-400/40 text-violet-50 shadow-[0_0_18px_rgba(168,85,247,0.18)] hover:border-purple-300/75 hover:shadow-[0_0_26px_rgba(192,132,252,0.32)]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isSelected
                              ? "bg-fuchsia-300 shadow-[0_0_12px_rgba(240,171,252,0.95)]"
                              : "bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.8)] animate-pulse"
                          }`}
                        />
                        <span className="block text-sm font-semibold tracking-tight truncate">
                          {student.full_name}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-7 tab-surface-card rounded-lg overflow-hidden">
          {!selectedStudent ? (
            <div className="px-6 py-16 text-center space-y-2.5">
              <UserCheck className="w-8 h-8 tab-accent-text mx-auto opacity-80" aria-hidden="true" />
              <h3 className="text-base font-semibold text-slate-50">
                {students.length === 0
                  ? "Awaiting Student Submissions"
                  : "Select a Student Bar to Inspect"}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300/75 max-w-md mx-auto leading-relaxed">
                {students.length === 0
                  ? "Once a student enters their details and submits a health check-in, click their name bar to view their reported problems, stress factors, symptoms, and full chronological history."
                  : "Click any student's name bar on the left to reveal the problems they are facing, symptoms, stress factors, remarks, AI guidance, and complete history."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-violet-500/20">
              <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-4 bg-[#0B0617]/65">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-semibold text-slate-50">
                      {selectedStudent.full_name}
                    </h3>
                    <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[#140A29] border tab-divider tab-accent-text">
                      {selectedStudent.student_id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300/80">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                      <span>
                        Department:{" "}
                        {selectedStudentDept?.dept_name ??
                          selectedStudent.dept_name ??
                          "Not entered"}
                      </span>
                    </span>
                    <span>
                      {selectedStudent.class_section} · Roll {selectedStudent.roll_no}
                    </span>
                    <span>{selectedStudent.semester}</span>
                    <span>Age {selectedStudent.age}</span>
                  </div>
                  {selectedStudent.email && (
                    <div className="text-xs font-mono text-slate-300/65">
                      {selectedStudent.email}
                    </div>
                  )}
                </div>
              </div>

              {!studentProblemSummary ? (
                <div className="px-6 py-12 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-100">
                    No health check-ins or stress reports submitted yet
                  </p>
                  <p className="text-xs text-slate-300/70">
                    {selectedStudent.full_name} is registered, and their problem summary and history will appear here once they submit a survey or tracker log.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-6 space-y-5">
                    {studentProblemSummary.hasUrgentFlag && (
                      <div
                        role="alert"
                        className="px-4 py-3 bg-rose-500/12 border border-rose-400/40 rounded-md text-xs text-rose-100 flex items-start gap-2.5"
                      >
                        <AlertTriangle
                          className="w-4 h-4 text-rose-300 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>
                          Attention Recommended: Peak stress reached{" "}
                          <strong>{studentProblemSummary.peakStress}/10</strong>
                          {studentProblemSummary.feverReports.length > 0
                            ? ` with ${studentProblemSummary.latest.fever_status} fever logged`
                            : ""}
                          . Review parent/guardian or medical follow-up notes below.
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                        <div className="text-[11px] text-slate-300/70">Latest Stress</div>
                        <div className="mt-1 text-base font-semibold font-mono text-slate-50 tabular-nums">
                          {studentProblemSummary.latest.stress_level} / 10
                        </div>
                        <div className="text-[11px] tab-accent-text">
                          {getStressBand(studentProblemSummary.latest.stress_level)}
                        </div>
                      </div>

                      <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                        <div className="text-[11px] text-slate-300/70">Peak / Avg Stress</div>
                        <div className="mt-1 text-base font-semibold font-mono text-slate-50 tabular-nums">
                          {studentProblemSummary.peakStress} / {studentProblemSummary.avgStress}
                        </div>
                        <div className="text-[11px] text-slate-300/65">
                          Across {selectedStudentHistory.length} submission(s)
                        </div>
                      </div>

                      <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                        <div className="text-[11px] text-slate-300/70">Latest Sleep &amp; Water</div>
                        <div className="mt-1 text-sm font-semibold font-mono text-slate-50 tabular-nums">
                          {studentProblemSummary.latest.sleep_hours.toFixed(1)}h ·{" "}
                          {studentProblemSummary.latest.water_intake}gl
                        </div>
                        <div className="text-[11px] text-slate-300/65">
                          Wellness {studentProblemSummary.latest.wellness_index}/100
                        </div>
                      </div>

                      <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                        <div className="text-[11px] text-slate-300/70">Latest Fever / Temp</div>
                        <div className="mt-1 text-sm font-semibold font-mono text-slate-50 tabular-nums">
                          {studentProblemSummary.latest.fever_status ?? "None"}
                        </div>
                        <div className="text-[11px] text-slate-300/65 tabular-nums">
                          {typeof studentProblemSummary.latest.temperature_f === "number"
                            ? `${studentProblemSummary.latest.temperature_f.toFixed(1)}°F`
                            : "No temp recorded"}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-[#090514]/85 border tab-divider rounded-md space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                          <HeartPulse className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                          <span>Reported Symptoms &amp; Physical Issues</span>
                        </div>
                        {studentProblemSummary.uniqueSymptoms.length === 0 &&
                        studentProblemSummary.feverReports.length === 0 ? (
                          <p className="text-xs text-slate-300/65">
                            No physical symptoms or fever alerts tagged.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {studentProblemSummary.feverReports.length > 0 && (
                              <span className="px-2 py-0.5 text-xs rounded border border-amber-400/40 bg-amber-500/15 text-amber-200">
                                Fever ({studentProblemSummary.latest.fever_status})
                              </span>
                            )}
                            {studentProblemSummary.uniqueSymptoms.map(([sym, count]) => (
                              <span
                                key={sym}
                                className="px-2 py-0.5 text-xs rounded border tab-chip-active"
                              >
                                {sym}
                                {count > 1 ? ` ×${count}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-[#090514]/85 border tab-divider rounded-md space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                          <Tag className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                          <span>Contributing Stress Factors</span>
                        </div>
                        {studentProblemSummary.uniqueFactors.length === 0 ? (
                          <p className="text-xs text-slate-300/65">
                            No contributing stress factors tagged yet.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {studentProblemSummary.uniqueFactors.map(([fname, count]) => (
                              <span
                                key={fname}
                                className="px-2 py-0.5 text-xs rounded border tab-chip-active"
                              >
                                {fname}
                                {count > 1 ? ` ×${count}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-[#090514] border tab-divider rounded-md space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-100 mb-1">
                          Latest Student Problem Remarks / Opinion
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed">
                          {studentProblemSummary.latest.remarks || "No remarks entered."}
                        </p>
                      </div>

                      {studentProblemSummary.latest.ai_assessment && (
                        <div className="pt-3 border-t tab-divider">
                          <div className="flex items-center gap-1.5 text-xs font-semibold tab-accent-text mb-1">
                            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>AI Advisor Summary &amp; Coping Guidance</span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed whitespace-pre-line">
                            {studentProblemSummary.latest.ai_assessment}
                          </p>
                          {Array.isArray(studentProblemSummary.latest.actionable_tips) &&
                            studentProblemSummary.latest.actionable_tips.length > 0 && (
                              <ul className="mt-2 space-y-1 text-xs text-slate-300/85 list-disc pl-5">
                                {studentProblemSummary.latest.actionable_tips.map((tip, i) => (
                                  <li key={i}>{tip}</li>
                                ))}
                              </ul>
                            )}
                          <p className="mt-2 text-[11px] text-slate-400">
                            {studentProblemSummary.latest.disclaimer ?? STANDARD_WELLNESS_DISCLAIMER}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-50 flex items-center gap-2">
                        <Activity className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                        <span>Full Chronological History ({selectedStudentHistory.length})</span>
                      </h4>
                    </div>

                    <div className="space-y-3">
                      {selectedStudentHistory.map((rpt) => {
                        const rptFactors = reportFactorsMap.get(rpt.report_id) ?? [];
                        const sourceLabel =
                          rpt.entry_source === "daily_tracker"
                            ? "Daily Tracker"
                            : rpt.entry_source === "stress_log"
                              ? "Stress Log"
                              : "AI Survey";

                        return (
                          <article
                            key={rpt.report_id}
                            className="p-4 bg-[#090514]/85 border tab-divider rounded-md space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="inline-flex items-center gap-1 font-mono tab-accent-text font-semibold">
                                  <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                                  {rpt.submission_date}
                                </span>
                                <span className="font-mono text-slate-300/65">
                                  {rpt.report_id}
                                </span>
                                <span className="px-2 py-0.5 text-[11px] rounded bg-[#140A29] border tab-divider text-slate-200/85">
                                  {sourceLabel}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded border ${
                                    rpt.stress_level >= 8
                                      ? "bg-rose-500/15 border-rose-400/45 text-rose-200"
                                      : "bg-[#140A29] border-violet-500/30 text-slate-100"
                                  }`}
                                >
                                  Stress {rpt.stress_level}/10
                                </span>
                                <span className="px-2 py-0.5 rounded bg-[#140A29] border tab-divider tab-accent-text">
                                  Wellness {rpt.wellness_index}/100
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300/80 tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                <Moon className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                                {rpt.sleep_hours.toFixed(1)}h sleep
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Droplets className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                                {rpt.water_intake} glasses
                              </span>
                              {(rpt.fever_status && rpt.fever_status !== "None") ||
                              typeof rpt.temperature_f === "number" ? (
                                <span className="inline-flex items-center gap-1">
                                  <Thermometer
                                    className="w-3.5 h-3.5 tab-accent-text"
                                    aria-hidden="true"
                                  />
                                  {rpt.fever_status ?? "None"}
                                  {typeof rpt.temperature_f === "number"
                                    ? ` (${rpt.temperature_f.toFixed(1)}°F)`
                                    : ""}
                                </span>
                              ) : null}
                            </div>

                            {(rptFactors.length > 0 || (rpt.symptoms && rpt.symptoms.length > 0)) && (
                              <div className="flex flex-wrap gap-1.5">
                                {rptFactors.map((fname) => (
                                  <span
                                    key={`${rpt.report_id}-${fname}`}
                                    className="px-2 py-0.5 text-[11px] rounded border tab-chip-active"
                                  >
                                    Factor: {fname}
                                  </span>
                                ))}
                                {(rpt.symptoms ?? []).map((sym) => (
                                  <span
                                    key={`${rpt.report_id}-sym-${sym}`}
                                    className="px-2 py-0.5 text-[11px] rounded border border-teal-400/35 bg-teal-500/12 text-teal-200"
                                  >
                                    {sym}
                                  </span>
                                ))}
                              </div>
                            )}

                            <p className="text-xs text-slate-200/90 leading-relaxed">
                              <span className="font-semibold text-slate-100">Remarks: </span>
                              {rpt.remarks}
                            </p>

                            {rpt.ai_assessment && (
                              <p className="text-xs text-slate-300/80 leading-relaxed">
                                <span className="font-semibold tab-accent-text">AI Summary: </span>
                                {rpt.ai_assessment}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Admin Settings & Account Management Section */}
      <section
        ref={settingsSectionRef}
        id="admin-settings-management"
        className="tab-surface-card rounded-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 tab-accent-text" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-slate-50">
                Admin Settings &amp; Account Management
              </h2>
              <p className="text-xs text-slate-300/70">
                Expand the maximum admin limit, grant new admin accounts, edit or reset credentials, and manage IP attempt locks.
              </p>
            </div>
          </div>

          <span className="px-3 py-1 text-xs font-mono rounded bg-[#090514] border tab-divider tab-accent-text tabular-nums">
            Registered: {adminCount} / {maxAdmins}
          </span>
        </div>

        <div className="p-6 space-y-6">
          {mgmtFeedback && (
            <div
              role={mgmtFeedback.type === "error" ? "alert" : "status"}
              className={`p-3.5 rounded-md border text-xs sm:text-sm flex items-start gap-2.5 ${
                mgmtFeedback.type === "error"
                  ? "bg-rose-500/12 border-rose-400/40 text-rose-100"
                  : mgmtFeedback.type === "warning"
                    ? "bg-amber-500/12 border-amber-400/40 text-amber-100"
                    : "bg-emerald-500/12 border-emerald-400/40 text-emerald-100"
              }`}
            >
              {mgmtFeedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{mgmtFeedback.text}</span>
            </div>
          )}

          {/* Row 1: Admin Limit Control + Security Lock Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Admin Limit Control */}
            <div className="p-5 bg-[#090514]/85 border tab-divider rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-50 flex items-center gap-2">
                    <Users className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                    <span>Admin Limit Control</span>
                  </h3>
                  <p className="text-xs text-slate-300/70 mt-0.5">
                    Initial default starts at 1 admin. Increase this limit (e.g., 2, 3, 4, 5+) to grant or allow additional admin accounts.
                  </p>
                </div>
                <span className="px-2.5 py-1 text-xs font-mono rounded bg-[#140A29] border tab-divider tab-accent-text tabular-nums shrink-0">
                  {adminCount} / {maxAdmins}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-[#140A29] overflow-hidden border border-violet-500/20">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((adminCount / Math.max(1, maxAdmins)) * 100))}%`,
                  }}
                />
              </div>

              <form onSubmit={handleSaveAdminLimit} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label
                    htmlFor="admin-max-limit-input"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Maximum Admins Allowed (min {Math.max(INITIAL_MAX_ADMINS, adminCount)})
                  </label>
                  <input
                    id="admin-max-limit-input"
                    type="number"
                    min={Math.max(INITIAL_MAX_ADMINS, adminCount)}
                    max={MAX_ADMINS_CEILING}
                    value={limitInput}
                    onChange={(e) => setLimitInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-md bg-[#120926] border tab-divider text-sm font-mono text-slate-50 tabular-nums focus:outline-none focus:border-fuchsia-400"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-md text-xs sm:text-sm font-semibold tab-cta-btn shrink-0"
                >
                  Save Admin Limit
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Quick set:</span>
                {[1, 2, 3, 4, 5].map((preset) => {
                  const disabled = preset < adminCount;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={disabled}
                      onClick={() => setLimitInput(preset)}
                      className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                        limitInput === preset
                          ? "tab-chip-active"
                          : "bg-[#120926] border-violet-500/25 text-slate-300 hover:border-fuchsia-400/50"
                      } disabled:opacity-35 disabled:cursor-not-allowed`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Security & IP Lock Controls */}
            <div className="p-5 bg-[#090514]/85 border tab-divider rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-50 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                    <span>IP &amp; Failed-Attempt Lock Controls</span>
                  </h3>
                  <p className="text-xs text-slate-300/70 mt-0.5">
                    Configure the failed-login threshold (default 2) or reset blocked IPs and attempt counters.
                  </p>
                </div>
                <span className="px-2.5 py-1 text-xs font-mono rounded bg-[#140A29] border tab-divider text-slate-200 tabular-nums shrink-0">
                  {guardState.failedAttempts}/{guardState.maxAttempts}
                </span>
              </div>

              <form onSubmit={handleSaveAttemptThreshold} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label
                    htmlFor="admin-attempt-threshold-input"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Failed-Attempt Lock Threshold (1–{MAX_LOGIN_ATTEMPTS_CEILING})
                  </label>
                  <input
                    id="admin-attempt-threshold-input"
                    type="number"
                    min={MIN_LOGIN_ATTEMPTS}
                    max={MAX_LOGIN_ATTEMPTS_CEILING}
                    value={attemptThresholdInput}
                    onChange={(e) => setAttemptThresholdInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-md bg-[#120926] border tab-divider text-sm font-mono text-slate-50 tabular-nums focus:outline-none focus:border-fuchsia-400"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-md text-xs sm:text-sm font-semibold tab-cta-btn shrink-0"
                >
                  Save Threshold
                </button>
              </form>

              <div className="pt-2 border-t tab-divider flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-300/80">
                  Tracked IP: <span className="font-mono text-slate-100">{guardState.ip}</span>
                  {guardState.isBlocked && (
                    <span className="ml-2 text-rose-300 font-mono">
                      (Locked {formatRemainingCooldown(guardState.remainingSeconds)})
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleResetIpLocks}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md tab-outline-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset / Unlock IP &amp; Attempt Locks</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Dedicated Grant / Add Admin Card */}
          <div className="p-5 bg-[#090514]/85 border tab-divider rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-50 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                  <span>Grant / Add Admin Account</span>
                </h3>
                <p className="text-xs text-slate-300/70 mt-0.5">
                  Directly create a new admin account with hashed credentials when slots are open below the configured limit.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 text-xs font-mono rounded border tabular-nums ${
                  isMaxAdminsReached
                    ? "bg-amber-500/15 border-amber-400/45 text-amber-200"
                    : "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                }`}
              >
                {isMaxAdminsReached
                  ? `Locked (${adminCount}/${maxAdmins})`
                  : `${maxAdmins - adminCount} Open Slot${maxAdmins - adminCount === 1 ? "" : "s"}`}
              </span>
            </div>

            {isMaxAdminsReached && (
              <div
                role="status"
                className="p-3.5 rounded-md bg-amber-500/12 border border-amber-400/40 text-xs text-amber-100 flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Maximum limit of {maxAdmins} admin account{maxAdmins === 1 ? "" : "s"} reached. Increase the{" "}
                  <strong>Admin Limit Control</strong> above (for example, to {maxAdmins + 1}) and click{" "}
                  <strong>Save Admin Limit</strong> to grant another admin account.
                </span>
              </div>
            )}

            <form onSubmit={handleGrantNewAdmin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor="grant-admin-name"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Full Name
                  </label>
                  <input
                    id="grant-admin-name"
                    type="text"
                    disabled={isMaxAdminsReached || grantBusy}
                    value={grantDisplayName}
                    onChange={(e) => setGrantDisplayName(e.target.value)}
                    placeholder="New admin full name"
                    className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-45"
                  />
                </div>

                <div>
                  <label
                    htmlFor="grant-admin-username"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Username or Email
                  </label>
                  <input
                    id="grant-admin-username"
                    type="text"
                    disabled={isMaxAdminsReached || grantBusy}
                    value={grantUsername}
                    onChange={(e) => setGrantUsername(e.target.value)}
                    placeholder="e.g. coordinator@campus.edu"
                    className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-45"
                  />
                </div>

                <div>
                  <label
                    htmlFor="grant-admin-password"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Strong Password
                  </label>
                  <div className="relative">
                    <input
                      id="grant-admin-password"
                      type={showGrantPwd ? "text" : "password"}
                      disabled={isMaxAdminsReached || grantBusy}
                      value={grantPassword}
                      onChange={(e) => setGrantPassword(e.target.value)}
                      placeholder="8+ chars, letters, num, symbol"
                      className="w-full px-3 py-2 pr-9 rounded-md bg-[#120926] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-45"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGrantPwd((v) => !v)}
                      aria-label={showGrantPwd ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 p-1"
                    >
                      {showGrantPwd ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="grant-admin-confirm"
                    className="block text-xs font-medium text-slate-200 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="grant-admin-confirm"
                    type={showGrantPwd ? "text" : "password"}
                    disabled={isMaxAdminsReached || grantBusy}
                    value={grantConfirm}
                    onChange={(e) => setGrantConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400 disabled:opacity-45"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      grantPasswordStrength.checks.minLength
                        ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                        : "bg-[#120926] border-violet-500/20 text-slate-400"
                    }`}
                  >
                    8+ chars
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      grantPasswordStrength.checks.hasLetter
                        ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                        : "bg-[#120926] border-violet-500/20 text-slate-400"
                    }`}
                  >
                    Letters
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      grantPasswordStrength.checks.hasNumber
                        ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                        : "bg-[#120926] border-violet-500/20 text-slate-400"
                    }`}
                  >
                    Numbers
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      grantPasswordStrength.checks.hasSymbol
                        ? "bg-emerald-500/12 border-emerald-400/40 text-emerald-200"
                        : "bg-[#120926] border-violet-500/20 text-slate-400"
                    }`}
                  >
                    Symbol
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isMaxAdminsReached || grantBusy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold tab-cta-btn disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {grantBusy
                      ? "Granting Admin..."
                      : isMaxAdminsReached
                        ? `Limit Reached (${adminCount}/${maxAdmins})`
                        : "Grant Admin Access"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Row 3: Registered Admin Accounts Table / Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-50 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 tab-accent-text" aria-hidden="true" />
              <span>Registered Admin Accounts ({adminCount})</span>
            </h3>

            <div className="space-y-3">
              {adminAccounts.map((admin) => {
                const isSelf = admin.user_id === authenticatedAdmin.user_id;
                const isEditing = editingAdminId === admin.user_id;
                const isResettingPwd = resetPwdAdminId === admin.user_id;

                return (
                  <div
                    key={admin.user_id}
                    className="p-4 bg-[#090514]/85 border tab-divider rounded-lg space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-50">
                            {admin.display_name || "Admin Account"}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[#140A29] border tab-divider tab-accent-text">
                            {admin.user_id}
                          </span>
                          {isSelf && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-200">
                              Active Session
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300/80">
                          <span className="font-mono">{admin.username}</span>
                          <span>Created: {admin.created_at}</span>
                          <span className="font-mono text-slate-400">
                            Password: Protected (salted SHA-256)
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetPwdAdminId(null);
                            if (isEditing) {
                              setEditingAdminId(null);
                            } else {
                              setEditingAdminId(admin.user_id);
                              setEditDisplayName(admin.display_name || "");
                              setEditUsername(admin.username);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md tab-outline-btn"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isEditing ? "Cancel Edit" : "Edit Info"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingAdminId(null);
                            if (isResettingPwd) {
                              setResetPwdAdminId(null);
                            } else {
                              setResetPwdAdminId(admin.user_id);
                              setResetPwdValue("");
                              setResetPwdConfirm("");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md tab-outline-btn"
                        >
                          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isResettingPwd ? "Cancel Reset" : "Reset Password"}</span>
                        </button>

                        <button
                          type="button"
                          title={
                            isSelf
                              ? "Remove your admin account and lock the Admin Panel"
                              : "Remove admin account"
                          }
                          onClick={() => handleRemoveAdmin(admin)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-rose-500/12 border border-rose-400/35 text-rose-200 hover:bg-rose-500/25 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="pt-3 border-t tab-divider grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-xs text-slate-50 focus:outline-none focus:border-fuchsia-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Username or Email
                          </label>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-xs text-slate-50 focus:outline-none focus:border-fuchsia-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveAdminEdit(admin)}
                          className="px-4 py-2 rounded-md text-xs font-semibold tab-cta-btn"
                        >
                          Save Changes
                        </button>
                      </div>
                    )}

                    {isResettingPwd && (
                      <div className="pt-3 border-t tab-divider space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              New Strong Password
                            </label>
                            <div className="relative">
                              <input
                                type={showResetPwd ? "text" : "password"}
                                value={resetPwdValue}
                                onChange={(e) => setResetPwdValue(e.target.value)}
                                placeholder="8+ chars, letters, num, symbol"
                                className="w-full px-3 py-2 pr-8 rounded-md bg-[#120926] border tab-divider text-xs text-slate-50 focus:outline-none focus:border-fuchsia-400"
                              />
                              <button
                                type="button"
                                onClick={() => setShowResetPwd((v) => !v)}
                                aria-label={showResetPwd ? "Hide password" : "Show password"}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                              >
                                {showResetPwd ? (
                                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              Confirm New Password
                            </label>
                            <input
                              type={showResetPwd ? "text" : "password"}
                              value={resetPwdConfirm}
                              onChange={(e) => setResetPwdConfirm(e.target.value)}
                              placeholder="Re-enter new password"
                              className="w-full px-3 py-2 rounded-md bg-[#120926] border tab-divider text-xs text-slate-50 focus:outline-none focus:border-fuchsia-400"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveAdminPasswordReset(admin)}
                            className="px-4 py-2 rounded-md text-xs font-semibold tab-cta-btn"
                          >
                            Update Password
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span
                            className={
                              resetPasswordStrength.checks.minLength
                                ? "text-emerald-300"
                                : "text-slate-400"
                            }
                          >
                            {resetPasswordStrength.checks.minLength ? "✓" : "○"} 8+ chars
                          </span>
                          <span
                            className={
                              resetPasswordStrength.checks.hasLetter
                                ? "text-emerald-300"
                                : "text-slate-400"
                            }
                          >
                            {resetPasswordStrength.checks.hasLetter ? "✓" : "○"} Letters
                          </span>
                          <span
                            className={
                              resetPasswordStrength.checks.hasNumber
                                ? "text-emerald-300"
                                : "text-slate-400"
                            }
                          >
                            {resetPasswordStrength.checks.hasNumber ? "✓" : "○"} Numbers
                          </span>
                          <span
                            className={
                              resetPasswordStrength.checks.hasSymbol
                                ? "text-emerald-300"
                                : "text-slate-400"
                            }
                          >
                            {resetPasswordStrength.checks.hasSymbol ? "✓" : "○"} Symbol
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
