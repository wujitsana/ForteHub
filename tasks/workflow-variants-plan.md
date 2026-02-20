# ForteHub Workflow Variant Plan (Manager Scope)

  Date: 2025-XX-XX
  Status: Draft (pending implementation)

  ## Summary
  - Keep the one-clone-per-workflowId rule.
  - Introduce manager-local "variant" profiles (config + schedule bundles) bound to
  an existing workflow resource.
  - Variants are metadata only (not resources, not transferable). If the workflow
  leaves the manager (e.g., listed on the marketplace), variants pause automatically.

  ## Variant Anatomy

  struct VariantProfile {
  let profileId: UInt64      // per-workflow counter
  var label: String
  var configOverrides: {String: AnyStruct}
  var schedule: {"isScheduled": Bool, "frequency": UFix64?}
  var status: String         // "active", "paused", "missing"
  }

  - Manager stores `workflowVariants: {UInt64: {UInt64: VariantProfile}}` plus
  `nextVariantProfileId[workflowId]`.
  - Config overrides merge with registry defaults before calling workflow `run()`.
  - Schedule metadata is used when scheduling variants (each handler tracks
  `(workflowId, profileId)`).

  ## Lifecycle Rules
  1. **Create variant**: owner selects workflowId, defines label + overrides +
  schedule. Manager saves the profile (default status `active`).
  2. **Run variant**: manager merges config and executes underlying workflow
  resource. Scheduling handlers refer to `(workflowId, profileId)`.
  3. **Workflow removed (listing/withdraw)**: manager marks all variants for that
  workflow as `missing`. Scheduling attempts must fail fast with a clear error.
  4. **Workflow redeposited**: variants flip back to `paused`; owner can reactivate/
  schedule them.
  5. **Delete variant**: remove profile entry, cancel schedule if needed.

  ## Manager Work Items
  - Add storage for variants + helper map for profile IDs.
  - Expose Cadence APIs:
    - `createVariant(workflowId, label, overrides, scheduleSettings)`
    - `updateVariant`, `deleteVariant`
    - `runVariant(workflowId, profileId, isScheduledExecution)`
    - `scheduleVariant(workflowId, profileId, frequency, account)`
    - `setVariantStatus(workflowId, profileId, status)` (internal helper)
  - Hook into existing flows:
    - `removeWorkflow` → set status `missing`.
    - `acceptWorkflow`/`depositWorkflow` → restore status `paused`.
    - `burnWorkflow` → destroy variants for that workflow.
  - Update scheduling handler payloads to include `profileId` so it can load the
  right overrides.

  ## Marketplace Interaction
  - Listing a workflow removes it from `self.workflows`, so variants auto-switch
  to `missing`.
  - Optional future guard: prevent listing while variants are `active` unless user
  confirms (frontend responsibility).
  - Buyers receive only the base workflow resource. They can create their own
  variants afterward.

  ## Future Frontend/API Work (not part of manager task)
  - Dashboard UI to create/rename/delete variants, edit overrides, toggle schedules.
  - Display status badges (Active / Paused / Missing).
  - Export/import variant configs for sharing (client-side only).
  - Marketplace warning when listing a workflow that has variants.

  ## Open Questions
  - Should we cap the number of variants per workflow to avoid unbounded storage?
  (Default: no cap, but surface data usage.)
  - Do we emit variant-specific Cadence events? Optional.
  - Migration path: when we ship this, auto-create a "Default" variant for every
  existing workflow to preserve current behavior.

  ## Next Steps
  1. Implement manager-side storage + APIs.
  2. Update scheduling handler and transactions to carry `(workflowId, profileId)`
  context.
  3. Add Cadence tests for variant creation/run/removal/listing interactions.
  4. Update `cadence/README.md` once code lands.

  (Replace the triple backticks in the “Variant Anatomy” section with actual code
  fences when you paste, if needed.)