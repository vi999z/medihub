# Plan: Role-Based Nav Visibility + Session Stability Fixes

## Top-Level Overview

Two bugs need fixing:

1. **Admin nav items are visible to regular users.** The sidebar renders all navigation items (including admin-only ones) for every logged-in user. Only the route itself is protected; the links remain visible.

2. **"Not found" / blank screen on session end or page refresh.** The 401 logout callback is registered in one `useEffect`, while the hydration call (which can trigger a 401) runs in a separate `useEffect`. If the 401 fires before the callback is registered, no redirect happens and the app gets stuck. A secondary cause is the `*` wildcard route redirecting to `/dashboard` while `user` is still null.

Both fixes are frontend-only and require no backend changes.

---

## Sub-Task 1 — Hide admin nav items from non-admin users

**Intent**  
Filter the sidebar navigation so that `ADMIN_ITEMS` (Users, Audit Log, Maintenance) are only rendered when `user.role === 'admin'`. Regular users should not see these links at all.

**Expected Outcomes**  
- Regular users see only `NAV_ITEMS` sections in the sidebar (MAIN MENU, OPERATIONS).
- Admin users see the full sidebar including the ADMIN section.
- No changes to route-level protection in `ProtectedRoute` (that stays as-is).

**Todo List**  
1. In `Layout.jsx`, read `user` from `useAuth()` inside the `Layout` component (it already does this).
2. Replace the `ALL_ITEMS` reference used in the sidebar `nav` block with a computed list: if `user?.role === 'admin'`, use `ALL_ITEMS`; otherwise use `NAV_ITEMS` only.
3. The `pageTitle` `useMemo` can keep using `ALL_ITEMS` so admin page titles still resolve correctly.

**Relevant Context**  
- `client/src/components/Layout.jsx` — `ALL_ITEMS`, `NAV_ITEMS`, `ADMIN_ITEMS` are defined at the top; sidebar renders at line 185.
- `client/src/context/AuthContext.jsx` — `user.role` is available via `useAuth()`.

**Status** — `[ ] pending`

---

## Sub-Task 2 — Fix the 401/session-end blank-screen race condition

**Intent**  
Ensure that when a token is expired or invalid, the user is always redirected to `/login` cleanly — no blank screen, no "not found" flicker. The root cause is that `setAuthLogout` is called in one effect and `hydrate()` in another; if the hydration 401 fires first, `on401Callback` is still `null`.

**Expected Outcomes**  
- On page refresh with an expired token, the app immediately redirects to `/login`.
- No blank/stuck screen between session end and login redirect.
- No change in behavior for valid sessions.

**Todo List**  
1. In `AuthContext.jsx`, merge the two `useEffect` calls into one. Register the logout callback **before** calling `hydrate()`, so the interceptor is always set up before any API call fires.
2. Alternatively (simpler): move the `setAuthLogout` call to be synchronous at module-level or inline before `hydrate()` inside the single combined effect.
3. Add a fallback inside the `hydrate` catch block: if `on401Callback` was not triggered by the interceptor (i.e., error is a 401 but we're still in the catch), call `window.location.href = '/login'` directly as a safety net.

**Relevant Context**  
- `client/src/context/AuthContext.jsx` — lines 13–45 are the two separate effects.
- `client/src/api/axios.js` — `on401Callback` variable and `setAuthLogout` registration at lines 48–65.

**Status** — `[ ] pending`

---

## Sub-Task 3 — Fix the wildcard route redirect during auth loading

**Intent**  
The `*` catch-all route in `App.jsx` immediately redirects to `/dashboard`. If the user navigates directly to a valid URL (e.g. `/medicines`) and `authReady` is still `false`, the `ProtectedRoute` shows a loader — but if anything fails before that, React Router may fall through to `*` and redirect to `/dashboard`, which then also shows the loader or briefly flashes. Fix the wildcard to redirect to `/login` when there is no user, or delay the redirect until auth is ready.

**Expected Outcomes**  
- Direct URL navigation (e.g. typing `/medicines` in the browser) works correctly after auth resolves.
- Unknown routes still redirect appropriately.
- No flash of "not found" or redirect loops.

**Todo List**  
1. In `App.jsx`, replace the plain `<Navigate to="/dashboard" replace />` wildcard with a small inline component (or use `ProtectedRoute` itself) that waits for `authReady` before redirecting — redirecting to `/login` if no user, or `/dashboard` if authenticated.
2. This ensures that on a hard refresh to any route, the app waits for auth hydration before deciding where to send the user.

**Relevant Context**  
- `client/src/App.jsx` — line 46, the `*` route.
- `client/src/components/ProtectedRoute.jsx` — already handles the `authReady` wait; can be reused as a pattern.

**Status** — `[ ] pending`
