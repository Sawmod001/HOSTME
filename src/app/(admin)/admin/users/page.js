"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail, ShieldCheck, User } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import AdminSidebar from "@/components/sidebar/AdminSidebar";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = async (p) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?page=${p}&limit=20`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(page); }, [page]);

  return (
    <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "users" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Users</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">Manage platform users</p>
        </div>

        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
            <button onClick={() => fetchUsers(page)} className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
              Try Again
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">No users found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <User size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">{user.name || "Unnamed"}</p>
                      <p className="flex items-center gap-1 text-sm text-[var(--color-ink-muted)]">
                        <Mail size={12} /> {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                      <ShieldCheck size={10} /> {user.role || "guest"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-40">
              Previous
            </button>
            <span className="text-sm text-[var(--color-ink-muted)]">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
