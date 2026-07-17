import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("strict-auth reads", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_AUTH_STRICT = "true";
    localStorage.clear();
    localStorage.setItem("kairos-token", "access-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_AUTH_STRICT;
    localStorage.clear();
  });

  it("attaches the access token to a protected GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ briefs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getBriefs } = await import("./api");
    await getBriefs();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/briefs/"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      }),
    );
  });

  it("refreshes once and retries a protected GET after a 401", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "refreshed-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ briefs: [{ brief_id: "b-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("kairos-refresh", "refresh-token");

    const { getBriefs } = await import("./api");
    await getBriefs();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer refreshed-token" }),
    }));
  });

  it("clears the session when the refreshed GET is also rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "refreshed-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("kairos-refresh", "refresh-token");

    const { getBriefs } = await import("./api");
    await getBriefs();

    expect(localStorage.getItem("kairos-token")).toBeNull();
    expect(localStorage.getItem("kairos-refresh")).toBeNull();
  });

  it("clears the session when the refreshed write is also rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "refreshed-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("kairos-refresh", "refresh-token");

    const { ackBrief } = await import("./api");
    await expect(ackBrief("brief-1", {})).rejects.toThrow("HTTP 401");

    expect(localStorage.getItem("kairos-token")).toBeNull();
    expect(localStorage.getItem("kairos-refresh")).toBeNull();
  });

  it("refreshes before retrying a multipart voice upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "refreshed-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("kairos-refresh", "refresh-token");

    const { submitVoiceNote } = await import("./api");
    await expect(submitVoiceNote("wo-1", new Blob(["audio"]), "u-1")).resolves.toMatchObject({ task_id: "task-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer refreshed-token" }),
    }));
  });
});

describe("audit-pack fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a visualizable frontend fixture when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { getAuditPack } = await import("./api");

    const result = await getAuditPack("OISD-117");

    expect(result.source).toBe("demo");
    expect(result.data?.framework).toBe("OISD-117");
    expect(result.data?.clauses.length).toBeGreaterThan(0);
    expect(result.data?.clauses.some((clause) => clause.clearance_blocked)).toBe(true);
    expect(result.data?.clauses.some((clause) => clause.evidence.length > 0)).toBe(true);
  });
});

describe("event demo fixtures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns varied click-through events when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { getEvent, getEvents } = await import("./api");
    const list = await getEvents({ limit: 4 });

    expect(list.source).toBe("demo");
    expect(list.data.items).toHaveLength(4);
    expect(new Set(list.data.items.map((event) => event.priority)).size).toBeGreaterThan(1);
    expect(list.data.items.some((event) => event.acknowledged)).toBe(true);
    expect(list.data.items.some((event) => !event.acknowledged)).toBe(true);

    const detail = await getEvent(list.data.items[0].event_id);
    expect(detail.source).toBe("demo");
    expect(detail.data).toMatchObject({ event_id: list.data.items[0].event_id });
    expect(detail.data?.payload).not.toEqual({});
  });

  it("uses demo events when the live event feed is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [], total: 0, limit: 50, offset: 0,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { getEvents } = await import("./api");
    const result = await getEvents();

    expect(result.source).toBe("demo");
    expect(result.data.items.length).toBeGreaterThan(0);
  });
});
