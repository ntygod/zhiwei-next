from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1))


def replace_all_exact(path: str, replacements: dict[str, str]) -> None:
    target = ROOT / path
    text = target.read_text()
    for old, new in replacements.items():
        count = text.count(old)
        if count < 1:
            raise SystemExit(f'{path}: missing token {old!r}')
        text = text.replace(old, new)
    target.write_text(text)

sdk = {
    '32287c7d33482ca58bd65b46438f3cc8552a3df3': '374015527ec80d0382d8ef52f61aff82380d102e',
    '31781721009': '32088804546',
    '9211959728': '9307625961',
    'sha256:01c7a87fe73ac05c5ea295ddddd51809b294a502072c61e97819d77589565cc7':
        'sha256:25e523c899615c1afe06e6a108c37de161a6015c024a8c29b25087d51b3f0275',
}
rpc = {
    '19f3e93a2bdf4f6b66e4abef00509e9549b22f6b': '474a100e8b5c267ea1e5285b1ed4f96a953656fc',
    '31701880114': '32090005181',
    '9181642601': '9308041130',
    'sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09':
        'sha256:9f7c3c1d0083d4f2c13467ba23f61301992e1b32a2b7f170f38aed6b2786c005',
    '9181575920': '9308008867',
    'sha256:b7c415e360338f562d3384d22f4c786d845bb78dddaf7b8b10447def94f4b73f':
        'sha256:3ffa43228261c2de228dba070e9855203cff5dfce2c1925e22732ea1980edddc',
    '74587': '72731',
    '8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62':
        '87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa',
}

project = 'docs/harness/project-state.md'
replace_once(project, 'updated: 2026-08-17', 'updated: 2026-08-18')
replace_all_exact(project, sdk)
replace_once(
    project,
    '''PR #66 保持 Draft，base 为 `main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。\n\n上一轮独立 R2 审查绑定：\n\n```text\nhead                         d77c66abff429219c0ac95ba405c57057e56b929\nverdict                      CHANGES_REQUESTED\nprevious B1                  CLOSED\nblocking findings            3\n```\n\n当前候选关闭三项协议缺口：\n\n- Extension `agent_end` 使用显式 `willRetry=unavailable`，与 SDK boolean 分开且不允许省略；\n- 成功 `auto_retry_end` 映射为 `retry.lifecycle/completed`，保存 attempt 与 success，并关联更早 Retry start；\n- Tool Result Message 生命周期和 Messages Snapshot 保存 Tool Call ID、Tool name、success/error 与 completed Tool lineage，独立验证 completion 顺序和 Message 顺序；\n- Session Object replacement 增加同一 Runtime Instance 内的正向场景，证明 Session Object、Runtime Session 与 Worker Instance 不等同。''',
    '''PR #66 保持 Draft，base 为 `main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。`NormalizedRuntimeEvent v1` 的协议、Pi Adapter、74-event Fixture、文档身份门禁与 Compaction start lineage 已完成；旧 HEAD `374015527ec80d0382d8ef52f61aff82380d102e` 曾获得独立 R2 `APPROVED`，但后续 Ready gate 发现 committed Runtime provenance 仍绑定 PR #64，因此该批准不会自动转用于当前候选。\n\n当前候选额外完成 provenance 闭环：\n\n- SDK/RPC parity Manifest 绑定 PR #66 的成功 Draft Capture run `32088804546` 与 Artifact `9307625961`；\n- RPC Worker v2 绑定 PR #66 Draft 中同一 run `32090005181` 的 attempts 1/2；两次 Capture、Fresh validation、committed Fixture validation 和 Artifact upload 均成功，只有在完整对象相等后设置的受控 compare 步骤失败；\n- 两个 RPC Worker Artifact 的唯一 `result.json` 逐字节一致，均为 72,731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；\n- 临时 recapture 代码与 source-export workflow 不进入最终候选；最终代码恢复正式完整对象比较路径。''',
)
replace_once(
    project,
    '本轮修复系列以 `d77c66abff429219c0ac95ba405c57057e56b929` 为已审查祖先；首个协议提交直接以该 SHA 为父提交。发布后以 GitHub 当前公开完整 HEAD 为唯一审查对象。全量 exact-head CI 成功并获得新的独立 R2 APPROVED 前，不转 Ready、不合并，Issue #56 不消费 Draft HEAD。',
    '当前最终 HEAD 必须重新完成全量 exact-head CI 和独立 R2 cold review；通过前不转 Ready、不合并，Issue #56 不消费 Draft HEAD。\n\n## 历史 R2 审查连续性锚点\n\n旧审查 `d77c66abff429219c0ac95ba405c57057e56b929` 的 verdict 为 `CHANGES_REQUESTED`；后续提交已经分别关闭 `willRetry=unavailable`、`retry.lifecycle/completed` 与 Tool Result Message 相关 blocker。该历史结论只用于机械连续性，不授权当前新 HEAD。',
)
replace_once(
    project,
    '''1. 发布本轮三项 R2 修复并完成 exact-head CI；\n2. 对新的完整 40 位 SHA 执行独立 R2 cold review；\n3. APPROVED 后转 Ready，并经 required `check` 与受保护 squash merge进入 main；\n4. Issue #56 从当时最新 main 实现 append-only SQLite Observation Ledger。''',
    '''1. 完成当前 provenance 重绑候选的 exact-head CI；\n2. 对新的完整 40 位 SHA 执行独立 R2 cold review；\n3. APPROVED 后登记 `independent-review: complete`，转 Ready 并要求 fresh `ready=true` live provenance；\n4. 经 required `check` 与 Autonomous Merge 受保护 squash merge进入 main；\n5. Issue #56 从当时最新 main 实现 append-only SQLite Observation Ledger。''',
)

readme = 'docs/spikes/pi-runtime-contract/README.md'
replace_all_exact(readme, sdk | rpc)
replace_once(
    readme,
    'PR #64  source-and-runtime-verified-rpc-worker-lifecycle（候选交付，尚未合并）\n当前    SDK/RPC来源已重绑到PR #64的成功Capture；等待新HEAD门禁与独立R3复审',
    'PR #64  source-and-runtime-verified-rpc-worker-lifecycle（已合并）\n当前    PR #66已把SDK/RPC与RPC Worker provenance重绑到本PR的公开Capture；等待新HEAD exact-head CI与独立R2复审',
)
replace_once(
    readme,
    '历史标签只说明当时的证据强度，不代表当前能力回退。PR #64合并前，Issue #32的Runtime事实已由真实Artifact、重复Capture、committed Fixture、负向mutation和Ready live provenance合同固定，但用户结果仍处于候选交付状态。',
    '历史标签只说明当时的证据强度，不代表当前能力回退。PR #64已经合并，Issue #32的Runtime事实由真实Artifact、重复Capture、committed Fixture、负向mutation和Ready live provenance合同固定。PR #66只重绑当前消费链所需的公开 provenance，不改写Runtime内容身份。',
)
replace_once(
    readme,
    '该来源Run属于PR #64，Artifact内唯一`result.json`与committed Fixture逐字节相同；来源HEAD将在本次重绑提交后成为当前HEAD的严格祖先。Ready live provenance仍必须在新exact HEAD上实际运行并成功。',
    '该来源Run属于当前PR #66，Artifact内唯一`result.json`与committed Fixture逐字节相同；来源HEAD是当前候选的严格祖先。Ready live provenance仍必须在新的exact HEAD上实际运行并成功。',
)
replace_once(
    readme,
    '两个历史attempt的capture、Fresh validation、base validation和upload步骤成功，但旧 **historical compare step failed**，所以Workflow/Worker Job整体为failure。当前v2在新HEAD执行完整normalizer、负向mutation、Fresh/committed完整对象相等；Ready `rpc-worker-lifecycle-provenance.mjs`再实时验证attempt、Worker Job步骤、Artifact ID/name/digest、ZIP、唯一`result.json`和source HEAD ancestry。',
    'PR #66 Draft中的两个受控recapture attempts均完成capture、Fresh validation、base validation和upload；在完整Fresh/committed对象相等后，受控compare步骤显式失败，因此Workflow/Worker Job保持可审计的failure形态。当前v2在新HEAD执行正式完整normalizer、负向mutation与Fresh/committed完整对象相等；Ready `rpc-worker-lifecycle-provenance.mjs`再实时验证attempt、Worker Job步骤、Artifact ID/name/digest、ZIP、唯一`result.json`和source HEAD ancestry。',
)

sdk_doc = 'docs/spikes/pi-runtime-contract/sdk-rpc-parity-lifecycle.md'
replace_all_exact(sdk_doc, sdk)
replace_once(
    sdk_doc,
    '本记录比较固定 npm发布 Artifact上的进程内 `AgentSession` SDK、原始 JSONL RPC Worker与发布包 `RpcClient`执行同一个无工具任务时的接受、运行中、稳定和关闭边界。PR #64固定容器Run `32088804546`已经成功完成Fresh Capture、两个Checker、committed Fixture校验和完整对象比较；其Artifact `9307625961`与committed Fixture逐字节绑定，当前Manifest因此处于`verified`状态。该Run的Capture HEAD `374015527ec80d0382d8ef52f61aff82380d102e`是本次来源重绑提交的直接祖先。',
    '本记录比较固定 npm发布 Artifact上的进程内 `AgentSession` SDK、原始 JSONL RPC Worker与发布包 `RpcClient`执行同一个无工具任务时的接受、运行中、稳定和关闭边界。PR #66 Draft固定容器Run `32088804546`已经成功完成Fresh Capture、两个Checker、committed Fixture校验和完整对象比较；其Artifact `9307625961`与committed Fixture逐字节绑定，当前Manifest因此处于`verified`状态。该Run的Capture HEAD `374015527ec80d0382d8ef52f61aff82380d102e`是当前 provenance 候选的严格祖先。',
)
replace_once(
    sdk_doc,
    'Artifact ZIP内只有一个`122178`字节的`result.json`；ZIP摘要与上面的`artifactDigest`一致，`result.json`摘要与`jsonSha256`一致，并与Loader从committed分片还原的JSON逐字节相同。Run `32088804546`属于PR #64，机器`display_title`绑定`action=edited`、PR更新时间与Capture HEAD；本次来源重绑提交以该HEAD为直接父提交，因此后续Ready gate可以同时证明当前PR归属、Workflow/Artifact身份和严格祖先关系。Manifest是provenance的机器事实源；叙述性文档不能覆盖其`candidate` / `verified`状态。',
    'Artifact ZIP内只有一个`122178`字节的`result.json`；ZIP摘要与上面的`artifactDigest`一致，`result.json`摘要与`jsonSha256`一致，并与Loader从committed分片还原的JSON逐字节相同。Run `32088804546`属于当前PR #66，机器`display_title`绑定PR action、更新时间与Capture HEAD；来源HEAD是当前候选的严格祖先，因此后续Ready gate可以同时证明当前PR归属、Workflow/Artifact身份和祖先关系。Manifest是provenance的机器事实源；叙述性文档不能覆盖其`candidate` / `verified`状态。',
)

worker_doc = 'packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md'
replace_all_exact(worker_doc, rpc)
replace_once(
    worker_doc,
    'Both historical attempts completed the Worker capture, Fresh sanitization validation, committed-base validation and Artifact upload steps successfully. Their old full Workflow result and Worker Job result were `failure` because the then-current **historical compare step failed** before schema v2 normalization existed. The current repository does not relabel those attempts as successful. Instead, Ready-PR **Worker v2 live provenance** reads both immutable attempts, validates the exact Worker Job step outcomes, Artifact IDs/names/digests, downloads both ZIPs, extracts the unique `result.json`, checks byte identity, applies the current full normalizer and requires complete equality with the committed v2 object.',
    'Both controlled PR #66 Draft recapture attempts completed Worker capture, Fresh sanitization validation, committed-base validation and Artifact upload successfully. Their Workflow and Worker Job results remain `failure` because a temporary recapture-only guard failed the compare step only after formal Fresh/committed complete-object equality succeeded. The final repository restores the normal compare path. Ready-PR **Worker v2 live provenance** reads both immutable attempts, validates the exact Worker Job step outcomes, Artifact IDs/names/digests, downloads both ZIPs, extracts the unique `result.json`, checks byte identity, applies the current full normalizer and requires complete equality with the committed v2 object.',
)

arch_worker = 'docs/architecture/pi-rpc-worker-lifecycle.md'
replace_all_exact(arch_worker, {key: value for key, value in rpc.items() if key not in {'19f3e93a2bdf4f6b66e4abef00509e9549b22f6b', '31701880114', '74587'}})
replace_once(
    arch_worker,
    '两次历史capture attempt的Worker capture、Fresh validation和Artifact upload步骤成功；它们的旧 **historical compare step failed**，因此旧Workflow/Job整体为failure，文档不再把它们描述为成功Workflow attempts。两个不可变Artifact仍各有一个74,587字节`result.json`且逐字节一致：',
    'PR #66 Draft中的两次受控recapture attempt均完成Worker capture、Fresh validation、committed Fixture validation和Artifact upload；正式完整对象相等后，recapture-only guard让compare步骤显式失败，因此Workflow/Job整体保持failure。两个不可变Artifact各有一个72,731字节`result.json`且逐字节一致：',
)

integration = 'docs/architecture/pi-integration.md'
replace_all_exact(integration, {key: value for key, value in rpc.items() if key not in {'19f3e93a2bdf4f6b66e4abef00509e9549b22f6b', '31701880114'}})
replace_once(
    integration,
    '两个历史 attempt 的 capture、Fresh validation 和 upload 步骤成功，但当时 **historical compare step failed**，所以旧 Workflow/Worker Job 整体为 failure。当前 committed v2 loader 继续保留并验证这段历史；PR #64 的最终 exact HEAD 已实际通过 Fresh Capture、committed-object comparison、Ready live provenance、required `check`、squash merge 与 Main Provenance，不得把旧失败 attempt 改写为成功。',
    'PR #66 Draft中的两个受控recapture attempts均完成capture、Fresh validation、committed Fixture validation和upload；在正式完整对象相等后，recapture-only guard让compare步骤显式失败，因此Workflow/Worker Job整体保持failure。最终候选恢复正式compare路径；Ready live provenance必须重新验证当前PR归属、source ancestry、两个Artifact字节一致性和committed-object equality。',
)

workflow = ROOT / '.github/workflows/pr66-source-export.yml'
if not workflow.is_file():
    raise SystemExit('temporary workflow is missing')
workflow.unlink()
