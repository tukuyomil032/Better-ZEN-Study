import { describe, expect, test } from "bun:test";
import { quietly, sendSafely } from "../src/lib/context-safety";

describe("sendSafely", () => {
  test("passes the reply through when the send works", async () => {
    const reply = await sendSafely(async (message) => ({ echoed: message }), { type: "x" });
    expect(reply).toEqual({ echoed: { type: "x" } });
  });

  test("a send that fails later is reported as no reply, not thrown", async () => {
    const reply = await sendSafely(async () => {
      throw new Error("Could not establish connection");
    }, {});
    expect(reply).toBeUndefined();
  });

  test("a send that throws straight away, as a reloaded extension's does, is also no reply", async () => {
    // After a reload the runtime call throws at once, with "Extension context invalidated.".
    const send = (): Promise<unknown> => {
      throw new Error("Extension context invalidated.");
    };
    await expect(sendSafely(send, {})).resolves.toBeUndefined();
  });
});

describe("quietly", () => {
  test("runs the cleanup when the context is still alive", () => {
    let ran = false;
    quietly(() => {
      ran = true;
    })();
    expect(ran).toBe(true);
  });

  test("a cleanup that throws because the context was reloaded is swallowed", () => {
    const cleanup = quietly(() => {
      throw new Error("You must add the 'storage' permission to your manifest");
    });
    expect(() => cleanup()).not.toThrow();
  });
});
