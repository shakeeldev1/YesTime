# Payment OCR Verification — Requirements

To auto-read the Transaction ID / Amount / Date off an uploaded JazzCash/Easypaisa
screenshot, we need one OCR (text-reading) service. Pick ONE of the two below.

---

## Option A: Google Cloud Vision

**Cost: FREE up to ~1,000 images/month, then ~$1.50 per 1,000 images.**

### Steps to get it
1. Create a Google Cloud account (needs a card on file, even to use the free tier):
   https://console.cloud.google.com/
2. Create a new Project (top-left project dropdown → "New Project").
3. Enable the Vision API for that project:
   https://console.cloud.google.com/apis/library/vision.googleapis.com
4. Create a Service Account:
   https://console.cloud.google.com/iam-admin/serviceaccounts
   → "Create Service Account" → give it the role **"Cloud Vision AI Service Agent"** (or just "Editor" if unsure).
5. Open that service account → **Keys** tab → **Add Key** → **Create new key** → choose **JSON**.
   This downloads a `.json` file — **this file is the credential**.
6. Official pricing page (to double check current rates): https://cloud.google.com/vision/pricing

### What to send me
- The downloaded `.json` key file (or its contents pasted somewhere safe for me to add as an env variable).

---

## Option B: AWS Textract

**Cost: Free tier only for your AWS account's first 3 months (1,000 images/month). After that, paid from day one, ~$1.50 per 1,000 images.**

### Steps to get it
1. Create an AWS account (needs a card on file): https://aws.amazon.com/
2. Go to IAM (permissions manager): https://console.aws.amazon.com/iam/
3. Create a new **User** → attach the policy **`AmazonTextractFullAccess`**.
4. On that user, go to **Security credentials** tab → **Create access key**.
   This gives you two values: **Access Key ID** and **Secret Access Key**.
5. Note which **region** you created things in (e.g. `us-east-1`, `ap-south-1`) — Textract needs to know this.
6. Official pricing page: https://aws.amazon.com/textract/pricing/

### What to send me
- Access Key ID
- Secret Access Key
- Region name

---

## Quick comparison

| | Google Cloud Vision | AWS Textract |
|---|---|---|
| Ongoing free quota | Yes, ~1,000 images/month forever | No — free tier only for first 3 months of your AWS account |
| Cost after free tier | ~$1.50 / 1,000 images | ~$1.50 / 1,000 images |
| Setup time | ~15 minutes | ~15 minutes |
| Needs a card on file | Yes | Yes |

---

## Notes either way
- Adding OCR adds ~0.5–2 seconds delay to each deposit-request submission (the server waits for the OCR result before responding).
- The server needs normal outbound internet access to reach either service (already true for this app).
- This is a genuine new recurring cost tied to how many deposit requests get submitted — small at low volume, but not zero.
- Whichever one you set up, just send me the credentials from the "What to send me" section above and I'll wire it in.
