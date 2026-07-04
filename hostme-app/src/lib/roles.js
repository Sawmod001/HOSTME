export function hasRequiredRole(user, requiredRole) {
    return Array.isArray(user?.roles) && user.roles.includes(requiredRole);
}
