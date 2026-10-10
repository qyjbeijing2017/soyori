import { prefix } from "../lib/prefix.js";

const { suffix } = await import("../lib/suffix.js");
result(`${prefix}${input.text}${suffix}`);
