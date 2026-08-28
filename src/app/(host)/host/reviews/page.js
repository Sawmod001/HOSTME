"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import HostSidebar from "@/components/sidebar/HostSidebar";

export default function HostReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/listings?status=active");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        const listings = data.data || [];

        const allReviews = [];
        for (const listing of listings) {
          try {
            const rRes = await fetch(`/api/listings/${listing.id}/reviews`);
            if (rRes.ok) {
              const rData = await rRes.json();
              const listingReviews = (rData.data || []).map((r) => ({ ...r, listingTitle: listing.title }));
              allReviews.push(...listingReviews);
            }
          } catch {}
        }
        setReviews(allReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : "–";

  return (
    <DashboardLayout sidebar={HostSidebar} sidebarProps={{ activePage: "reviews" }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Reviews</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">See what guests are saying</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs text-[var(--color-ink-muted)]">Average Rating</p>
            <div className="flex items-center gap-2 mt-1">
              <Star size={20} className="text-yellow-500 fill-yellow-500" />
              <span className="text-2xl font-bold text-[var(--color-ink)]">{avgRating}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs text-[var(--color-ink-muted)]">Total Reviews</p>
            <p className="text-2xl font-bold text-[var(--color-ink)] mt-1">{reviews.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">No reviews yet</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Reviews from guests will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{review.listingTitle}</p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} className={i < (review.rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"} />
                    ))}
                  </div>
                </div>
                {review.comment && (
                  <p className="text-sm text-[var(--color-ink-muted)]">{review.comment}</p>
                )}
                <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                  {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
