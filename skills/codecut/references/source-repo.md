# Source Repository

## Research Source

- URL: `https://github.com/luoluoluo22/jianying-editor-skill`
- Local clone: `/Users/x/Desktop/Project/github/jianying-editor-skill`
- Cloned commit: `f421c8a036f4fda888a83b38fc90bb9c00d6faa9`
- Status: research-only local copy, not installed into Codex or Codecut.

## Secondary Research Source

- Local clone: `/Users/x/Desktop/Project/github/opus-skills`
- Observed commit: `20b4b10`
- Status: research-only local copy, not installed into Codex or Codecut.
- Relevant lesson: OpusClip's skill wraps a clipping product as a command tree with JSON output, preview, async rendering, and round-trip edit application. Codecut should absorb the contract shape, not the cloud API dependency.

## Important Upstream Files

- `SKILL.md`: high-level routing, development rules, examples, and tool list.
- `docs/agent-playbook.md`: task routing matrix and acceptance checklist.
- `docs/minimal-command-sop.md`: minimal edit loop for simple requests.
- `docs/api.md`: canonical API index and CLI contract.
- `rules/setup.md`: environment bootstrap principles.
- `rules/core.md`: save/export/draft acceptance checks.
- `rules/media.md`: media import, asset path, and aspect-ratio rules.
- `rules/text.md`: subtitle, styled text, and text layering rules.
- `rules/audio-voice.md`: TTS, subtitle sync, BGM, and SFX rules.
- `rules/effects.md`: effect/transition ID resolution rules.
- `rules/generative.md`: converting vague style intent into executable edit plans.
- `rules/keyframes.md`: time-unit and keyframe animation rules.
- `rules/web-vfx.md`: browser-rendered visual effects contract.

## Research Boundary

Carry these ideas into Codecut:

- deterministic edit loop
- round-trip edit execution: read state, plan, validate, preview, apply, verify
- task routing by editing intent
- explicit acceptance checks
- asset and effect IDs must be resolved, not guessed
- narration and subtitles must be verified together
- browser/Web VFX can be a first-class editing source

Do not carry these runtime dependencies into Codecut:

- `JyProject`
- `pyJianYingDraft`
- `draft_info.json`
- Jianying draft folder paths
- Jianying app auto-healing behavior
- Windows-only Jianying auto-export assumptions
- OpusClip API keys, cloud clipping calls, credit model, or social posting workflow for the MVP
