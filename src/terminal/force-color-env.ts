// Loaded via `node --import`: chalk fixes its colour level on first import, and
// the server has no TTY, so visitors would otherwise get plain text.
process.env.FORCE_COLOR ??= '2';

// Ink treats CI as non-interactive.
delete process.env.CI;
