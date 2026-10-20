# Site Visual Editor

A Git-connected editor for modifying existing websites without generating new layouts. The original source snapshot is preserved in `backup/` and must not be changed.

## Scope

- GitHub and GitLab repository/file adapters.
- Existing HTML page preview in an isolated iframe.
- Select elements and edit text, image/link attributes, and common inline styles.
- Clone/remove selected elements, preview responsive widths, export HTML, and commit changes to the selected branch.
- Supabase Auth + database-backed draft snapshots with per-user RLS.
- Framework detection hints for React/Next/Vite projects; framework-aware JSX editing and build previews are follow-up work, not yet complete.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` if you need to override the configured Supabase URL/key.
4. Run `npm run dev`.

## Git connection

Paste a GitHub or GitLab repository URL, branch, and a personal access token with the minimum required repository read/write scope. Tokens remain in page memory only and are never stored in the database or local storage. This is a first implementation; OAuth-backed server-side token handling should replace manual token entry before a broad public deployment.

## Database

The `visual_editor_projects` and `visual_editor_revisions` tables store workspace metadata and draft snapshots. RLS restricts rows to the signed-in owner. The matching SQL migration is in `supabase/migrations/`. The project schema was applied to the linked Supabase project during initial implementation.

## Important limitations

- Visual preview/editing currently supports HTML files. CSS/JS/JSX/TSX files are listed and can be inspected, but are not yet edited through framework-aware transforms.
- The current commit flow writes the opened file to the selected existing branch. Use a feature branch until branch creation and pull/merge request flows are added.
- Preview sandbox is isolated but project-authored JavaScript still runs inside that sandbox; only load repositories you trust.
- Browser-based relative assets depend on the provider's raw-file URL layout and may not perfectly reproduce every framework build.
- A successful Git commit does not guarantee a live deployment; that depends on the repository's configured deployment pipeline.
- `backup/` is immutable reference material and should never be overwritten by implementation work.

## Implementation status

This branch is the initial MVP scaffold. Run `npm run build` and exercise provider authentication, HTML editing, database saves, and Git commits before merging or deploying.
