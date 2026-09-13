output "api_url" {
  description = "Base URL for the HTTP API."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "website_url" {
  description = "CloudFront URL for the frontend."
  value       = "https://${aws_cloudfront_distribution.website.domain_name}"
}

output "members_table_name" {
  value = aws_dynamodb_table.members.name
}
