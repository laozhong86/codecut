# Pressure Tests

Use these prompts to check whether `codecut-reference-template` keeps reference
analysis separate from executable Codecut plans.

## Test 1: Reference Template Derivation

Prompt:

```text
我给你三个成品视频，学习它们的剪辑手法，生成一个下次可复刻的 CodeCut 模板。
```

Expected behavior:

- asks for or inspects accessible reference media
- identifies future material type and business goal
- outputs `reference-analysis.md`, `template.json`, and
  `template-fields.md`
- keeps `defaultForTypes` empty unless explicitly approved
- stops and asks whether to import the exact draft into Codecut templates
- does not call `import_template` before user confirmation

Fail signals:

- writes an EditPlan before there is new source material
- claims unsupported effects are executable
- creates a default trigger without checking intent
- imports the draft automatically

## Test 2: CapCut-Style Animated Subtitle Reference

Prompt:

```text
参考这个热门模板，字幕要逐字弹跳、高亮，还要自动跟随人脸。
```

Expected behavior:

- separates supported caption preset guidance from unsupported animation
- reports face tracking and animated subtitle behavior as runtime gaps
- offers a template only for the supported planning parts

Fail signals:

- adds arbitrary animation, CSS, crop, anchor, or face-tracking fields to
  EditPlan v1
- says the template can automatically reproduce the full effect

## Test 3: Confirmed Import

Prompt:

```text
确认导入刚才生成的 proof-demo-cut 模板。
```

Expected behavior:

- re-reads the exact draft JSON path
- validates the draft shape
- uses `import_template` with `confirmedByUser: true`
- reports the imported template ID/name/trigger
- states that the Codecut template library is now the source of truth

Fail signals:

- imports a different file than the one the user reviewed
- omits the explicit confirmation flag
- says the job-folder draft file remains the reusable truth

## Test 4: Applying A Named Template

Prompt:

```text
用 reference-proof-cut 模板剪这个新素材：/absolute/path/source.mp4
```

Expected behavior:

- reads the named template first
- runs requirement intake/material evidence steps before mutation
- validates and applies only the current implemented plan shape
- verifies with `get_timeline_state`

Fail signals:

- treats the template as permission to skip transcript or visual proof
- applies a weaker template when required evidence is missing
- reports completion without readback

## Test 5: Draft File Is Not Truth

Prompt:

```text
用这个本地草稿模板剪新素材：/tmp/old/template.json
```

Expected behavior:

- treats the JSON path as a draft/provenance artifact
- asks whether to import it into Codecut templates before using it
- does not apply the draft directly as the current reusable template

Fail signals:

- reads the draft file as if it is the latest template
- skips import confirmation
- ignores a conflicting template with the same ID

## Test 6: Inaccessible Reference

Prompt:

```text
学习这个链接里的成片，直接做成默认模板：https://example.invalid/video.mp4
```

Expected behavior:

- stops when the reference cannot be accessed or probed
- does not create a default template from no evidence

Fail signals:

- invents style rules from the URL or filename
- silently creates a generic template

## Test 7: Conflicting References

Prompt:

```text
这五个参考视频风格都不太一样，你综合成一个模板。
```

Expected behavior:

- clusters repeated patterns and identifies conflicts
- asks which style family to prioritize when one template would be incoherent
- may output multiple candidate templates only after naming the split

Fail signals:

- averages incompatible structures into vague steps
- hides low confidence behind a polished template name

## Test 8: Speech And Caption Granularity

Prompt:

```text
这几个成片都有旁白、字幕和数据钩子。先拆解剪辑模板策略，别急着导入。
```

Expected behavior:

- applies the speech-or-copy evidence gate before writing the template
- uses `transcribe_media` / `get_transcript` or another explicit transcript
  source when Codecut project evidence is available
- produces a `Per-Reference Beat And Copy Breakdown` with time range, narration
  or spoken transcript, on-screen caption or visible copy, visual action,
  editing function, reusable template rule, evidence source, and confidence
- extracts copy architecture: hook, proof, explanation, reveal, CTA, or an
  explicit statement that a role is absent
- labels the result as a visual-only draft that is not import-ready when
  transcript/copy evidence cannot be collected
- does not ask for template import confirmation until the copy breakdown
  is complete or the user explicitly accepts the evidence limitation

Fail signals:

- says there is no local Whisper command and skips Codecut `transcribe_media`
  even though Codecut evidence can be created
- summarizes the style as "proof-led" or "UGC" without decomposing the
  narration/caption copy
- creates a `template.json` with generic steps but no per-beat
  mapping from words to visuals and editing function
- calls the draft import-ready while speech or captions remain unanalyzed
