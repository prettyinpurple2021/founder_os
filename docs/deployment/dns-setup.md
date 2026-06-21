# DNS Setup Runbook

This guide walks through configuring DNS for Solo Founder Launch OS production deployment. By the end, `api.solofounder.app` will resolve to your Application Load Balancer and `app.solofounder.app` will resolve to your CloudFront distribution.

---

## Prerequisites

- AWS CLI v2 installed and configured with credentials that have Route 53 and ACM permissions
- A registered domain (e.g., `solofounder.app`) — or willingness to register one
- CDK stacks deployed (ALB and CloudFront distribution exist) — see [first-deployment.md](./first-deployment.md)
- ACM certificates issued for `api.solofounder.app` and `app.solofounder.app` (created by the CDN stack)

---

## Step 1: Domain Registration

Register or transfer your domain. If you don't already own `solofounder.app` (or your chosen domain):

**Option A — Register via Route 53 (recommended)**

```bash
aws route53domains register-domain \
  --domain-name solofounder.app \
  --duration-in-years 1 \
  --admin-contact file://contact.json \
  --registrant-contact file://contact.json \
  --tech-contact file://contact.json \
  --auto-renew
```

Route 53 as registrar automatically configures NS records to its own hosted zone, saving Step 3.

**Option B — Use an external registrar**

If you registered through an external registrar (Namecheap, Google Domains, Cloudflare, etc.), you'll need to manually update NS records in Step 3.

> **Note:** Domain registration can take up to 15 minutes to complete. Check status with:
> ```bash
> aws route53domains get-domain-detail --domain-name solofounder.app
> ```

---

## Step 2: Create Route 53 Hosted Zone

Create a public hosted zone for your domain:

```bash
aws route53 create-hosted-zone \
  --name solofounder.app \
  --caller-reference "solo-founder-$(date +%s)"
```

**Save the output.** You'll need:
- The **Hosted Zone ID** (e.g., `Z1234567890ABC`)
- The **Name Servers** (4 NS records)

To retrieve these later:

```bash
# List hosted zones
aws route53 list-hosted-zones-by-name --dns-name solofounder.app

# Get name servers for a specific hosted zone
aws route53 get-hosted-zone --id Z1234567890ABC
```

> **Warning:** If you already have an existing hosted zone for this domain, do NOT create a duplicate. Multiple hosted zones for the same domain causes routing confusion. Use the existing zone ID instead.

---

## Step 3: Configure NS Records at Registrar

If you used an external registrar (not Route 53), update the domain's name servers to point to the Route 53 hosted zone.

1. Get your Route 53 name servers:

```bash
aws route53 get-hosted-zone --id Z1234567890ABC --query 'DelegationSet.NameServers'
```

Output will look like:

```json
[
  "ns-1234.awsdns-12.org",
  "ns-567.awsdns-34.com",
  "ns-890.awsdns-56.co.uk",
  "ns-111.awsdns-78.net"
]
```

2. Go to your registrar's DNS management panel
3. Replace the existing name servers with all 4 Route 53 name servers
4. Save the changes

> **Warning:** NS record changes can take up to 48 hours to propagate globally. In practice, most propagation completes within 1–4 hours.

If your domain was registered via Route 53, this step happens automatically — skip to Step 4.

---

## Step 4: Create API Subdomain Record

Create an A record (and AAAA for IPv6) that aliases `api.solofounder.app` to your Application Load Balancer.

First, get your ALB details:

```bash
# Get ALB DNS name and hosted zone ID
aws elbv2 describe-load-balancers \
  --names solo-founder-production-alb \
  --query 'LoadBalancers[0].[DNSName,CanonicalHostedZoneId]' \
  --output text
```

Then create the alias record:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.solofounder.app",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "<ALB_HOSTED_ZONE_ID>",
            "DNSName": "<ALB_DNS_NAME>",
            "EvaluateTargetHealth": true
          }
        }
      },
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.solofounder.app",
          "Type": "AAAA",
          "AliasTarget": {
            "HostedZoneId": "<ALB_HOSTED_ZONE_ID>",
            "DNSName": "<ALB_DNS_NAME>",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'
```

Replace:
- `Z1234567890ABC` — your Route 53 hosted zone ID
- `<ALB_HOSTED_ZONE_ID>` — the ALB's canonical hosted zone ID (from the command above)
- `<ALB_DNS_NAME>` — the ALB's DNS name (e.g., `solo-founder-prod-123456.us-east-1.elb.amazonaws.com`)

> **Note:** The `HostedZoneId` in the alias target is the ALB's hosted zone, NOT your domain's hosted zone. These are different values. See [Troubleshooting](#hosted-zone-id-confusion) if you get errors.

---

## Step 5: Create Web Subdomain Record

Create an A record (and AAAA) that aliases `app.solofounder.app` to your CloudFront distribution.

Get your CloudFront distribution domain:

```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[0]=='app.solofounder.app'].[DomainName,Id]" \
  --output text
```

Create the alias record:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "app.solofounder.app",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z2FDTNDATAQYW2",
            "DNSName": "<CLOUDFRONT_DOMAIN_NAME>",
            "EvaluateTargetHealth": false
          }
        }
      },
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "app.solofounder.app",
          "Type": "AAAA",
          "AliasTarget": {
            "HostedZoneId": "Z2FDTNDATAQYW2",
            "DNSName": "<CLOUDFRONT_DOMAIN_NAME>",
            "EvaluateTargetHealth": false
          }
        }
      }
    ]
  }'
```

Replace:
- `Z1234567890ABC` — your Route 53 hosted zone ID
- `<CLOUDFRONT_DOMAIN_NAME>` — the CloudFront distribution domain (e.g., `d111111abcdef8.cloudfront.net`)

> **Note:** The hosted zone ID for all CloudFront distributions is always `Z2FDTNDATAQYW2`. This is a global AWS constant — don't change it.

---

## Step 6: Update Environment Config

Update `packages/infra/lib/config/environments.ts` with your actual domain values.

The file currently contains placeholder values that should work if your domain is `solofounder.app`:

```typescript
// packages/infra/lib/config/environments.ts
production: {
  account: '987654321098', // ← Replace with your actual AWS account ID
  region: 'us-east-1',
  stage: 'production',
  domain: {
    api: 'api.solofounder.app',    // ← Verify or update
    web: 'app.solofounder.app',    // ← Verify or update
    zone: 'solofounder.app',       // ← Verify or update
  },
  // ...
  monitoring: {
    alarmEmail: 'alerts@solofounder.app', // ← Replace with your email
    // ...
  },
}
```

**Update checklist:**
- [ ] Replace `987654321098` with your real AWS account ID
- [ ] Confirm `domain.api` matches the subdomain from Step 4
- [ ] Confirm `domain.web` matches the subdomain from Step 5
- [ ] Confirm `domain.zone` matches your registered domain
- [ ] Replace `alarmEmail` with a valid email you monitor

After updating, redeploy the CDK stacks to propagate changes:

```bash
npm run bootstrap -- --stage production --skip-bootstrap
```

---

## Step 7: Verification

After DNS records are created and propagation has occurred, verify resolution.

### Verify API subdomain

```bash
# Check A record resolves
dig api.solofounder.app A +short

# Expected output: ALB IP addresses (will change over time)
# Example: 52.0.1.123
#          52.0.1.124

# Verify it points to the ALB
dig api.solofounder.app CNAME +short
# Or check the alias target
nslookup api.solofounder.app
```

### Verify Web subdomain

```bash
# Check A record resolves
dig app.solofounder.app A +short

# Expected output: CloudFront edge IP addresses
# Example: 13.35.0.1
#          13.35.0.2

# Verify HTTPS works
curl -I https://app.solofounder.app
# Expected: HTTP/2 200 (or 301/302 if not fully deployed)
```

### Verify API health

```bash
curl -s https://api.solofounder.app/health | jq .
# Expected: { "status": "ok" }
```

### Verify NS delegation

```bash
# Confirm Route 53 is authoritative
dig solofounder.app NS +short
# Expected: Four ns-*.awsdns-*.{org,com,co.uk,net} name servers
```

### Full resolution trace

```bash
# Trace the full resolution path
dig api.solofounder.app +trace
```

> **Note:** DNS resolution should work within 5 minutes for alias records within Route 53. If you changed NS records at a registrar, allow up to 48 hours for full global propagation.

---

## Troubleshooting

### Propagation Delays

**Symptom:** `dig` returns `NXDOMAIN` or old values after making changes.

**Causes and fixes:**
- **NS record changes at registrar:** Can take 24–48 hours. Check current NS with `dig solofounder.app NS` from a different network or use `dig @8.8.8.8 solofounder.app NS` to query Google's DNS.
- **A/AAAA alias record changes:** Usually propagate within 60 seconds within Route 53. If not resolving, the issue is likely NS delegation (not the alias record itself).
- **Local DNS cache:** Flush your local cache:
  ```bash
  # macOS
  sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
  
  # Linux
  sudo systemd-resolve --flush-caches
  ```
- **Browser cache:** Browsers aggressively cache DNS. Use incognito mode or `curl` to test.

**Quick check:** Query Route 53 directly to verify the record exists regardless of propagation:

```bash
aws route53 list-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --query "ResourceRecordSets[?Name=='api.solofounder.app.']"
```

---

### NS Record Mismatch

**Symptom:** Domain resolves with old/wrong records, or returns `SERVFAIL`.

**Cause:** The NS records at your registrar don't match the Route 53 hosted zone name servers.

**Diagnosis:**

```bash
# What the registrar thinks (check TLD name servers directly)
dig solofounder.app NS @a.nic.app

# What Route 53 expects
aws route53 get-hosted-zone --id Z1234567890ABC --query 'DelegationSet.NameServers'
```

**Fix:** These must match exactly. If they don't:
1. Go to your registrar's DNS settings
2. Replace all NS records with the values from the `aws route53 get-hosted-zone` command
3. Wait for propagation (up to 48 hours)

> **Warning:** If you deleted and recreated a Route 53 hosted zone, the name servers will have changed. You must update the registrar again with the new values.

---

### Hosted Zone ID Confusion

**Symptom:** API returns `InvalidChangeBatch` when creating alias records, or records point to the wrong resource.

**Cause:** There are three different "hosted zone IDs" involved in alias records — they're easy to mix up.

| ID | What it is | Where to find it |
|----|-----------|-----------------|
| Your domain's hosted zone ID | The Route 53 zone managing `solofounder.app` | `aws route53 list-hosted-zones` |
| ALB hosted zone ID | AWS-managed zone for the ALB's region | `aws elbv2 describe-load-balancers` → `CanonicalHostedZoneId` |
| CloudFront hosted zone ID | Global constant for all CF distributions | Always `Z2FDTNDATAQYW2` |

**Rules:**
- The `--hosted-zone-id` parameter in `change-resource-record-sets` = **your domain's hosted zone ID**
- The `HostedZoneId` inside `AliasTarget` = **the target resource's hosted zone ID** (ALB or CloudFront)
- Never put your domain's hosted zone ID in the alias target
- Never put the ALB/CloudFront zone ID as the main `--hosted-zone-id`

**Common ALB hosted zone IDs by region:**

| Region | ALB Hosted Zone ID |
|--------|-------------------|
| us-east-1 | Z35SXDOTRQ7X7K |
| us-west-2 | Z1H1FL5HABSF5 |
| eu-west-1 | Z32O12XQLNTSW2 |

Use `aws elbv2 describe-load-balancers` to get the exact value for your ALB.

---

### Certificate Validation Pending

**Symptom:** ACM certificate status is `PENDING_VALIDATION`, and HTTPS doesn't work.

**Cause:** ACM certificates require DNS validation. The CDK stack creates the certificate but you need the DNS validation records in Route 53.

**Diagnosis:**

```bash
aws acm list-certificates --query "CertificateSummaryList[?DomainName=='api.solofounder.app']"

aws acm describe-certificate \
  --certificate-arn <CERT_ARN> \
  --query 'Certificate.DomainValidationOptions'
```

**Fix:**

1. Get the CNAME validation records from ACM:

```bash
aws acm describe-certificate \
  --certificate-arn <CERT_ARN> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

2. Add the CNAME record to Route 53:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "<VALIDATION_CNAME_NAME>",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "<VALIDATION_CNAME_VALUE>"}]
      }
    }]
  }'
```

3. Wait for validation (typically 5–30 minutes):

```bash
aws acm wait certificate-validated --certificate-arn <CERT_ARN>
```

> **Note:** If the CDK stack uses `DnsValidatedCertificate` or `Certificate` with DNS validation, it may create these records automatically via a custom resource — but only if the hosted zone exists and is properly delegated at deployment time.

---

## Quick Reference

| Item | Value |
|------|-------|
| Domain | `solofounder.app` |
| API subdomain | `api.solofounder.app` |
| Web subdomain | `app.solofounder.app` |
| CloudFront hosted zone ID | `Z2FDTNDATAQYW2` (global constant) |
| Config file | `packages/infra/lib/config/environments.ts` |
| Readiness check | `npm run check:readiness -- --stage production --category dns` |
