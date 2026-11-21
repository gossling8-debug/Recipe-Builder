# How changes are made safely

Cardamix is built mostly with an AI coding assistant, and its owner approves changes
without reading code line by line. That's the risk the industry calls *comprehension
debt*: code arriving faster than anyone understands it. This document is the answer:
no change relies on a single reviewer, every important rule is written down and tested,
and the riskiest code gets the most independent checks.

It follows the NIST Secure Software Development Framework (SSDF, SP 800-218, with the
AI supplement SP 800-218A) and the NIST Cybersecurity Framework 2.0; the mapping is at
the end.

## 1. Risk tiers

Every change is put in the highest tier of anything it touches.

| Tier | What | Examples (paths) |
|---|---|---|
| **3 — critical** | Money, accounts, other people's data, secrets, what the server does, the database rules, the build pipeline, what's sent to the AI | `firestore.rules`, `functions/**`, `src/lib/subscription.ts`, `src/lib/cloud.ts`, `src/lib/db.ts`, `src/lib/claude.ts`, `src/lib/undoDelete.ts`, `src/lib/funnel.ts`, `.github/**`, `index.html`, `package*.json` |
| **2 — behaviour** | What a feature does with your own data | planners, pantry, shopping list, budget, scanning, cookbooks UI |
| **1 — presentation** | Words, layout, colours, icons | most of `src/components/*`, `src/styles.css` |

## 2. The method (every change)

1. **Classify** the tier (above).
2. **Write the intent** in the pull request, in plain language: what changes, why, what
   could go wrong, and which rules in [INVARIANTS.md](INVARIANTS.md) it touches. If the
   change adds a rule that must never break, add it there, with its test.
3. **Threat-check** (Tier 3): go through the [checklist](#4-tier-3-threat-checklist).
4. **Build the smallest change** that does the job. No unrelated edits in the same PR.
5. **Verify in layers** — all automatic, all required (see `.github/workflows/test.yml`):
   type check · unit tests · database-rule tests · click-through tests · accessibility ·
   known-vulnerability check · code scanning (CodeQL).
   For Tier 2 and 3, **prove the test can fail**: break the code on purpose, watch the
   test catch it, put the code back. A test that can't fail proves nothing.
6. **Independent review** (Tier 3): a second review that doesn't start from the author's
   reasoning (e.g. Claude Code's `/code-review` at high effort, or a person). Findings
   are fixed or answered in the PR. Tier-3 areas are also on the list for the periodic
   human security review.
7. **Release, watch, learn**: merge only when every check is green; know how to roll back
   ([RUNBOOK.md](RUNBOOK.md)); watch the error reports after release; after any
   incident, write down what happened and add the missing test or rule.

## 3. Rules for everyone (people and AI)

- Never weaken, skip or delete a test or a security rule to make something pass.
- Never put a secret in the code, a commit, a log or a chat. Secrets live in GitHub
  secrets and Google Secret Manager only.
- Test stand-ins (Claude, Stripe, Lulu) work only inside the local emulator.
- Anything the person can't easily undo (charging money, deleting data) is confirmed
  first or can be undone.
- When unsure, say so. Evidence (a test run, a screenshot, a log) beats assurance.

## 4. Tier-3 threat checklist

From the OWASP Top 10, OWASP ASVS 5.0 and the OWASP Top 10 for LLM Applications:

- **Access**: can someone read or change data that isn't theirs? (rules test for it)
- **Trust**: is anything decided on the phone that only the server should decide
  (plans, limits, prices)? The phone is never trusted for these.
- **Input**: is everything from outside (a photo, a web page, a Stripe message, a shared
  link) checked for type and size? Is a webhook's signature verified?
- **AI**: could text inside a photo or web page change what the AI does (prompt
  injection)? Answers must stay in the strict recipe format, are shown as plain text,
  and can't trigger actions on their own. Cost is capped per account.
- **Secrets & privacy**: does anything new get stored, logged or shown? Is it in the
  privacy page and deleted with the account?
- **Money**: is the amount shown before charging? Is a failed payment handled? Can it
  be charged twice?
- **Supply chain**: is a new library needed? Is it well maintained? Build actions are
  pinned to exact versions.
- **Failure**: what happens offline, on a timeout, or if the server is down?

## 5. Standards mapping

| Standard | What it asks | Where Cardamix does it |
|---|---|---|
| NIST SSDF PO (prepare the organization) | Roles, requirements, toolchains | This document; `CLAUDE.md`; required checks |
| NIST SSDF PS (protect the software) | Protect code and releases | No secrets in code; pinned actions; least-privilege workflows; branch protection (checks required before merging) |
| NIST SSDF PW (produce well-secured software) | Threat modelling, review, testing | Tiers, checklist, layered tests, independent review |
| NIST SSDF RV (respond to vulnerabilities) | Find, fix, learn | Dependabot, CodeQL, `SECURITY.md`, incident notes |
| NIST SP 800-218A (AI) | Extra care for AI-generated code and AI features | Human approval of every merge; tests proven to fail; LLM checklist |
| NIST CSF 2.0 (Govern, Identify, Protect, Detect, Respond, Recover) | A whole security programme | This framework; INVARIANTS; checks; error reports; uptime check; [RUNBOOK.md](RUNBOOK.md); daily backups and point-in-time recovery |
| ISO/IEC 27001:2022 Annex A 8.25–8.29, 8.32 | Secure development life cycle, secure coding, security testing, change management | Sections 2–4 |
| OWASP ASVS 5.0 / Top 10 / CWE Top 25 | Web app security requirements | Checklist; database-rule tests; CodeQL `security-extended` |
| OWASP Top 10 for LLM Applications | Prompt injection, unsafe output, cost abuse | Strict output format, plain-text display, server-side limits |
| CISA Secure by Design | Secure defaults, ownership of outcomes | Closed-by-default rules; undo; confirmations |
| SLSA / OpenSSF Scorecard | Supply-chain integrity | Lockfiles, `npm ci`, pinned actions, Dependabot |
| PCI DSS v4 (SAQ A) | Card data handling | Card details only ever on Stripe's own pages |
| WCAG 2.2 AA | Accessibility | Automatic accessibility check on 12 screens |

## 6. Running the checks yourself

```
npm test                 # unit tests (app and server)
npm run test:rules       # database security rules (needs Java 21)
npm run e2e              # click-through tests (needs Java 21)
npx tsc --noEmit         # type check (app)
npx tsc --noEmit -p tsconfig.tests.json   # type check (tests outside src/)
```
