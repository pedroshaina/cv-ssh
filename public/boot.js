// A classic, blocking script so these classes are set before first paint.
// js: CSS switches to the TUI layout. windowed: on wide screens the terminal opens as a window,
// then app.js maximizes it before the ssh command types itself (skipped for reduced motion).
document.documentElement.classList.add('js');
if (matchMedia('(min-width: 700px) and (prefers-reduced-motion: no-preference)').matches) {
  document.documentElement.classList.add('windowed');
}
