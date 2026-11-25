import {
  Activity,
  BarChart3,
  CalendarClock,
  CircleDot,
  ClipboardList,
  Database,
  GitBranch,
  HeartPulse,
  Lock,
  Shield,
  ShieldCheck,
  Stethoscope,
  Thermometer,
  Users,
} from "lucide-react";
import type { ActiveRole, ActiveTab } from "../types";
import { TAB_THEMES } from "../utils/tabTheme";

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  activeRole: ActiveRole;
  onSelectRole: (role: ActiveRole) => void;
  isAdminAuthenticated: boolean;
  onOpenOrb: () => void;
  studentCount: number;
  reportCount: number;
  factorCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const STUDENT_NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof Database;
}> = [
  { id: "survey", label: "Survey & Entry", icon: ClipboardList },
  { id: "consultation", label: "Doctor Chat", icon: Stethoscope },
  { id: "tracker", label: "Health & Fever Tracker", icon: Thermometer },
  { id: "guide", label: "Symptom & First-Aid Guide", icon: HeartPulse },
  { id: "routine", label: "Recovery Routine", icon: CalendarClock },
];

const ADMIN_LOCKED_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof Database;
}> = [{ id: "admin", label: "Admin Security Portal", icon: Lock }];

const ADMIN_UNLOCKED_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof Database;
}> = [
  { id: "admin", label: "Admin Panel", icon: ShieldCheck },
  { id: "telemetry", label: "Stress Reports", icon: Activity },
  { id: "analytics", label: "Analytics & Alerts", icon: BarChart3 },
  { id: "students", label: "Students Directory", icon: Users },
  { id: "relational", label: "Schema & Backup", icon: GitBranch },
];

const ROLES: Array<{ id: ActiveRole; label: string }> = [
  { id: "Student", label: "Student" },
  { id: "Admin", label: "Admin" },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  activeRole,
  onSelectRole,
  isAdminAuthenticated,
  onOpenOrb,
  studentCount,
  reportCount,
  factorCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const visibleItems =
    activeRole === "Student"
      ? STUDENT_NAV_ITEMS
      : isAdminAuthenticated
        ? ADMIN_UNLOCKED_ITEMS
        : ADMIN_LOCKED_ITEMS;

  const sectionLabel =
    activeRole === "Student"
      ? "Student Workspace"
      : isAdminAuthenticated
        ? "Admin Workspace"
        : "Admin Gate (Locked)";

  const navContent = (
    <div className="flex h-full flex-col justify-between tab-sidebar-shell backdrop-blur-sm w-64">
      <div className="overflow-y-auto">
        <div className="px-5 py-5 border-b tab-divider">
          <span className="block font-display text-sm font-semibold tracking-tight text-violet-50 leading-snug">
            Health AI Monitoring System
          </span>
          <span className="mt-0.5 block text-xs tab-accent-text whitespace-nowrap">
            Student Wellness DBMS
          </span>
        </div>

        {/* Strict Active Role Switcher */}
        <div className="px-3 pt-3 pb-2.5 border-b tab-divider">
          <div className="px-1 pb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300/75">
            <Shield className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
            <span>Active Role</span>
          </div>
          <div
            role="group"
            aria-label="Switch active role"
            className="grid grid-cols-2 gap-1 p-0.5 bg-[#090514] border tab-divider rounded-md"
          >
            {ROLES.map((r) => {
              const active = activeRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onSelectRole(r.id);
                    onCloseMobile();
                  }}
                  className={`px-1.5 py-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    active
                      ? "tab-chip-active border"
                      : "text-slate-300/70 border border-transparent hover:text-slate-100"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <nav aria-label="Primary navigation" className="px-3 py-3 space-y-1">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/80">
            {sectionLabel}
          </div>

          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const itemTheme = TAB_THEMES[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-[13px] font-medium rounded-md tab-theme-transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/70 ${
                  isActive
                    ? "tab-nav-active"
                    : "text-slate-300/75 border border-transparent hover:bg-[#190F35]/85 hover:text-slate-50"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-300 ${
                    itemTheme.dotClass
                  } ${isActive ? "scale-110 opacity-100" : "opacity-45"}`}
                />
              </button>
            );
          })}

          {activeRole === "Admin" && !isAdminAuthenticated && (
            <p className="px-2.5 pt-2 text-[11px] text-slate-400/85 leading-relaxed">
              Sign in via the Admin Security Portal to unlock student records, reports, and schema tools.
            </p>
          )}

          <div className="pt-3 mt-3 border-t tab-divider">
            <button
              type="button"
              onClick={() => {
                onOpenOrb();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-300/75 hover:bg-[#190F35]/85 hover:text-slate-100 rounded-md tab-theme-transition whitespace-nowrap"
            >
              <CircleDot className="w-4 h-4 shrink-0 tab-accent-text" aria-hidden="true" />
              <span>Orb Entry Screen</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="px-5 py-4 border-t tab-divider text-xs text-slate-300/75 shrink-0">
        <div className="font-medium text-slate-100 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
          <span>6-Table 3NF Store</span>
        </div>
        {activeRole === "Admin" && !isAdminAuthenticated ? (
          <div className="mt-1.5 text-[11px] text-slate-400">
            Admin login required to view counts
          </div>
        ) : (
          <div className="mt-1.5 tabular-nums font-mono text-[11px] text-slate-300/65 flex items-center gap-1.5 flex-wrap">
            <span>{studentCount} stu</span>
            <span aria-hidden="true">·</span>
            <span>{reportCount} rpt</span>
            <span aria-hidden="true">·</span>
            <span>{factorCount} fac</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 z-20">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
