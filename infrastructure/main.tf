locals {
  name        = "${var.app_name}-${var.environment}"
  website_key = "${var.app_name}-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}
