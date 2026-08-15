import { StrictLfJsonlReader } from "./rpc-worker-lifecycle-jsonl-reader.mjs";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function readChunks(chunks) {
  const records = [];
  const reader = new StrictLfJsonlReader({
    label: "test-worker",
    onRecord: (value) => records.push(value),
  });
  for (const chunk of chunks) reader.push(chunk);
  reader.end();
  return records;
}

function expectFailure(label, operation, pattern) {
  let error;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  requireValue(error instanceof Error, `${label} unexpectedly succeeded.`);
  requireValue(pattern.test(error.message), `${label} failed with unexpected message: ${error.message}`);
}

const unicodeLine = Buffer.from(
  `${JSON.stringify({ type: "event", text: "汉字🙂alpha\u2028beta\u2029gamma" })}\n`,
  "utf8",
);
const splitEveryByte = [...unicodeLine].map((byte) => Buffer.from([byte]));
requireValue(
  readChunks(splitEveryByte)[0]?.text === "汉字🙂alpha\u2028beta\u2029gamma",
  "A UTF-8 code point split across arbitrary chunks was not reconstructed exactly.",
);

const twoRecords = Buffer.from('{"id":1}\n{"id":2}\n', "utf8");
requireValue(
  JSON.stringify(readChunks([twoRecords])) === JSON.stringify([{ id: 1 }, { id: 2 }]),
  "Two strict LF records did not parse exactly.",
);

expectFailure(
  "empty record",
  () => readChunks([Buffer.from('{"id":1}\n\n{"id":2}\n', "utf8")]),
  /empty LF JSONL record/,
);
expectFailure(
  "CRLF",
  () => readChunks([Buffer.from('{"id":1}\r\n', "utf8")]),
  /requires LF-only framing/,
);
expectFailure(
  "invalid UTF-8",
  () => readChunks([Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d, 0x0a])]),
  /invalid UTF-8/,
);
expectFailure(
  "unterminated record",
  () => readChunks([Buffer.from('{"id":1}', "utf8")]),
  /non-LF-terminated stdout fragment/,
);

console.log("RPC Worker strict LF JSONL reader: OK");
