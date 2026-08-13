# Pi RPC Worker lifecycle Fixture

This document records the real `@earendil-works/pi-coding-agent@0.84.1` RPC Worker boundaries captured for Issue #32.

The committed evidence has two deliberately separate layers:

1. an immutable historical **schema v1 base Fixture** captured before the host/Worker sequence-domain split; and
2. the current **schema v2 normalized Fixture**, which reconstructs the base, replaces only the accepted Provider Error case with a readable normalized case, and verifies the resulting complete object against Fresh Runtime evidence.

The v1 base is not the current contract. It remains committed so the provenance chain and all previously captured stable cases stay independently auditable.

## Current normalized source identity

```text
source state                 captured
capture head                 19f3e93a2bdf4f6b66e4abef00509e9549b22f6b
workflow run                 31701880114
run attempt                  2
artifact id                  9181642601
artifact digest              sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09
comparison artifact id       9181575920
comparison artifact digest   sha256:f7a531198586c023d37b4a9b24b34197465c2945389431bc3fc14c7d402fd1cc
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
byte-identical attempts      true
```

The two successful normalized Artifact attempts each contain one sanitized `result.json` and are byte-identical.

## Current committed identity

```text
manifest                     rpc-worker-lifecycle-manifest-v2.json
loader                       rpc-worker-lifecycle-fixture.mjs
format                       gzip-plus-readable-case-replacement
base manifest                rpc-worker-lifecycle-manifest.json
replacement                  rpc-worker-lifecycle-provider-error-replacement.json
replacement sha256           a5505b9c86b86af3a78068eb8440158361866600f41f922fb39d5ece840b3811
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer contract fingerprint   b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
```

`rpc-worker-lifecycle-fixture.mjs` performs bounded regular-file reads, exact-key checks, basename/path checks, content-addressed part validation, base64 and gzip validation, replacement hashing, complete object reconstruction, and both contract-fingerprint checks. `--compare <fresh-result>` validates both objects and requires complete parsed-object equality.

`npm run check:pi-rpc-worker-lifecycle` first executes the historical base Fixture with the legacy Checker, then validates the current v2 Fixture. This keeps compatibility evidence explicit without treating the historical shape as the current protocol.

## Historical base identity

```text
base manifest                rpc-worker-lifecycle-manifest.json
base loader                  rpc-worker-lifecycle-base-fixture.mjs
format                       gzip+base64-parts
source head                  c0d782ce074e770d39876600feef3554d0471756
workflow run                 31677138404
source artifact              9172023070
comparison artifact          9171976965
artifact result bytes        74588
artifact result sha256       a3bffda1548cd0619b28d89f389edf8ca7a0cb797ffb3f035195d4d03bc65946
base outer fingerprint       cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba
base capture fingerprint     a30add6e0834c3cdc52ea198997d3ccd7bc3bebfaced456e47891bfafdf17631
```

The historical base remains content-addressed and is validated with `scripts/check-pi-sdk-rpc-client-messages-legacy-result.mjs`. It is used only as the immutable input to the v2 reconstruction.

## Frozen Runtime facts

### Protocol errors remain recoverable

- malformed JSON produces exactly one failed `command=parse` Response;
- an unknown command containing `U+2028` and `U+2029` inside its JSON string produces one correlated failed Response and does not split LF-only JSONL records;
- the same Worker remains usable and returns an idle State after both failures.

### Prompt acceptance is not completion

For the first persisted Prompt, the success Response precedes `agent_start`. The Worker then exposes the User Message, Assistant streaming events, `turn_end`, `agent_end`, and finally `agent_settled`.

The stable State transition is:

```text
isStreaming    false → true → false
messageCount   0     → 1    → 2
```

A Prompt success Response therefore means preflight acceptance, not Agent Run completion.

### Worker output and Host actions use different sequence domains

The normalized contract freezes:

```text
workerTranscript       worker-output-and-process-boundaries
clientActions          host-local-actions
crossDomainTotalOrder  false
```

`workerTranscript` contains only JSONL output and process `spawn` / `exit` / `close` boundaries. Host sends, stdin EOF, and signal requests are stored in the separate contiguous `clientActions` sequence. The Fixture does not invent a total order across those independently scheduled domains.

### EOF, restart, and Session recovery stay distinct

- stdin EOF produces Extension `session_shutdown(reason=quit)`, then Worker `exit(0) → close(0)`;
- a second real Worker restores the same Session ID/File aliases and the prior `user → assistant` Messages;
- the resumed Prompt changes `messageCount=2 → 3 → 4` and ends with `user → assistant → user → assistant`;
- idle `SIGTERM` produces durable Extension shutdown evidence before `exit(143) → close(143)`.

### Rejection and accepted execution failure stay distinct

- no configured model/API key produces one failed Prompt Response, no `agent_start`, no Messages, and a still-usable Worker;
- an accepted Faux Provider error first returns one `prompt success=true` Response, then emits the Assistant error Message, `agent_end(willRetry=false)`, and `agent_settled`;
- the error Message retains `stopReason=error` and `ZHIWEI_RPC_FIXED_PROVIDER_ERROR`; no second correlated Prompt Response is fabricated.

The accepted Provider Error completes quickly enough that the immediately requested `get_state` Response can legally observe either:

```text
running   isStreaming=true,  messageCount=1
settled   isStreaming=false, messageCount=2
```

The capture validates that the observation is inside this two-state bound. The race-sensitive Response and its sequence are then excluded from the frozen Fixture, while the Host request remains visible in `clientActions`. The stable frozen chain is:

```text
Prompt success Response
→ agent_start
→ Assistant message_end(stopReason=error)
→ agent_end(willRetry=false)
→ agent_settled
```

## Capture-source boundary

The repository source bundle is mounted read-only. The normalized driver creates its exact, fail-closed compatibility copy on container tmpfs, sets both copied source files to `0400` and the directory to `0500`, executes the real subprocess capture, restores permissions only for cleanup, and then removes the temporary directory. The Artifact output directory is never used as an executable source directory.

## Safety boundary

The Fixture contains no raw Session ID/File, Provider Response ID, PID, per-run Extension nonce, credential, host environment dump, absolute host path, or model chain of thought. Provider calls are deterministic Faux Provider calls inside the isolated container; the external Provider Prompt count is zero.
