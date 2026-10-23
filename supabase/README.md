# Visual Editor database

The migration `migrations/20261020230000_create_visual_editor_workspace.sql` creates dedicated tables for the visual editor only.

- `visual_editor_projects`: repository metadata and editor settings.
- `visual_editor_revisions`: private draft snapshots and commit history metadata.
- Both tables have RLS enabled. A signed-in user can only access rows where `owner_id = auth.uid()`.
- Git tokens are intentionally not stored in these tables.

The migration was applied to the linked Supabase project during initial implementation and is also committed here for reproducibility. Before production deployment, verify Supabase Auth email confirmation and redirect URLs for the deployed editor domain.
