/**
 * Application-level permission matrix. This mirrors (and is enforced in addition to)
 * the PostgreSQL RLS policies — UI visibility is NEVER the only control.
 */
export type Role = "SUPER_ADMIN" | "CONTENT_MANAGER" | "STUDENT";

export const PERMISSIONS = {
  "admin.access": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "course.create": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "course.editAssigned": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "course.submitForReview": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "course.publish": ["SUPER_ADMIN"],
  "course.approve": ["SUPER_ADMIN"],
  "course.archive": ["SUPER_ADMIN"],
  "course.pricing": ["SUPER_ADMIN"],
  "course.assignManagers": ["SUPER_ADMIN"],
  "media.upload": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "quiz.manage": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "assignment.grade": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "live.propose": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "live.approve": ["SUPER_ADMIN"],
  "live.host": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "invitation.create": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "invitation.complimentary": ["SUPER_ADMIN"],
  "analytics.limited": ["SUPER_ADMIN", "CONTENT_MANAGER"],
  "analytics.platform": ["SUPER_ADMIN"],
  "revenue.view": ["SUPER_ADMIN"],
  "orders.manage": ["SUPER_ADMIN"],
  "refunds.issue": ["SUPER_ADMIN"],
  "coupons.manage": ["SUPER_ADMIN"],
  "users.manage": ["SUPER_ADMIN"],
  "team.manage": ["SUPER_ADMIN"],
  "certificates.manage": ["SUPER_ADMIN"],
  "settings.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN"],
  "outbox.view": ["SUPER_ADMIN"],
  "student.learn": ["STUDENT", "SUPER_ADMIN", "CONTENT_MANAGER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly Role[] | undefined | null, permission: Permission): boolean {
  if (!roles?.length) return false;
  const allowed = PERMISSIONS[permission] as readonly Role[];
  return roles.some((r) => allowed.includes(r));
}

export const isStaff = (roles: readonly Role[]) => can(roles, "admin.access");
export const isSuperAdmin = (roles: readonly Role[]) => roles.includes("SUPER_ADMIN");

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export function assertCan(roles: readonly Role[] | undefined, permission: Permission) {
  if (!can(roles, permission)) throw new ForbiddenError();
}

/** Admin navigation filtered by permission — the server re-checks on every page. */
export const ADMIN_NAV: { href: string; label: string; icon: string; permission: Permission }[] = [
  { href: "/admin", label: "Overview", icon: "grid", permission: "admin.access" },
  { href: "/admin/courses", label: "Courses", icon: "book", permission: "course.editAssigned" },
  { href: "/admin/approvals", label: "Approvals", icon: "check", permission: "course.approve" },
  { href: "/admin/live", label: "Live classes", icon: "video", permission: "live.propose" },
  { href: "/admin/media", label: "Media library", icon: "film", permission: "media.upload" },
  { href: "/admin/submissions", label: "Submissions", icon: "inbox", permission: "assignment.grade" },
  { href: "/admin/invitations", label: "Invitations", icon: "send", permission: "invitation.create" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart", permission: "analytics.limited" },
  { href: "/admin/users", label: "Students & users", icon: "users", permission: "users.manage" },
  { href: "/admin/team", label: "Content team", icon: "shield", permission: "team.manage" },
  { href: "/admin/orders", label: "Orders & refunds", icon: "wallet", permission: "orders.manage" },
  { href: "/admin/coupons", label: "Coupons", icon: "tag", permission: "coupons.manage" },
  { href: "/admin/certificates", label: "Certificates", icon: "award", permission: "certificates.manage" },
  { href: "/admin/outbox", label: "Email outbox", icon: "mail", permission: "outbox.view" },
  { href: "/admin/audit", label: "Audit log", icon: "list", permission: "audit.view" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
];
