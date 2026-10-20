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

The workspace supports GitHub and GitLab provider sign-in, plus a manual token fallback. After provider sign-in, use **Load repositories I can access** to select a repository and its default branch. OAuth must be enabled for the chosen provider in the linked Supabase Auth settings, and the app origin must be included in allowed redirect URLs. GitHub requests the `repo` scope; GitLab requests API and repository read/write scopes. If OAuth is not configured, the UI reports the provider error and manual token entry remains available. Git credentials are not written to the visual-editor project or revision tables. For a broad public deployment, a server-side token broker or GitHub/GitLab app integration with least-privilege authorization is still recommended.

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
