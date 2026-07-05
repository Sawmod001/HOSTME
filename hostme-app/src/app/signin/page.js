"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [location, setLocation] = useState("");
    const [gender, setGender] = useState("");
    const [role, setRole] = useState("guest");
    const [otpCode, setOtpCode] = useState("");
    const [status, setStatus] = useState("Sign in or create an account to continue.");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleSignIn(event) {
        event.preventDefault();
        if (!email.trim() || !password) {
            setStatus("Please enter your email and password.");
            return;
        }

        setLoading(true);
        setStatus("Signing in...");

        try {
            const result = await signIn("credentials", { email, password, redirect: false });
            if (result?.error) {
                setStatus("Sign-in failed. Please check your credentials.");
            } else {
                setStatus("Signed in successfully. Redirecting...");
                router.push("/listings");
            }
        } catch (error) {
            setStatus("Sign-in failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleSignUp(event) {
        event.preventDefault();
        if (!email.trim() || !password || !fullName.trim()) {
            setStatus("Please complete the required fields.");
            return;
        }

        setLoading(true);
        setStatus("Creating your account...");

        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, phone, location, gender, role }),
            });
            const data = await response.json();
            if (!response.ok) {
                setStatus(data.error || "Unable to create account.");
            } else {
                setStatus("Account created. Please verify your email with the OTP.");
                setMode("verify");
            }
        } catch (error) {
            setStatus("Unable to create account.");
        } finally {
            setLoading(false);
        }
    }

    async function handleVerify(event) {
        event.preventDefault();
        if (!email.trim() || !otpCode.trim()) {
            setStatus("Please enter the OTP sent to your email.");
            return;
        }

        setLoading(true);
        setStatus("Verifying your email...");

        try {
            const response = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otpCode }),
            });
            const data = await response.json();
            if (!response.ok) {
                setStatus(data.error || "OTP verification failed.");
            } else {
                setStatus("Email verified. You can now sign in.");
                setMode("signin");
            }
        } catch (error) {
            setStatus("OTP verification failed.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-8 text-[var(--color-ink)]">
            <div className="mx-auto flex max-w-md flex-col gap-6 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
                <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">HostMe</p>
                    <h1 className="text-2xl font-semibold">Welcome to HostMe</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">Create an account, verify your email, and join the marketplace.</p>
                </div>

                <div className="flex gap-2">
                    <button className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "signin" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-alt)] text-[var(--color-ink)]"}`} onClick={() => setMode("signin")}>Sign In</button>
                    <button className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-alt)] text-[var(--color-ink)]"}`} onClick={() => setMode("signup")}>Sign Up</button>
                    <button className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "verify" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-alt)] text-[var(--color-ink)]"}`} onClick={() => setMode("verify")}>Verify OTP</button>
                </div>

                {mode === "signin" && (
                    <form className="flex flex-col gap-4" onSubmit={handleSignIn}>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Email
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Password
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
                        </label>
                        <button className="rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" type="submit" disabled={loading}>
                            {loading ? "Signing in..." : "Continue"}
                        </button>
                    </form>
                )}

                {mode === "signup" && (
                    <form className="flex flex-col gap-4" onSubmit={handleSignUp}>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Full name
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ada Okafor" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Email
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Password
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Phone number
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08012345678" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Location
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Lagos, Nigeria" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Gender
                            <select className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" value={gender} onChange={(event) => setGender(event.target.value)}>
                                <option value="">Prefer not to say</option>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="other">Other</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            I am joining as
                            <select className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" value={role} onChange={(event) => setRole(event.target.value)}>
                                <option value="guest">Guest</option>
                                <option value="host">Host / Vendor / Agent</option>
                                <option value="admin">Admin</option>
                            </select>
                        </label>
                        <button className="rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" type="submit" disabled={loading}>
                            {loading ? "Creating account..." : "Create account"}
                        </button>
                    </form>
                )}

                {mode === "verify" && (
                    <form className="flex flex-col gap-4" onSubmit={handleVerify}>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Email
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            OTP code
                            <input className="rounded-xl border border-[var(--color-border)] px-4 py-3 outline-none ring-0" type="text" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="123456" />
                        </label>
                        <button className="rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" type="submit" disabled={loading}>
                            {loading ? "Verifying..." : "Verify email"}
                        </button>
                    </form>
                )}

                <p className="text-sm text-[var(--color-ink-muted)]">{status}</p>
            </div>
        </main>
    );
}
