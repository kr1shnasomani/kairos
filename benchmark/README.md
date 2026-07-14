# benchmark/

Self-contained evaluation harness + evidence for KAIROS (Problem Statement → "Evaluation Focus").

| File | What |
|------|------|
| `BENCHMARKS.md` | The scorecard — reproducible numbers + methodology + honest caveats |
| `questions.json` | 12 domain-expert Q&A, grounded in `dataset/00_Reference/00_KAIROS_CANON.md` |
| `run_benchmark.py` | Retrieval precision · KG-linkage · answer quality · time-to-answer |
| `verify_layers.py` | Per-layer smoke + latency (PASS/FAIL table) |

This folder is mounted into the API container at `/app/benchmark` (the scripts import the
running app, so they execute inside it).

**Reproduce:**
```bash
make verify                          # per-layer smoke + latency
make verify ARGS=--full              # + P&ID-VLM + synthesize checks (hit NIM)
make benchmark                       # retrieval + KG-linkage + time-to-answer
make benchmark ARGS=--synthesize     # + answer quality (LLM; slower)
# entity-extraction F1 (Layer-0 model gate — pre-existing script):
docker exec kairos-backend-api python scripts/run_model_validation.py --model-name <model>
```
