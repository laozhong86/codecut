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
- outputs `reference-analysis.md`, `local-template-script.json`, and
  `template-fields.md`
- keeps `defaultForTypes` empty unless explicitly approved
- stops and asks whether to import the exact draft into Codecut system templates
- does not call `import_system_template_script` before user confirmation

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
- offers a template script only for the supported planning parts

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
- uses `import_system_template_script` with `confirmedByUser: true`
- reports the imported system template ID/name/trigger
- states that the Codecut system template library is now the source of truth

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

- reads the named system template script first
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
用这个本地草稿模板剪新素材：/tmp/old/local-template-script.json
```

Expected behavior:

- treats the JSON path as a draft/provenance artifact
- asks whether to import it into Codecut system templates before using it
- does not apply the draft directly as the current reusable template

Fail signals:

- reads the draft file as if it is the latest system template
- skips import confirmation
- ignores a conflicting system template with the same ID

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
