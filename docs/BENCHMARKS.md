# CAPTEX validation

`npm run benchmark` loads the official NOAA CAPTEX Release 2 measurements, calibrates the simple puff proxy on the first 70% of rows, and reports correlation, RMSE, and bias on the chronological 30% holdout. Metrics use `log1p` concentration because tracer observations span several orders of magnitude.

This validates only a coarse source-to-receptor transport pattern. CAPTEX used a non-biological tracer, so it cannot validate spores, infection, crop loss, or interventions.
