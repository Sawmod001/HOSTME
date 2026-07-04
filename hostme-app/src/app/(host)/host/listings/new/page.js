"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function CreateListingPage() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        vertical: "venue",
        bookingType: "capacity",
        title: "",
        description: "",
        location: {
            state: "",
            cityArea: "",
            address: "",
            coordinates: { latitude: 0, longitude: 0 },
        },
        pricing: {
            baseRatePerHour: 0,
        },
        operationalRules: {
            maxCapacity: 10,
            setupBufferMinutes: 30,
            teardownBufferMinutes: 30,
            isByobAllowed: false,
            cancellationPolicy: "moderate",
        },
        addOns: [],
    });

    const handleInputChange = (path, value) => {
        const keys = path.split(".");
        setFormData((prev) => {
            const newData = JSON.parse(JSON.stringify(prev));
            let current = newData;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) current[keys[i]] = {};
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newData;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch("/api/listings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to create listing");
            }

            const listing = await response.json();
            router.push(`/host/listings`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
                <Link href="/host/listings" className="flex items-center gap-2 text-[var(--color-primary)]">
                    <ArrowLeft size={18} />
                    Back to my listings
                </Link>

                <div className="space-y-3">
                    <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Create New Listing</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">Fill in the details to create and submit your space</p>
                </div>

                {error && (
                    <div className="rounded-xl border border-[#B91C1C] bg-[#FEE2E2] p-4 text-sm text-[#7F1D1D]">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-white p-6">
                    {/* Type Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Vertical</label>
                            <select
                                value={formData.vertical}
                                onChange={(e) => handleInputChange("vertical", e.target.value)}
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            >
                                <option value="venue">Venue</option>
                                <option value="housing">Housing</option>
                                <option value="preorder">Pre-Order</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Booking Type</label>
                            <select
                                value={formData.bookingType}
                                onChange={(e) => handleInputChange("bookingType", e.target.value)}
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            >
                                <option value="capacity">Capacity-Based</option>
                                <option value="exclusive">Exclusive Space</option>
                            </select>
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div>
                        <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Title</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleInputChange("title", e.target.value)}
                            placeholder="e.g. Lekki Waterfront Lounge"
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleInputChange("description", e.target.value)}
                            placeholder="Describe your space, atmosphere, rules, etc."
                            rows="4"
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        />
                    </div>

                    {/* Location */}
                    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                        <h3 className="font-semibold text-[var(--color-ink)]">Location</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">State</label>
                                <input
                                    type="text"
                                    value={formData.location.state}
                                    onChange={(e) => handleInputChange("location.state", e.target.value)}
                                    placeholder="e.g. Lagos"
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">City Area</label>
                                <input
                                    type="text"
                                    value={formData.location.cityArea}
                                    onChange={(e) => handleInputChange("location.cityArea", e.target.value)}
                                    placeholder="e.g. Lekki"
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Address</label>
                            <input
                                type="text"
                                value={formData.location.address}
                                onChange={(e) => handleInputChange("location.address", e.target.value)}
                                placeholder="Full address"
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    {/* Pricing & Capacity */}
                    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                        <h3 className="font-semibold text-[var(--color-ink)]">Pricing & Capacity</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Base Rate (₦/hour)</label>
                                <input
                                    type="number"
                                    value={formData.pricing.baseRatePerHour / 100}
                                    onChange={(e) => handleInputChange("pricing.baseRatePerHour", parseInt(e.target.value) * 100)}
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Max Capacity</label>
                                <input
                                    type="number"
                                    value={formData.operationalRules.maxCapacity}
                                    onChange={(e) => handleInputChange("operationalRules.maxCapacity", parseInt(e.target.value))}
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Buffers */}
                    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                        <h3 className="font-semibold text-[var(--color-ink)]">Buffers</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Setup (minutes)</label>
                                <input
                                    type="number"
                                    value={formData.operationalRules.setupBufferMinutes}
                                    onChange={(e) => handleInputChange("operationalRules.setupBufferMinutes", parseInt(e.target.value))}
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Teardown (minutes)</label>
                                <input
                                    type="number"
                                    value={formData.operationalRules.teardownBufferMinutes}
                                    onChange={(e) => handleInputChange("operationalRules.teardownBufferMinutes", parseInt(e.target.value))}
                                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Policies */}
                    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                        <h3 className="font-semibold text-[var(--color-ink)]">Policies</h3>
                        <div>
                            <label className="text-sm font-semibold text-[var(--color-ink)] block mb-2">Cancellation Policy</label>
                            <select
                                value={formData.operationalRules.cancellationPolicy}
                                onChange={(e) => handleInputChange("operationalRules.cancellationPolicy", e.target.value)}
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            >
                                <option value="flexible">Flexible (90% refund)</option>
                                <option value="moderate">Moderate (50% refund)</option>
                                <option value="strict">Strict (20% refund)</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={formData.operationalRules.isByobAllowed}
                                onChange={(e) => handleInputChange("operationalRules.isByobAllowed", e.target.checked)}
                                className="rounded border border-[var(--color-border)]"
                            />
                            <span className="text-[var(--color-ink)]">Allow BYOB (Bring Your Own Bottle)</span>
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting && <Loader2 size={18} className="animate-spin" />}
                        {submitting ? "Creating..." : "Create & Submit for Review"}
                    </button>
                </form>
            </div>
        </main>
    );
}
