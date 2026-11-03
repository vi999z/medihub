// A counter that goes up every time data is changed through the API. Caches
// (e.g. the AI assistant's data lookups) include it in their key, so they are
// reused between changes but can never serve data older than the last save.
let version = 0;

module.exports = {
  bump() { version += 1; },
  current() { return version; },
};
