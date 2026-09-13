data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/index.js"
  output_path = "${path.module}/../backend/dist/api.zip"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      MEMBERS_TABLE      = aws_dynamodb_table.members.name
      AVAILABILITY_TABLE = aws_dynamodb_table.weekly_availability.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]
}
