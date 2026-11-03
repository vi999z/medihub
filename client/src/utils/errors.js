// One place that turns any failed request into a message a person can act on.
// Pages use errorMessage(err, 'What we were trying to do failed') instead of
// reading err.response by hand, so every screen words problems the same way.

export function isNetworkError(err) {
  return Boolean(err) && !err.response && err.code !== 'ERR_CANCELED';
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (err.message === 'canceled' || err.code === 'ERR_CANCELED') return 'Cancelled.';

  // Nothing came back: no connection, or the server took too long.
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
      return 'The server took too long to answer. It may be waking up. Please try again in a moment.';
    }
    return "Can't reach the server. Check your internet connection and try again.";
  }

  const { status, data } = err.response;
  const fromServer = data && typeof data === 'object' ? data.error : null;
  // A wrong password on the login form is a message from the server, not an expired session.
  if (status === 401 && err.config?.url?.endsWith('/auth/login')) return fromServer || 'Invalid credentials';
  if (status === 401) return fromServer && /locked|too many/i.test(fromServer) ? fromServer : 'Your session has ended. Please log in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return fromServer || 'That could not be found. It may have been removed. Refresh the page and try again.';
  if (status === 413) return fromServer || 'That file or request is too large.';
  if (status === 429) return fromServer || 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return fromServer || 'The server had a problem. Please try again in a moment.';
  return fromServer || fallback;
}

// The form field a server validation error belongs to (e.g. 'expiry_date'), if it named one.
export function errorField(err) {
  const field = err?.response?.data?.field;
  return typeof field === 'string' ? field : null;
}
