"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ name: "", phone: "", bio: "" });

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const user = data.data || data;
        setProfile(user);
        setForm({
          name: user.name || "",
          phone: user.phone || "",
          bio: user.profile?.bio || "",
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          profile: { bio: form.bio },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
      <div className="mx-auto max-w-lg space-y-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">My Profile</h1>
            <p className="text-sm text-[var(--color-ink-muted)]">{profile?.email}</p>
          </div>

          {error && (
            <div className="rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#991B1B]">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--color-ink)] block mb-1">Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-ink)] block mb-1">Email</label>
              <input value={profile?.email || ""} disabled
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm text-[var(--color-ink-muted)]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-ink)] block mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-ink)] block mb-1">Bio</label>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm" rows={3} />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs text-[var(--color-ink-muted)]">Roles: {(profile?.roles || []).join(", ")}</p>
          <p className="text-xs text-[var(--color-ink-muted)]">Member since {new Date(profile?.createdAt || profile?.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </main>
  );
}
