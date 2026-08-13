export function getRedirectPath(meta = {}) {
  const roles = meta.roles || ["guest"];
  const activeRole = meta.activeRole || "guest";

  if (roles.includes("admin")) return "/admin";
  if (!meta.profileCompleted) return "/complete-profile";

  // Respect the active role: a host-capable account whose active role is
  // "guest" goes to the guest dashboard; only host-active users get the
  // host dashboard. This stops guests from being dumped into /host/dashboard.
  if (activeRole === "host") return "/host/dashboard";
  return "/dashboard";
}