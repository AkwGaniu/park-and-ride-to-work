# Park and Ride to Work

A low-cost AWS serverless application for collecting weekly work availability and generating a fair shared-driving rota.

## Technology

- React and TypeScript frontend
- Node.js and TypeScript AWS Lambda API
- Amazon API Gateway HTTP API
- Amazon DynamoDB on-demand tables
- Amazon S3 and CloudFront hosting
- Terraform infrastructure in `eu-west-1`

## Local prerequisites

- Node.js 22+
- Terraform 1.15+
- AWS CLI credentials configured for `eu-west-1`

## First deployment

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm run build

cd ../infrastructure
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

The first deployment publishes a health-check API and a placeholder frontend. The next phase adds members and weekly availability.

## Cost guardrails

The infrastructure uses on-demand DynamoDB, Lambda on ARM64, a short CloudWatch retention period, and a low API Gateway throttle. Set `budget_alert_email` in `terraform.tfvars` to enable a small monthly AWS Budget alert.
