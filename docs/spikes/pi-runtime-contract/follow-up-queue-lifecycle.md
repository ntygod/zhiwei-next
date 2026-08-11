# Pi Follow-up é˜Ÿåˆ—ç”Ÿå‘½å‘¨æœŸ

çŠ¶æ€ï¼š**runtime-verified**

å…³è”ï¼šIssue #22ã€PR #23ã€‚

## ç›®çš„

éªŒè¯å›ºå®š Pi `v0.84.1` å‘å¸ƒ Artifactåœ¨é¦–ä¸ª Assistantå“åº”å°šæœªç»“æŸæ—¶æ’å…¥ä¸€æ¡ Follow-upåï¼Œå…¬å…± `AgentSession`äº‹ä»¶ã€Extensionç”Ÿå‘½å‘¨æœŸã€é˜Ÿåˆ—å¯è§æ€§å’Œæœ€ç»ˆç¨³å®šè¾¹ç•Œçš„çœŸå®è¡Œä¸ºã€‚

è¯¥ Fixtureå›ç­”äº”ä¸ª M0é—®é¢˜ï¼š

1. Follow-upæ˜¯åœ¨åŒä¸€ä¸ª Agent Runå†…è¿½åŠ  Turnï¼Œè¿˜æ˜¯åˆ›å»ºæ–°çš„ Runï¼›
2. å…¬å…±é˜Ÿåˆ—ä½•æ—¶æ˜¾ç¤ºéç©ºã€ä½•æ—¶æ¸…ç©ºï¼›
3. Extensionæ˜¯å¦æ”¶åˆ° `queue_update`ï¼›
4. `agent_end`å’Œ `agent_settled`å„å‡ºç°å‡ æ¬¡ï¼›
5. `session.prompt()`æ˜¯å¦ç­‰åˆ° Follow-upå¤„ç†å®Œã€é˜Ÿåˆ—æ¸…ç©ºä¸” Session idleåæ‰è¿”å›ã€‚

## å›ºå®šåœºæ™¯

```text
Initial prompt
  Produce the first response before processing the queued follow-up.

åœ¨ç¬¬ä¸€ä¸ª Assistant message_startæ—¶è°ƒç”¨
  session.followUp("Process the queued follow-up now.")

Faux response 1
  First response complete.

Faux response 2
  Follow-up response complete.

followUpMode
  one-at-a-time
```

è¿è¡Œè¾¹ç•Œï¼š

- Pi `v0.84.1`ï¼›
- `@earendil-works/pi-coding-agent@0.84.1`ï¼›
- Node `22.23.1`ã€npm `10.9.8`ï¼›
- é›¶ Provider Credentialï¼›
- å¤–éƒ¨ Provider Promptæ•°ä¸º `0`ï¼›
- æ²¡æœ‰ Toolã€Retryã€æ–‡ä»¶ã€Shellæˆ–å¤–éƒ¨å†™å‰¯ä½œç”¨ã€‚

## å…¬å…± AgentSessionäº‹ä»¶

çœŸå®é«˜å±‚é¡ºåºï¼š

```text
agent_start
Turn 1
  user message
  assistant message_start
  queue_update(followUp=[queued message])
  assistant message_end("First response complete.")
  turn_end
Turn 2
  turn_start
  queue_update(followUp=[])
  queued user message
  assistant message_end("Follow-up response complete.")
  turn_end
agent_end(willRetry=false)
agent_settled
```

å…³é”®ç»“è®ºï¼š

```text
ä¸€ä¸ª public agent_start
ä¸¤ä¸ª Turn
ä¸€ä¸ª public agent_end
ä¸€ä¸ª public agent_settled
```

å› æ­¤åœ¨è¯¥å›ºå®šåœºæ™¯ä¸­ï¼ŒFollow-upæ²¡æœ‰åˆ›å»ºç¬¬äºŒä¸ªå…¬å…± Agent Runï¼Œè€Œæ˜¯åœ¨åŒä¸€ä¸ª Runå†…è¿½åŠ ç¬¬äºŒä¸ª Turnã€‚Adapterä¸èƒ½æŠŠ â€œFollow-upâ€ å›ºå®šå»ºæ¨¡æˆ â€œæ–° Runâ€ï¼›åº”ä»¥çœŸå® `agent_start` / `agent_end`å’Œ Turnäº‹ä»¶å†³å®šè¾¹ç•Œã€‚

## é˜Ÿåˆ—è¯­ä¹‰

å…¬å…± `AgentSession.subscribe()`æš´éœ²ä¸¤ä¸ª `queue_update`ï¼š

```json
[
  {
    "sequence": 6,
    "steering": [],
    "followUp": ["Process the queued follow-up now."]
  },
  {
    "sequence": 13,
    "steering": [],
    "followUp": []
  }
]
```

é¡ºåºä¸ºï¼š

```text
assistant message_start
  < queue filled
  < first assistant message_end
  < second turn_start
  < queue cleared
  < queued user message_start
```

é˜Ÿåˆ—åœ¨ Follow-upç”¨æˆ·æ¶ˆæ¯è¿›å…¥äº‹ä»¶æµä¹‹å‰æ¸…ç©ºã€‚`queue_update(followUp=[])`è¡¨ç¤ºè¯¥æ¶ˆæ¯å·²ç»ä»å¾…å¤„ç†é˜Ÿåˆ—ç§»å‡ºï¼Œä¸è¡¨ç¤ºæ•´ä¸ª Promptå·²ç»å®Œæˆï¼›åé¢ä»æœ‰ Follow-up Assistantå“åº”ã€`turn_end`ã€`agent_end`å’Œ `agent_settled`ã€‚

## Extensionè¡¨é¢å·®å¼‚

Inline Extensionè§‚å¯Ÿåˆ°ï¼š

```text
input
before_agent_start
agent_start
ä¸¤ä¸ª Turnçš„ Messageç”Ÿå‘½å‘¨æœŸ
agent_end
agent_settled
å®¿ä¸» session_shutdown
```

Extensionæ²¡æœ‰è§‚å¯Ÿåˆ°ï¼š

```text
queue_update
```

è®¡æ•°ï¼š

```text
Public queue_update       2
Extension queue_update    0
```

å› æ­¤ï¼š

> Follow-upé˜Ÿåˆ—çŠ¶æ€æ˜¯å…¬å…± Sessionè¡¨é¢çš„è¯­ä¹‰ï¼Œä¸èƒ½ä¾èµ– Extensionäº‹ä»¶é‡å»ºã€‚çŸ¥å¾® Adapterå¿…é¡»ä¿ç•™äº‹ä»¶æ¥æºï¼Œå¹¶ä» Public SDKæˆ–ç­‰ä»· Sessionæ¥å£è¯»å–é˜Ÿåˆ—å˜åŒ–ã€‚

## æœ€ç»ˆæ¶ˆæ¯ä¸ Promptè¿”å›è¯­ä¹‰

`session.messages`æœ€ç»ˆå®Œæ•´ä¿ç•™ä¸¤è½®å¯¹è¯ï¼š

```text
user(initial)
  â†’ assistant(first response)
  â†’ user(follow-up)
  â†’ assistant(follow-up response)
```

`await session.prompt(...)`è¿”å›æ—¶ï¼š

```text
finalText                         Follow-up response complete.
session.isIdle                    true
pendingMessageCount               0
pendingFollowUps                  []
provider callCount                2
provider pendingResponses         0
```

è¿™è¯æ˜ï¼š

- åˆå§‹ `prompt()` Promiseè¦†ç›–æ’å…¥çš„ Follow-upï¼›
- Promiseä¸ä¼šåœ¨ç¬¬ä¸€æ¡ Assistantå“åº”åæå‰è¿”å›ï¼›
- Promiseè¿”å›æ—¶å…¬å…± Follow-upé˜Ÿåˆ—å·²æ’ç©ºä¸” Sessionå·²ç» idleï¼›
- æœ€ç»ˆç¨³å®šè¾¹ç•Œä»æ˜¯å•æ¬¡ `agent_settled`ï¼›
- å®¿ä¸» `session_shutdown`ç»§ç»­å‘ç”Ÿåœ¨ settledä¹‹åï¼Œæ˜¯ç‹¬ç«‹ç”Ÿå‘½å‘¨æœŸè¾¹ç•Œã€‚

## Fixtureä¸æŒ‡çº¹

```text
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
```

å¤–å±‚å¥‘çº¦æŒ‡çº¹ï¼š

```text
00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
```

å†…å±‚ CaptureæŒ‡çº¹ï¼š

```text
5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

æ™®é€š `npm run check`éªŒè¯ committed Fixtureï¼›ç›¸å…³è·¯å¾„å˜æ›´ã€æ‰‹å·¥è¯·æ±‚å’Œ weekly scheduleè¿˜ä¼šé‡æ–°æ‰§è¡Œéš”ç¦» Captureï¼Œå¹¶ä¸ committed Fixtureå®Œæ•´æ¯”è¾ƒã€‚

## éš”ç¦»è¾¹ç•Œ

åŠ¨æ€æ‰§è¡Œå¤ç”¨æ—¢æœ‰ R3 Runtime Probeè¾¹ç•Œï¼š

- GitHub Jobä»… `contents: read`ï¼›
- checkoutä¸æŒä¹…åŒ–å‡­è¯ï¼›
- ä¸ä½¿ç”¨ `pull_request_target`æˆ– `${{ secrets.* }}`ï¼›
- ç²¾ç¡® npm Artifact integrityä¸ shasumï¼›
- npm install scriptsç¦ç”¨ï¼›
- digest-pinned Nodeå®¹åš;ï&Â‹H9cêº+îù¨.y¥¡ù.í¹ìîùîçûï&Â‹H:ggˆ›Ûİ8à XØ\Y›ÜPS8à X›Ë[™]Ë\š]š[YÙ\Ø;ï&Â‹H9.#y£ º/oyk¯ù..ùéày§"HÚXÚÛİ];ï&Â‹Hİ\˜]Y›Ø™H[™ycêº+îûï&Â‹H9i,z-)yîäù§§9."¹/(9/aˆ›Ø¹/çy£ yi,z-){ï&Â‹H9.#y/çykf9îçykîH[›™\º-ëùo¡8à yc§ùiâÈÙ\ÜÚ[ÛˆQ8à PÜ™Y[X[8à yã«ùh ú/k9`ª9¢%¹ª(yg¢ùc§ùiâù 'yîí:dï¸à ‚‚ˆÈÈ9kîHL9ccú+«¹æ¡9olydãB‚¹d#¹îëH›Ü›X[^™Y[[YQ]™[:!ìùl$yoázhnú(j:/¯»ï&‚‚‹H9.¢ù.í¹§iy®¤;ï&”X›XÈÑÈÈ^[œÚ[ÛˆÈ”ûï&Â‹H›Û\8à PYÙ[[¹d£\›¹¦+ù.#yd#9l`¹î©ûï&Â‹H›ÛİË]\9£¤ºf'ù.#¹®!yên¹â­¹  {ï&Â‹H:f'ùb%ù®!yên¹.#yëby.£ˆ›Û\9k£9¢$;ï&Â‹H9. 9.*ˆYÙ[[¹a¡ycëú ïykf9g*9i&¹.*ˆ\›»ï&Â‹H9b'yiâÈ›Û\9.#¹£¤¹aiH›ÛİË]\9aly.ªù§ 9îâ9ê,ùk¦º/®yåc;ï&Â‹H9§ 9îâ9cey«(HYÙ[ÜÙ]Y9d£9k¯ù..ÈÚ]İÛ»ï&Â‹H^[œÚ[Û¹ï.¹l$H]Y]YWİ\]X9¥í¹.#yo¥ú(iz`(Ù\ÜÚ[Ûºf'ùb%ù.¢ù.í¸à ‚‚¹odùbcy.ãy.#ya®ùîäù«hùo#ùccú+«»ï&ú/æ:g :) ycå¹­¢8à T™]H^]\İ[Û¸à ynmº(cÛÛ8à PÛÛ\Xİ[Û¸à TÙ\ÜÚ[Ûˆ™\XÙ[Y[9d£”ùç'ùk§ˆ›Û\š^\™xà ‚