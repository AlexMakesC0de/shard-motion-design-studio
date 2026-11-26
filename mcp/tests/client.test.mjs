import { readFileSync } from "node:fs";
import { stubs, call } from "./helpers.mjs";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { connectInProcess } = await import("../client.mjs");

describe("connectInProcess", () => {
  test("lists the same 59 tools and the server's instructions, and calls a tool through the given deps", async () => {
    const { deps } = stubs();
    const { client, close } = await connectInProcess({ deps });
    const { tools } = await client.listTools();
    assert.equal(tools.length, 59);
    assert.ok(tools.some((t) => t.name === "generate_video"));
    assert.match(client.getInstructions(), /^Shard, a motion-design studio over kie\.ai\./);
    const r = await call(client, "estimate", { model: "seedance-2-5", duration_s: 4, resolution: "480p" });
    assert.equal(r.isError, undefined, JSON.stringify(r));
    assert.equal(typeof r.structuredContent.estimateUsd, "number");
    await close();
  });

  test("the server reports the version in mcp/package.json", async () => {
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const { client, close } = await connectInProcess({ deps: stubs().deps });
    assert.equal(client.getServerVersion().version, version);
    await close();
  });
});
