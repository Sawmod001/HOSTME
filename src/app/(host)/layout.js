import RoleGate from "@/components/RoleGate";

export default function HostLayout({ children }) {
  return (
    <RoleGate allowedRoles={["venue_host", "housing_agent", "admin"]}>
      {children}
    </RoleGate>
  );
}
