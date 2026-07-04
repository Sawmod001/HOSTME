"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState("Enter your email to continue.");

    async function handleSubmit(event) {
        event.preventDefault();
        setStatus("Signing in...");
        await signIn("credentials", { email, redirect: false });
        setStatus("Signed in successfully.");
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-8 text-[var(--color-ink)]">
            <div className="mx-auto flex max-w-md flex-col gap-6 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
                <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">HostMe</p>
                    <h1 className="text-2xl font-semibold">Guest sign in</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">This scaffold uses a credential placeholder for Stage 0.</p>
                </div>

                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    <label className="flex flex-col gap-2 text-sm font-medium">
                        Email
                        <input
                            className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="guest@example.com"
                        />
                    </label>

                    <button className="rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white" type="submit">
                        Continue
                    </button>
                </form>

                <p className="text-sm text-[var(--color-ink-muted)]">{status}</p>
            </div>
        </main>
    );
}
