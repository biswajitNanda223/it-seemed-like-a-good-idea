resource "google_project" "project" {
  name            = "Agentic RAG Platform"
  project_id      = var.project_id
  billing_account = var.billing_account
  org_id          = var.organization_id
}

locals { services = toset(["aiplatform.googleapis.com", "artifactregistry.googleapis.com", "container.googleapis.com", "redis.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "iamcredentials.googleapis.com", "cloudtrace.googleapis.com", "logging.googleapis.com", "monitoring.googleapis.com"]) }
resource "google_project_service" "apis" {for_each = local.services; project = google_project.project.project_id; service = each.value; disable_on_destroy = false}

resource "google_artifact_registry_repository" "platform" {
  location = var.region
  repository_id = "platform"
  format = "DOCKER"
  depends_on = [google_project_service.apis]
}

resource "google_service_account" "runtime" {account_id = "platform-runtime"; display_name = "Agentic RAG runtime"}
resource "google_project_iam_member" "runtime_vertex" {project = google_project.project.project_id; role = "roles/aiplatform.user"; member = "serviceAccount:${google_service_account.runtime.email}"}
resource "google_project_iam_member" "runtime_trace" {project = google_project.project.project_id; role = "roles/cloudtrace.agent"; member = "serviceAccount:${google_service_account.runtime.email}"}
resource "google_project_iam_member" "runtime_log" {project = google_project.project.project_id; role = "roles/logging.logWriter"; member = "serviceAccount:${google_service_account.runtime.email}"}

resource "google_container_cluster" "primary" {
  name = "agentic-rag"
  location = var.region
  enable_autopilot = true
  deletion_protection = true
  release_channel {channel = "REGULAR"}
  networking_mode = "VPC_NATIVE"
  workload_identity_config {workload_pool = "${google_project.project.project_id}.svc.id.goog"}
  depends_on = [google_project_service.apis]
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.runtime.name
  role = "roles/iam.workloadIdentityUser"
  member = "serviceAccount:${google_project.project.project_id}.svc.id.goog[agentic-rag/platform-runtime]"
}

output "project_id" {value = google_project.project.project_id}
output "cluster" {value = google_container_cluster.primary.name}
output "runtime_service_account" {value = google_service_account.runtime.email}
