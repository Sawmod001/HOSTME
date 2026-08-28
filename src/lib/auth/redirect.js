export function getRedirectPath(meta = {}) {
  const role = meta.role || "guest";

  if (role === "admin") return "/admin";
  if (!meta.profileCompleted) return "/complete-profile";

  if (role === "venue_host") return "/host/dashboard";
  if (role === "shortlet_host") return "/host/dashboard";
  return "/dashboard";
}
