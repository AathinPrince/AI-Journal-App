# AI Journal & Reflection

A user-authenticated, full-stack journaling and reflection application powered by **Firebase Authentication** (Google Sign-In), **Cloud Firestore** for user-isolated persistence, and the **Gemini 3.6 Flash API** with an automated multi-tier model fallback ladder.

---

## Architecture & Security Highlights

1. **Federated Identity**: Passwordless Google Sign-In via Firebase Auth. No raw passwords or email credentials are stored or handled in application code.
2. **User Data Isolation**: Firestore documents are strictly partitioned under `/users/{userId}/interactions/{interactionId}`. Security rules strictly enforce that users can only read, create, update, or delete their own interactions (`request.auth.uid == userId`).
3. **Secret Hygiene**: `GEMINI_API_KEY` is strictly managed server-side via environment variables / Google Cloud Secret Manager. The frontend never receives or exposes the API key.
4. **Resilient AI Pipeline**: Server requests utilize a resilient fallback ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`) with error handling for HTTP 503, 429, and 500 responses.
5. **Zero-Crash Payload Hygiene**: Strict stripping of `undefined` values before submitting mutations to Firestore.

---

## Prerequisites & Environment Setup

### 1. Enable Required Google Cloud APIs

Ensure the `gcloud` CLI is installed and configured for your project:

```bash
# Set your active project ID
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="asia-southeast1" # or your target region
gcloud config set project $PROJECT_ID

# Enable Cloud Run, Secret Manager, and Firestore APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com
```

### 2. Secret Manager Configuration

Store your Gemini API key in Google Cloud Secret Manager and grant the Cloud Run runtime compute service account permissions to read it:

```bash
# Obtain your project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Create and populate the GEMINI_API_KEY secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Firestore Database Security Configuration

Deploy the following owner-bound security rules to ensure user data isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global default-deny catch-all
    match /{document=**} {
      allow read, write: if false;
    }

    // User data isolation: authenticated user can only access their own interactions
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Deploy the rules via Firebase CLI or Google Cloud:

```bash
firebase deploy --only firestore:rules
```

---

## Cloud Run Deployment Flow

Deploy the full-stack container application to Cloud Run with Secret Manager environment injection:

```bash
# Build and deploy service to Cloud Run
gcloud run deploy ai-journal-reflection \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

### Required Campaign Labeling (Verification Binding)

Apply the mandatory resource label to register the Cloud Run service for challenge verification:

```bash
gcloud run services update ai-journal-reflection \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=$REGION
```

---

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Ensure `.env` includes:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   ```
3. Start the unified development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.
