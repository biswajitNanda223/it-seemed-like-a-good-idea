variable "project_id" {type = string}
variable "billing_account" {type = string; sensitive = true}
variable "organization_id" {type = string; default = null}
variable "region" {type = string; default = "us-central1"}
