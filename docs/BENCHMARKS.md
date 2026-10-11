# CAPTEX validation

`npm run benchmark` loads the vendored official NOAA CAPTEX Release 2 measurement file, calibrates a Gaussian footprint proxy on the first 70% of ordered observations, and reports correlation, RMSE, bias, and skill against a zero-concentration baseline on the remaining 30%. Metrics use `log1p` concentration because tracer observations span several orders of magnitude. The script writes the exact parameters, counts, runtime, applicability status, and source URL to `benchmarks/report.json`.

The current result improves RMSE over the zero baseline but has negative correlation, so it fails the combined skill gate. It is an honest failed applicability check: the proxy is not an operational forecast. CAPTEX also used a non-biological tracer, so it cannot validate spores, infection, crop loss, or interventions. The product exposes that failure in the main interface rather than presenting the dataset as a validation badge.
