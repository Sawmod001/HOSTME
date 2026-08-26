import RoleGate from "@/components/RoleGate";

export default function AdminLayout({ children }) {
  return (
    <RoleGate allowedRoles={["admin"]}>
      {children}
    </RoleGate>
  );
}
