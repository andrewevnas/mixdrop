Start work on the next build phase: $ARGUMENTS

1. Read the "Current phase" line in CLAUDE.md and the matching section of docs/ARCHITECTURE.md.
2. Enter Plan mode. Propose: files to create/change, schema changes, and the tests you'll add.
   Keep the plan under 25 lines. Wait for my approval.
3. Implement in small steps, running typecheck + tests after each.
4. Use the test-writer subagent for tests and security-reviewer for any sensitive area.
5. Finish by stating the phase's "done" check and whether it passes, then update the
   "Current phase" line in CLAUDE.md.
