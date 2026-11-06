# Security policy

## Reporting a vulnerability

Report a vulnerability privately through the "Report a vulnerability" button on this repository's Security tab. Private vulnerability reporting is enabled, and the report reaches the maintainer without a public record. Do not open a public issue for a security problem.

Say which mod is affected, the Claude Code version (`claude --version`), what you ran, and what happened. You will get a reply in the private report.

## Scope

A mod runs inside the Claude Code engine with the session's own permissions. The `ledger` mod runs the command its `command` option names, in the session's environment, as the person who started the session, and it is read-only by design. A report that the mod runs a verb outside its fixed read list, appends an event to the ledger, runs a command other than the one configured, reads a file the CLI did not return, or sends anything off the machine is in scope. What the ledger CLI itself does with the database is the [ledger's](https://github.com/smithadifd/ledger/blob/main/SECURITY.md) to answer.

## Supported versions

Fixes go to the latest release. Update to the latest tag before reporting; a problem that is already fixed there is closed with a pointer to the fix.
