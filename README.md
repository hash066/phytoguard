# PHYTOGUARD

PHYTOGUARD is an airborne exposure workbench for source-to-receptor transport scenarios. It combines timestamped ERA5 reanalysis weather with a transparent Gaussian-puff approximation and separates measured-tracer validation from agricultural interpretation.

The browser and AWS worker run the same deterministic source-to-receptor calculation. Every downloadable result carries inputs, units, model version, provenance, and validation status. The NOAA CAPTEX chronological holdout currently shows **no predictive skill**; the model is therefore an exploratory scenario comparison, not an operational forecast.

It does not predict crop infection, recommend pesticides, estimate yield loss, or claim biological validation.

```sh
npm install
npm test
npm run benchmark
npm run dev
```

See `docs/BENCHMARKS.md` for the reproducible measured-tracer check and `docs/DEPLOYMENT.md` for the private-S3/CloudFront and authenticated job architecture.
