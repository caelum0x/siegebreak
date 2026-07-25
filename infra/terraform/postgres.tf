# Postgres is Neon (serverless, branch-per-PR), managed outside Terraform
# via the Neon console/API. This file documents the connection contract
# rather than provisioning Neon directly.
variable "neon_database_url" {
  type      = string
  sensitive = true
}
