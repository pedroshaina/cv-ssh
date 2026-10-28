// Loaded with `node --import` (see package.json and the Dockerfile), before
// anything else: chalk decides its colour level from the environment the
// first time it is imported, and an import order is too easy to break.
// The server process has no TTY of its own (especially in a pod), so
// without this every visitor would get plain text. 256 colours is the safe
// default: chalk downsamples hex colours and nearly every terminal supports it.
process.env.FORCE_COLOR ??= '2';

// Ink treats CI environments as non-interactive. We pass `interactive: true`
// explicitly, but clear the flag too so nothing else downstream gets confused.
delete process.env.CI;
