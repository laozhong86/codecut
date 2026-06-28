# Content Strategy Adapter

Use this adapter between platform algorithm guidance and editing decisions. The goal is to prevent premature cutting: distribution signals should first shape the content promise, proof, and interaction design before they shape timeline rhythm.

## ContentCreationStrategy

Create a `ContentCreationStrategy` before recommending cuts:

- `audienceIntent`: what the viewer is trying to solve, compare, avoid, learn, buy, save, share, or feel.
- `contentAngle`: the chosen point of view, such as mistake correction, before/after, review, checklist, social proof, founder insight, or story.
- `scriptPromise`: the explicit reason to keep watching, written as a promise the video can actually fulfill.
- `proofAsset`: transcript, visual, product, result, comparison, data, creator credibility, or community evidence that can prove the promise.
- `interactionDesign`: the intended engagement behavior, such as save, share, comment, search follow-up, profile visit, consult, or purchase.
- `editingImplication`: what the strategy means for first frame, beat order, captions, pacing, safe zone, cover, and CTA.

## Signal To Strategy

| Algorithm-facing signal | Content strategy question | Editing implication |
| --- | --- | --- |
| Watch time / completion | Is the promise clear enough to carry the runtime? | Cut setup and remove repeated claims |
| Full watch / rewatch | Is there a reveal, comparison, or loop worth revisiting? | Put payoff late enough to earn, early enough to retain |
| Save | Does the content help future action or purchase comparison? | Preserve lists, criteria, steps, measurements, and title/search fit |
| Share / send | Would a viewer send this to a friend, group, client, or identity peer? | Make the social reason explicit and avoid private-only wording |
| Comment | Is there a specific, legitimate question or tension? | Use one comment trigger tied to evidence, not generic engagement bait |
| Search match | Does title, first line, caption, and overlay answer the same query? | Align metadata language before optimizing visual rhythm |
| Trust / quality | What proof makes the claim believable? | Prioritize proofAsset before decorative B-roll |

## Business Guardrails

- If `proofAsset` is missing, do not strengthen the claim; lower confidence or ask for evidence.
- If `audienceIntent` is unclear, do not optimize only for retention; clarify who should care.
- If `interactionDesign` is "comment", avoid bait. The question must help the viewer or creator learn something real.
- If `scriptPromise` cannot be fulfilled by available assets, change the promise before changing the edit.
