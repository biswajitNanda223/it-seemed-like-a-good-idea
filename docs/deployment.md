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
