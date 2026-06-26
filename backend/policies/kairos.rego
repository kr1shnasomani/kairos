package kairos.authz

import rego.v1

# =============================================================================
# KAIROS — Open Policy Agent Governance Rules
# Enforces: RBAC, authority hierarchy, asset-level access control
# =============================================================================

# Default deny
default allow := false

# =============================================================================
# Role definitions
# field_worker   — read access to briefs and search; cannot access governance
# engineer       — full read + governance operations; cannot modify MDM without authority
# reliability    — can promote quarantine items, resolve admin conflicts
# admin          — full access
# compliance     — read-only access to compliance cockpit and audit trail
# =============================================================================

roles := {
    "field_worker":  {"read_search", "read_briefs", "ack_brief"},
    "engineer":      {"read_search", "read_briefs", "ack_brief", "ingest_document", "read_governance", "resolve_admin_conflict", "read_assets", "write_assets"},
    "reliability":   {"read_search", "read_briefs", "ingest_document", "read_governance", "promote_quarantine", "resolve_admin_conflict", "read_assets"},
    "compliance":    {"read_search", "read_compliance", "read_audit"},
    "admin":         {"*"},
}

user_role := input.user.role

user_permissions := roles[user_role]

allow if {
    user_permissions[_] == "*"
}

allow if {
    user_permissions[_] == input.action
}

# =============================================================================
# Authority hierarchy enforcement
# Level 1 (Regulatory) cannot be overridden by Level 4-5 sources
# =============================================================================

valid_authority_override if {
    input.action == "create_knowledge_edge"
    input.new_authority_level <= input.existing_authority_level
}

valid_authority_override if {
    input.action == "create_knowledge_edge"
    input.user.role == "admin"
}

# =============================================================================
# Asset-level access control (site isolation)
# Users can only access assets from their assigned site(s)
# =============================================================================

asset_accessible if {
    input.asset.site_id == input.user.site_id
}

asset_accessible if {
    input.user.role == "admin"
}

asset_accessible if {
    input.user.role == "reliability"
    input.asset.site_id == input.user.site_id
}

# =============================================================================
# MoC resolution — only engineering authority can approve
# =============================================================================

can_resolve_moc if {
    input.action == "resolve_moc"
    input.user.role in {"engineer", "admin"}
}

# =============================================================================
# Quarantine promotion — requires reliability or admin role
# =============================================================================

can_promote_quarantine if {
    input.action == "promote_quarantine"
    input.user.role in {"reliability", "admin"}
}
