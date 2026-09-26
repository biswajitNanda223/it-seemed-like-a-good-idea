# Deployment

Authenticate with Application Default Credentials and identify the billing account before applying:

```bash
gcloud auth application-default login
cd infra/terraform
terraform init
terraform plan -var="project_id=UNIQUE_PROJECT_ID" -var="billing_account=BILLING_ACCOUNT_ID"
terraform apply
```

Then create Cloud SQL, Memorystore, the RAG corpus, and the `agentic-rag-production` Secret Manager object with environment-specific private networking. Build and push an image to Artifact Registry. Replace placeholders in the Kustomize overlay and apply it:

Install KEDA before applying the platform manifests. Bind its operator identity to `roles/monitoring.viewer` as provisioned by Terraform:

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm upgrade --install keda kedacore/keda --namespace keda --create-namespace
```

```bash
gcloud container clusters get-credentials agentic-rag --region us-central1 --project UNIQUE_PROJECT_ID
kubectl apply -k infra/k8s/overlays/production
```

Deploy the ADK export separately:

```bash
export GCP_PROJECT_ID=UNIQUE_PROJECT_ID
export GCP_LOCATION=us-central1
npm run deploy:engine -w @app/agent
```

The exact ADK CLI flags may change by SDK release; verify with `npx adk deploy agent_engine --help`. Capture the deployed Agent Engine resource name in Secret Manager and configure the gateway adapter to call it with Workload Identity credentials.

## Databricks setup

Create a Databricks service principal with only the permissions described in [the LLD](lld-databricks.md). Configure a read-only SQL warehouse, Delta Sync AI Search index containing `tenant_id` and citation fields, and approved Unity Catalog views. Set `RETRIEVAL_BACKEND=databricks` or `hybrid`; store `DATABRICKS_CLIENT_SECRET` in Secret Manager and supply all other `DATABRICKS_*` variables from environment configuration.
