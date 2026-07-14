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
