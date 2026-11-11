/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MAX_ATTEMPTS } from "./automation";
import { hmacHex, inboundMessage, outboundMessage } from "./lib/hmac";

const modules = import.meta.glob("./**/*.ts");
const INBOUND_SECRET = "test-inbound-secret";
const OUTBOUND_SECRET = "test-outbound-secret";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("N8N_INBOUND_SECRET", INBOUND_SECRET);
  vi.stubEnv("N8N_WEBHOOK_SECRET", OUTBOUND_SECRET);
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
  // Default: n8n accepts everything.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 202 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  const as = async (name: string, email: string) => {
    const user = t.withIdentity({ name, email, subject: name.toLowerCase(), emailVerified: true });
    await user.mutation(api.users.store, {});
    return user;
  };
  const alice = await as("Alice", "alice@example.com"); // lender
  const bob = await as("Bob", "bob@example.com"); // borrower
  const mallory = await as("Mallory", "mallory@example.com"); // unrelated user
  const admin = await as("Ada", "admin@example.com");
  const toolId = await alice.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18V",
  });
  return { t, alice, bob, mallory, admin, toolId };
}

async function signedFetch(
  t: ReturnType<typeof convexTest>,
  method: "GET" | "POST",
  path: string,
  body = "",
  opts: { secret?: string; tsOffset?: number } = {},
) {
  const ts = String(Math.floor(Date.now() / 1000) + (opts.tsOffset ?? 0));
  const sig = await hmacHex(opts.secret ?? INBOUND_SECRET, inboundMessage(ts, method, path, body));
  return t.fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-LendLoop-Timestamp": ts,
      "X-LendLoop-Signature": `sha256=${sig}`,
    },
    body: method === "GET" ? undefined : body,
  });
}

describe("roles & ownership", () => {
  test("unauthenticated users only see name + category", async () => {
    const { t } = await setup();
    const list = await t.query(api.tools.listPublic, {});
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["_id", "category", "name"]);
    await expect(t.query(api.tools.listAll, {})).rejects.toThrow(/Sign in required/);
  });

  test("admin role comes from ADMIN_EMAILS, not the client", async () => {
    const { admin, bob } = await setup();
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
    expect((await bob.query(api.users.me, {}))?.role).toBe("user");
  });

  test("non-owner cannot edit or delete a listing", async () => {
    const { mallory, toolId } = await setup();
    await expect(
      mallory.mutation(api.tools.update, {
        toolId,
        name: "Mine now",
        category: "garden",
        condition: "worn",
        description: "",
      }),
    ).rejects.toThrow(/own listings/);
    await expect(mallory.mutation(api.tools.remove, { toolId })).rejects.toThrow(/own listings/);
  });

  test("cannot borrow your own tool", async () => {
    const { alice, toolId } = await setup();
    await expect(
      alice.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) }),
    ).rejects.toThrow(/own tool/);
  });

  test("only the lender can approve; borrower cannot self-approve", async () => {
    const { alice, bob, mallory, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    await expect(bob.mutation(api.loans.approve, { loanId })).rejects.toThrow(/not allowed/);
    await expect(mallory.mutation(api.loans.approve, { loanId })).rejects.toThrow(/not allowed/);
    await expect(mallory.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/not allowed/);
    await alice.mutation(api.loans.approve, { loanId });
    const [loan] = await bob.query(api.loans.listMine, {});
    expect(loan.status).toBe("approved");
  });

  test("invalid status transitions are rejected", async () => {
    const { alice, bob, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    await expect(alice.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/pending/);
    await alice.mutation(api.loans.decline, { loanId });
    await expect(alice.mutation(api.loans.approve, { loanId })).rejects.toThrow(/declined/);
  });

  test("overlapping approvals are rejected", async () => {
    const { t, alice, bob, toolId } = await setup();
    const carol = t.withIdentity({ name: "Carol", email: "carol@example.com", subject: "carol" });
    await carol.mutation(api.users.store, {});
    const l1 = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(5) });
    const l2 = await carol.mutation(api.loans.request, { toolId, startDate: day(4), endDate: day(6) });
    await alice.mutation(api.loans.approve, { loanId: l1 });
    await expect(alice.mutation(api.loans.approve, { loanId: l2 })).rejects.toThrow(/overlap/);
  });

  test("users only see loans they are part of", async () => {
    const { bob, mallory, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    expect(await mallory.query(api.loans.listMine, {})).toHaveLength(0);
    expect(await mallory.query(api.loans.listIncoming, {})).toHaveLength(0);
  });

  test("admin-only functions reject regular users", async () => {
    const { admin, bob, mallory, toolId } = await setup();
    await expect(mallory.query(api.admin.listAllLoans, {})).rejects.toThrow(/Admin role/);
    const bobId = (await bob.query(api.users.me, {}))!._id;
    await expect(mallory.mutation(api.admin.setTrustedLender, { userId: bobId, trusted: true })).rejects.toThrow(
      /Admin role/,
    );
    await expect(mallory.mutation(api.admin.removeListing, { toolId })).rejects.toThrow(/Admin role/);

    await admin.mutation(api.admin.setTrustedLender, { userId: bobId, trusted: true });
    expect((await bob.query(api.users.me, {}))?.trustedLender).toBe(true);
    await admin.mutation(api.admin.removeListing, { toolId });
    expect(await bob.query(api.tools.listAll, {})).toHaveLength(0);
  });
});

describe("Convex -> n8n webhook", () => {
  test("sends a signed, minimal payload to the lender on request", async () => {
    const { t, bob, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const expected = await hmacHex(OUTBOUND_SECRET, outboundMessage(headers["X-LendLoop-Timestamp"], body));
    expect(headers["X-LendLoop-Signature"]).toBe(`sha256=${expected}`);

    const payload = JSON.parse(body);
    expect(payload.eventType).toBe("loan.requested");
    expect(payload.recipient).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(Object.keys(payload).sort()).toEqual(
      ["endDate", "eventId", "eventType", "loanId", "recipient", "startDate", "toolName"].sort(),
    );
  });

  test("retries with backoff then marks the delivery failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { t, bob, admin, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const issues = await admin.query(api.admin.automationIssues, {});
    expect(issues.failedDeliveries).toHaveLength(1);
    expect(issues.failedDeliveries[0].attempts).toBe(MAX_ATTEMPTS);
    const [loan] = await bob.query(api.loans.listMine, {});
    expect(loan.activity[0].status).toBe("failed");
  });

  test("a 404 (n8n starting up) is retried; a 401 (bad secret) is not", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: ++calls === 1 ? 404 : 202 })),
    );
    const { t, bob, admin, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toBe(2);
    expect((await admin.query(api.admin.automationIssues, {})).failedDeliveries).toHaveLength(0);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const [loan] = await bob.query(api.loans.listMine, {});
    await bob.mutation(api.loans.cancel, { loanId: loan._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect((await admin.query(api.admin.automationIssues, {})).failedDeliveries).toHaveLength(1);
  });
});

describe("n8n -> Convex HTTP endpoints", () => {
  test("rejects bad signatures and stale timestamps", async () => {
    const { t } = await setup();
    expect((await t.fetch("/api/overdue-loans", { method: "GET" })).status).toBe(401);
    expect((await signedFetch(t, "GET", "/api/overdue-loans", "", { secret: "wrong" })).status).toBe(401);
    expect((await signedFetch(t, "GET", "/api/overdue-loans", "", { tsOffset: -3600 })).status).toBe(401);
    expect((await signedFetch(t, "GET", "/api/overdue-loans")).status).toBe(200);
  });

  test("overdue reminders: listing + idempotent write-back", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await alice.mutation(api.loans.approve, { loanId });
    await t.mutation(internal.seed.backdateLoan, { loanId, daysAgo: 2 });

    const res = await signedFetch(t, "GET", "/api/overdue-loans");
    const { loans } = await res.json();
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ loanId, daysOverdue: 2, borrower: { name: "Bob" } });

    const body = JSON.stringify({
      idempotencyKey: loans[0].reminderKey,
      loanId,
      kind: "overdue_reminder",
      status: "sent",
      channel: "mock",
      n8nExecutionId: "42",
    });
    const first = await (await signedFetch(t, "POST", "/api/automation-events", body)).json();
    const second = await (await signedFetch(t, "POST", "/api/automation-events", body)).json();
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows).toHaveLength(1);

    // Already reminded today -> excluded from the next run.
    const again = await (await signedFetch(t, "GET", "/api/overdue-loans")).json();
    expect(again.loans).toHaveLength(0);

    const [loan] = await bob.query(api.loans.listMine, {});
    expect(loan.overdue).toBe(true);
    expect(loan.activity[0]).toMatchObject({ kind: "overdue_reminder", status: "sent" });
  });

  test("a failed reminder is upgraded in place when a retry succeeds", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await alice.mutation(api.loans.approve, { loanId });
    const base = { idempotencyKey: `overdue:${loanId}:x`, loanId, kind: "overdue_reminder", channel: "mock" };
    await signedFetch(t, "POST", "/api/automation-events", JSON.stringify({ ...base, status: "failed" }));
    await signedFetch(t, "POST", "/api/automation-events", JSON.stringify({ ...base, status: "sent" }));
    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
  });

  test("workflow errors are recorded once per execution", async () => {
    const { t, admin } = await setup();
    const body = JSON.stringify({ executionId: "99", workflowName: "Overdue", nodeName: "HTTP", message: "boom" });
    await signedFetch(t, "POST", "/api/automation-errors", body);
    await signedFetch(t, "POST", "/api/automation-errors", body);
    const issues = await admin.query(api.admin.automationIssues, {});
    expect(issues.failedEvents).toHaveLength(1);
    expect(issues.failedEvents[0].detail).toContain("boom");
  });
});
