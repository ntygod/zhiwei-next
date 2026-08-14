const DEFAULT_MAX_RECORD_BYTES = 4 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function asBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new TypeError("JSONL chunks must be Buffer or Uint8Array values.");
}

export class StrictLfJsonlReader {
  #buffer = Buffer.alloc(0);
  #decoder = new TextDecoder("utf-8", { fatal: true });

  constructor({ label, onRecord, maxRecordBytes = DEFAULT_MAX_RECORD_BYTES }) {
    requireValue(typeof label === "string" && label.length > 0, "JSONL reader label is required.");
    requireValue(typeof onRecord === "function", "JSONL reader onRecord callback is required.");
    requireValue(
      Number.isSafeInteger(maxRecordBytes) && maxRecordBytes > 0,
      "JSONL maxRecordBytes must be a positive safe integer.",
    );
    this.label = label;
    this.onRecord = onRecord;
    this.maxRecordBytes = maxRecordBytes;
  }

  push(chunk) {
    const bytes = asBuffer(chunk);
    if (bytes.length === 0) return;
    this.#buffer =
      this.#buffer.length === 0
        ? Buffer.from(bytes)
        : Buffer.concat([this.#buffer, bytes], this.#buffer.length + bytes.length);
    requireValue(
      this.#buffer.length <= this.maxRecordBytes || this.#buffer.includes(0x0a),
      `${this.label} JSONL record exceeds ${this.maxRecordBytes} bytes before LF.`,
    );

    while (true) {
      const newlineIndex = this.#buffer.indexOf(0x0a);
      if (newlineIndex < 0) break;
      const recordBytes = this.#buffer.subarray(0, newlineIndex);
      this.#buffer = Buffer.from(this.#buffer.subarray(newlineIndex + 1));
      requireValue(recordBytes.length > 0, `${this.label} emitted an empty LF JSONL record.`);
      requireValue(
        recordBytes.length <= this.maxRecordBytes,
        `${this.label} JSONL record exceeds ${this.maxRecordBytes} bytes.`,
      );
      requireValue(
        recordBytes.at(-1) !== 0x0d,
        `${this.label} emitted CRLF; the RPC contract requires LF-only framing.`,
      );

      let text;
      try {
        text = this.#decoder.decode(recordBytes);
      } catch (error) {
        throw new Error(`${this.label} emitted a JSONL record with invalid UTF-8.`, {
          cause: error,
        });
      }
      requireValue(
        Buffer.from(text, "utf8").equals(recordBytes),
        `${this.label} JSONL UTF-8 round-trip drifted.`,
      );

      let object;
      try {
        object = JSON.parse(text);
      } catch (error) {
        throw new Error(
          `${this.label} emitted invalid JSONL record of ${recordBytes.length} bytes: ${error.message}`,
          { cause: error },
        );
      }
      this.onRecord(object, recordBytes);
    }
    requireValue(
      this.#buffer.length <= this.maxRecordBytes,
      `${this.label} JSONL record exceeds ${this.maxRecordBytes} bytes before LF.`,
    );
  }

  end() {
    requireValue(
      this.#buffer.length === 0,
      `${this.label} closed with a non-LF-terminated stdout fragment of ${this.#buffer.length} bytes.`,
    );
  }
}
