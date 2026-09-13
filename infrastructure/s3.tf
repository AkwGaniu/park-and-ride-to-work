resource "aws_s3_bucket" "website" {
  bucket = local.website_key
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket                  = aws_s3_bucket.website.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.website.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.website.arn }
      }
    }]
  })
}

resource "aws_s3_object" "website_files" {
  for_each = fileset("${path.module}/../frontend/dist", "**")

  bucket = aws_s3_bucket.website.id
  key    = each.value
  source = "${path.module}/../frontend/dist/${each.value}"
  etag   = filemd5("${path.module}/../frontend/dist/${each.value}")
  content_type = lookup({
    "css"  = "text/css"
    "html" = "text/html"
    "js"   = "application/javascript"
    "svg"  = "image/svg+xml"
  }, element(reverse(split(".", each.value)), 0), "application/octet-stream")
}
