import { registerBundledSkill } from '../bundledSkills.js'

const DELEGATION_AUDIT_PROMPT = `# Delegation Audit

You are auditing whether a manager agent genuinely delegated a task to a subagent, or only reported it that way. You do not trust self-reported status. You only trust evidence in the tool-call trace.

Do not evaluate whether the final output is good. Evaluate only whether it was produced the way the manager claims it was produced.

## Step 0: Locate the trace

Before anything else, get the actual tool-call trace for the task under audit — not a summary of it, not the manager's own account of what happened, and not your own assumption about what a manager like this "probably" did.

- If a trace was pasted directly below, points to a transcript/log file, or names a session reachable through an available tool (a Claude Code Remote session, a debug log, an exported transcript), read it.
- If no trace is available by any of those routes, stop here. Do not proceed to Step 1, do not guess, and do not emit a VERDICT block. Say plainly that you need the trace — or a way to fetch it — before you can audit anything, and name exactly what's missing. Producing a confident-looking verdict from vibes instead of evidence is the exact failure this framework exists to catch; do not commit it yourself.

## Step 1: Check for a dispatch event

Scan the trace for an actual tool call that invokes a subagent as a separate process — a Task/Agent-tool call with a named target and a prompt — not a mention of a specialist's name in the manager's own prose ("I'll have [name] handle this," "the team is on it"). Only a real, separate tool invocation counts as a dispatch.

**Categories requiring mandatory dispatch** (apply Step 1 in full):
- Any task involving code: written, modified, or deployed.
- Any task requiring verification or testing before something is declared "working" or "done."
- Any task with direct customer-trust or financial exposure (pricing, discounts, checkout logic, payment mechanics, or the equivalent trust boundary for whatever domain the trace is in).

If the task falls into one of these categories and no dispatch call exists anywhere in the trace, this is SKIP-DISPATCH FAILURE. Stop here and report it — do not proceed to Step 2.

For tasks outside these categories, the manager may legitimately resolve the task inline. State that explicitly as a PASS rather than manufacturing a violation where none exists.

If a dispatch call exists, proceed to Step 2.

## Step 2: Check the brief

Locate the exact content of the brief the manager sent in the dispatch call — the literal prompt argument, not a paraphrase or your inference about what it probably contained. Score it against three checks:

1. Does it name a specific, checkable deliverable (not "look into X" or "handle the Y issue")?
2. Does it include the constraints the subagent needs to act without coming back to the manager for anything further?
3. Does it define what "done" looks like for this specific task?

If the brief fails two or more of these three checks, this is WEAK-BRIEF FAILURE.

## Step 3: Check what happened after the subagent responded

Locate the subagent's actual returned output in the trace.

- Does the manager's final report contain content traceable to that returned output — same facts, same approach, same artifacts?
- Or does the final report contain material that appears nowhere in the subagent's output, meaning the manager generated it herself after judging the result thin or unusable, without re-dispatching?

If the latter, this is SILENT REDO. Report it even if Step 1 and Step 2 both passed — this is the failure mode where isolation existed, a dispatch happened, the brief was even adequate, but the manager still ends up doing the work because she judged the subagent's result insufficient and quietly replaced it instead of sending it back.

## Output

Return exactly this structure, nothing else:

VERDICT: [PASS | SKIP-DISPATCH FAILURE | WEAK-BRIEF FAILURE | SILENT REDO]
EVIDENCE: [quote or point to the specific trace element that supports the verdict — no paraphrase, no inference beyond what's in the trace]
IF FAILURE — WHAT THE MANAGER ACTUALLY DID INSTEAD: [one sentence, factual, no interpretation of motive]
TASK STATUS: [ALLOW COMPLETION | BLOCK — RETURN TO MANAGER]

A task can only be marked ALLOW COMPLETION if VERDICT is PASS. Every other verdict is BLOCK, regardless of whether the final output looks fine on a read-through. Output quality is not this check's job. Process integrity is.

## Notes

- If the trace contains multiple delegated sub-tasks, audit each dispatch separately and give one verdict block per subagent, then a one-line overall status.
- If you genuinely cannot complete Step 0, that is not a PASS — say so directly instead of emitting the VERDICT block at all.
`

export function registerDelegationAuditSkill(): void {
	registerBundledSkill({
		name: 'delegation-audit',
		description:
			"Audit whether a manager agent genuinely delegated a task to a subagent, or quietly did the work herself while reporting it as delegated. Checks the trace for a real dispatch call, a checkable brief, and whether the manager's final report traces back to what the subagent actually returned.",
		whenToUse:
			'Use when a manager-style agent has reported a task complete and delegation status needs independent verification from the tool-call trace rather than being taken on faith — e.g. auditing a coordinator/teammate setup where one agent dispatches work to others.',
		argumentHint: '<trace to audit — paste it, give a file/transcript path, or name a session>',
		userInvocable: true,
		disableModelInvocation: true,
		context: 'fork',
		async getPromptForCommand(args) {
			let prompt = DELEGATION_AUDIT_PROMPT
			if (args) {
				prompt += `\n## Trace to audit\n\n${args}`
			}
			return [{ type: 'text', text: prompt }]
		},
	})
}
