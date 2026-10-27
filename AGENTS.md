# Architecture rules

- Resolve inbound WhatsApp contacts within the authenticated webhook's instance owner; create missing leads only when that owner's sales AI is enabled, so unsolicited contacts cannot cross accounts or populate inactive workspaces.
- Enforce owner-scoped sales AI phone exclusions at inbound receipt, model processing, and immediately before automatic sending; this also covers queued messages and configuration changes during generation.