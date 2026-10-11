# Three-minute demo

1. Show the timestamped ERA5 provenance and map legend.
2. Point out that ERA5 direction is "wind from" and the app derives the opposite transport bearing.
3. Move the elapsed-time control, wind direction, and source reduction; show the receptor calculations, plume, and series recompute immediately.
4. Apply a hypothetical source reduction and compare receptor indices.
5. Download the auditable JSON result with inputs, units, version, provenance, and benchmark status.
6. Show the CAPTEX metrics and explicitly state that the chronological holdout failed the baseline. This is evidence discipline, not a validation claim.
7. Finish on the AWS architecture: Cognito to API Gateway to SQS to compute worker to DynamoDB, with a private S3/CloudFront web origin.
