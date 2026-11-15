# Documentation working rules

Root instructions apply. These local rules govern changes under `docs/`.

- Architecture guides own reusable responsibilities and patterns; project context owns project facts;
  specifications own behavior; ADRs own decision history. Do not duplicate the same policy across all four.
- Keep the distinction between a documented expectation and implemented enforcement explicit.
- The architecture map is the current repository convention, not future examples. Do not turn documentation
  edits into scaffolding, package installation, CI setup or migration execution.
- Preserve verbatim owner quotes in ADR acceptance evidence. Do not mark a new consequential decision
  accepted solely because the agent recommends it.
- Proposed exceptions remain proposed until accepted. Preserve superseded decision history.
- Keep local Markdown links relative and working. Update the root contents index when adding a guide.
- Technical documentation defaults to English; preserve quoted user requirements in their original language.
- Do not repeat global rules in feature-local guides; document only local ownership and invariants.
- Never add secrets, production connection strings or unapproved business requirements as examples.
