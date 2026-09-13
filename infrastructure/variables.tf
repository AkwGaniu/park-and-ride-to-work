variable "app_name" {
  type        = string
  description = "Short application name used in resource names."
  default     = "park-and-ride"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "dev"
}

variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
  default     = "eu-west-1"
}

variable "budget_alert_email" {
  type        = string
  description = "Email address for an optional monthly AWS budget alert."
  default     = null
  nullable    = true
}
