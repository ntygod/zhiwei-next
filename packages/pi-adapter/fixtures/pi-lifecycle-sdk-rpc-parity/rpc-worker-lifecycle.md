# Pi RPC Worker lifecycle Fixture

This file documents the real `@earendil-works/pi-coding-agent@0.84.1` RPC Worker boundaries captured for Issue #32.

## Source identity

```text
source state                 captured
capture head                 c0d782ce074e770d39876600feef3554d0471756
workflow run                 31677138404
run attempt                  2
artifact id                  9172023070
artifact digest              sha256:70434a001544b6a397b3f02dd399898d8703b0ab3aa763de79a865c6904b07e9
comparison artifact id       9171976965
comparison artifact digest   sha256:cbac8b883eabea371c4bc533f340d924b8495f717891b7a8f43997ee8996f11f
artifact result bytes        74588
artifact result sha256       a3bffda1548cd0619b28d89f389edf8ca7a0cb797ffb3f035195d4d03bc65946
byte-identical attempts      true
```

The two successful Artifact attempts contain exactly one `result.json` each and are byte-identical. The committed representation stores the same complete JSON object in deterministic gzip/base64 form; formatting bytes are not treated as Runtime semantics.

## Committed identity

```text
manifest                     rpc-worker-lifecycle-manifest.json
loader                       rpc-worker-lifecycle-fixture.mjs
format                       gzip+base64-parts
parts                        1
base64 bytes                 5640
compressed bytes             4229
compressed sha256            782ce131e8c4e284875b3163dac86f236dfb91865d973ea8ea443c605c509cd1
canonical JSON bytes         37221
canonical JSON sha256        a9823c6820a21ea87c5391603dcd27a618088aaa8850fffffba1373f6dd93a42
outer contract fingerprint   cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba
capture fingerprint          a30add6e0834c3cdc52ea198997d3ccd7bc3bebfaced456e47891bfafdf17631
```

The Worker files are deliberately flat inside the existing parity Fixture directory. The SDK/RPC packer treats that directory as a flat immutable file set; a nested directory would weaken its existing snapshot and replacement tests.

`rpc-worker-lifecycle-fixture.mjs` validates regular-file identity, byte limits, content-addressed part names, base64 framing, compressed and JSON digests, both contract fingerprints, source metadata and repeated-capture evidence. Its normal mode materializes the committed JSON into an isolated temporary file and runs the repository RPC Worker Checker. `--compare <fresh-result>` validates both inputs and compares the complete parsed objects.

## Frozen Runtime facts

### Protocol errors remain recoverable

- malformed JSON produces exactly one failed `command=parse` Response;
- an unknown command containing `U+2028` and `U+2029` inside its JSON string produces one correlated failed Response and does not split JSONL records;
- the same Worker remains usable and returns an idle State after both failures.

### Prompt acceptance is not completion

For the first persisted Prompt:

```text
prompt Response              sequence 11
agent_start                  sequence 13
turn_start                   sequence 14
user message start/end       sequence 15 / 16
assistant message start      sequence 17
running State Response       sequence 19
assistant message end        sequence 22
turn_end                     sequence 23
agent_end                    sequence 24
agent_settled                sequence 25
```

The Prompt Response succeeds before `agent_start`; State changes from `isStreaming=false, messageCount=0` to `true, 1`, then returns to `false, 2` only after the stable boundary.

### EOF, restart and Session recovery stay distinct

- stdin EOF produces Extension `session_shutdown(reason=quit)`, then Worker `exit(0) -> close(0)`;
- a second real Worker restores the same Session ID/File aliases and the prior `user -> assistant` Messages;
- the resumed Prompt changes `messageCount=2 -> 3 -> 4` and ends with `user -> assistant -> user -> assistant`;
- idle `SIGTERM` produces Extension shutdown evidence before `exit(143) -> close(143)`.

### Rejection and execution failure stay distinct

- no configured model/API key produces one failed Prompt Response, no `agent_start`, no Messages and a still-usable Worker;
- an accepted Faux Provider error first returns `prompt success=true`, then emits the Assistant error Message, `agent_end(willRetry=false)` and `agent_settled`;
- the error Message retains `stopReason=error` and `ZHIWEI_RPC_FIXED_PROVIDER_ERROR`; no second correlated Prompt Response is fabricated.

## Safety boundary

The Fixture contains no raw Session ID/File, Provider Response ID, PID, per-run Extension nonce, credential, host environment dump, absolute host path or model chain of thought. All Provider calls are deterministic Faux Provider calls inside the isolated container; external Provider Prompt count is zero.
