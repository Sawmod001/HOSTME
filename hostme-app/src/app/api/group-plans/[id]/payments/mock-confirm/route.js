import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { finalizeGroupPlan } from "@/lib/group-booking";
import { resolveActor } from "@/lib/guest-identity";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail, unauthorised, notFound, forbidden, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
    try {
        if (process.env.NODE_ENV === "production") {
            return fail("Payments are not available yet in production", 503);
        }

        if (!rateLimitOk(`pay:${clientIp(request)}`, 30)) {
            return fail("Too many attempts. Try again later.", 429);
        }

        const actor = await resolveActor(request);
        if (!actor) return unauthorised();
        const user = actor.user;

        const p = await params;
        if (!parseId(p.id)) return fail("Invalid plan ID", 400);

        const body = await request.json();
        const memberId = body.memberId || null;

        const query = supabase.from("plan_members").select().eq("plan_id", p.id);
        const { data: members } = memberId
            ? await query.eq("id", memberId)
            : await query.eq("user_id", user.id);

        const member = (members || [])[0];
        if (!member) return notFound("You have not joined this plan");
        if (member.user_id !== user.id) return forbidden();

        const { data: plan } = await supabase.from("group_plans").select().eq("id", p.id).maybeSingle();
        if (!plan) return notFound("Plan not found");

        if (member.status === "paid" || member.status === "confirmed") {
            return ok({ ok: true, data: { memberId: member.id, alreadyPaid: true, finalized: false } });
        }
        if (plan.status !== "active") return fail(`Plan is already ${plan.status}`, 409);

        const txRef = `grpplan-${member.id}-${crypto.randomUUID().slice(0, 8)}`;

        try {
            await supabase.from("processed_webhooks").insert({
                gateway_transaction_ref: txRef,
                gateway: "mock",
            });
        } catch (err) {
            if (err?.code === "23505") return ok({ ok: true, data: { memberId: member.id, duplicate: true } });
            throw err;
        }

        await supabase.from("plan_members").update({
            status: "paid",
            gateway_transaction_ref: txRef,
        }).eq("id", member.id);

        const finalized = await finalizeGroupPlan({ planId: p.id });

        return ok({
            ok: true,
            data: {
                memberId: member.id,
                amountKobo: member.share_amount_kobo,
                paid: true,
                finalized: finalized.ok,
                bookingId: finalized.ok ? finalized.data.bookingId : null,
                message: finalized.ok
                    ? "Plan confirmed!"
                    : finalized.status === 400
                        ? "Your share is paid. Waiting for the rest of the group."
                        : `Your share is paid. ${finalized.error || "Plan could not be finalized yet."}`,
            },
        });
    } catch (error) {
        console.error("POST /api/group-plans/[id]/payments/mock-confirm error:", error);
        return fail("Failed to confirm plan payment", 500);
    }
}