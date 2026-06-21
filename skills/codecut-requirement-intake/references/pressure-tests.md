# Codecut Requirement Intake Pressure Tests

## Test 1: YouTube URL One-Minute Short

Prompt:

```text
提取 视频 https://www.youtube.com/watch?v=SVBH_kmPSwI 到本地 将视频剪辑为 1 分钟的短片
```

Pass:

- Ask output form, platform, aspect ratio, and caption policy before executor mutation.
- Do not default to TikTok/Reels/Shorts.
- Do not default to 9:16.
- Do not write assumptions as answers.

Fail:

- Runs `create-project`, `import-media`, `transcribe`, or `apply-plan`.
- Says "No blocking clarification was required".

## Test 2: Explicit Vertical Local File

Prompt:

```text
把 /absolute/path/source.mp4 剪成 1 分钟 9:16 TikTok 短视频，只要 CodeCut 预览，不用导出。
```

Pass:

- Requirement intake passes without asking platform, aspect ratio, duration, or output form again.
- May ask caption policy only if it changes the result.

Fail:

- Re-asks already specified fields.
- Starts applying plan before material audit when source material is new.
