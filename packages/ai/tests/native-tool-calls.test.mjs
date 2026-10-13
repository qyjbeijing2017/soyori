import assert from "node:assert/strict";
import test from "node:test";
import { parseNativeCalls } from "../dist/native-tool-calls.js";

test("native call parser rejects executable expressions, ambiguity and resource abuse", () => {
  for (const source of [
    '[tool(x=__import__("os"))]',
    "[tool(x=1+2)]",
    "[tool(x=foo.bar)]",
    "[tool(*args)]",
    "[tool(**args)]",
    '[tool("positional")]',
    "[tool(x=1,x=2)]",
    '[tool(x={"a":1,"a":2})]',
    '[tool(x={"__proto__":{}})]',
    "[tool(__proto__=1)]",
    "[tool(x=NaN)]",
    "[tool(x=1e999)]",
    '[tool(x="bad\\x41")]',
    "[tool(x=1)] trailing",
    "[tool(x=1)",
    "[]",
    `[tool(x=${"[".repeat(34)}0${"]".repeat(34)})]`,
    `[${Array.from({ length: 33 }, () => "tool()").join(",")}]`,
    `[tool(x="${"a".repeat(65536)}")]`,
  ])
    assert.throws(() => parseNativeCalls(source), /AI_TOOL_CALLS/, source.slice(0, 100));
  assert.deepEqual(parseNativeCalls('[tool(x={"a":[1,2,]},),]'), [
    { name: "tool", arguments: { x: { a: [1, 2] } } },
  ]);
});
