# Security

## Reporting a problem

If you find a security problem in Cardamix, please report it privately through GitHub:
**Security → Report a vulnerability** on this repository. Please don't open a public issue
for it. You'll get a reply, and a fix will be prioritised by how serious it is.

Please don't access other people's data, disrupt the service, or run automated attacks
while looking.

## What's in place

How changes are made and checked: [docs/ENGINEERING.md](docs/ENGINEERING.md).
The rules that must never break, and the tests that prove them: [docs/INVARIANTS.md](docs/INVARIANTS.md).

- Card payments are handled entirely on Stripe's own pages.
- Database access is closed by default and covered by automated rule tests.
- Every change runs type checks, unit tests, database-rule tests, click-through tests,
  an accessibility check, a known-vulnerability check and GitHub code scanning.
- Libraries and build actions are watched for security updates (Dependabot).
