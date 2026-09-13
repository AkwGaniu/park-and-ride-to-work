resource "aws_dynamodb_table" "members" {
  name         = "${local.name}-members"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "memberId"

  attribute {
    name = "memberId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "weekly_availability" {
  name         = "${local.name}-weekly-availability"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "weekStart"
  range_key    = "memberId"

  attribute {
    name = "weekStart"
    type = "S"
  }

  attribute {
    name = "memberId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "weekly_rotas" {
  name         = "${local.name}-weekly-rotas"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "weekStart"
  range_key    = "day"

  attribute {
    name = "weekStart"
    type = "S"
  }

  attribute {
    name = "day"
    type = "S"
  }
}
