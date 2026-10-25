# Contributing to Lev Space

Thanks for your interest! This guide describes how the project is organised and the checks every change should pass.

## Setup

```bash
npm install
cp .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed             # optional: demo data on an empty database
npm run dev              # http://localhost:3000 with auto-reload
```

## Before opening a pull request

```bash
npm run lint             # ESLint: 0 errors expected
npm run format:check     # Prettier (use `npm run format` to fix)
npm test                 # node:test suites in test/
```

The same checks run in GitHub Actions on Node 20 and 22.

## Code organisation

- **Server** (`server/`): routes in `routes/` only translate HTTP; business rules live in the services (`bookingService`, `authService`, `holidayService`, `reportService`, `businessHours`). Services throw `HttpError(status, message)` from `errors.js`; a single handler turns them into `{ success: false, error }` responses. Multi-row writes go through `withTransaction()`.
- **Frontend** (`frontend/`): one script per page in `js/`, shared helpers in `js/utils.js` (`apiRequest`, `escapeHtml`, `showToast`, …) and `js/layout.js` (menu, logout, `requireAuth`). No inline scripts or `onclick` attributes: the Content Security Policy blocks them.
- **CSS** (`frontend/styles/`): `tokens` → `base` → `components` → `layout` → `pages`, all imported by `styles.css`. Use the semantic tokens (`--color-text-primary`, `--color-accent-text`, `--on-accent`, …) instead of hex values so both themes keep AA contrast. New components may use BEM-style names (`block__element--modifier`), as in the admin calendar; existing class names are kept as they are.

## Conventions

- User-facing text and code comments are in Italian; this file and the README are in English.
- Any value coming from users must go through `escapeHtml()` before being inserted with `innerHTML`.
- Interactive elements must be reachable and usable with the keyboard; use `makeSelectable()` for non-button elements of the calendars.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, …), one logical change per commit.
- Check UI changes in both light and dark theme.
