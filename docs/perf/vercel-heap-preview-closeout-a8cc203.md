# Vercel Heap Preview Closeout — a8cc203

## Verdict

**KEEP 8192**

## Scope

| Item | Value |
|---|---|
| Baseline commit | `a8cc203` |
| Experiment branch | `chore/vercel-heap-preview` |
| Method | `package.json` `scripts.build` heap only (Preview env injection blocked by `cross-env` overwrite) |
| Machine | iad1 · 4 cores · 8 GB |
| Cache | HIT (all measured runs) |
| Production / main | **unchanged** |

## Measured deployments (Preview, 2 runs each)

| Heap | Run | Commit | Deployment | Compile | TypeScript | Total Ready |
|---:|---:|---|---|---:|---:|---:|
| 8192 | 1 | a8cc203 | `dpl_jHh2m1QxF29Uan8kmywXT237PJjg` | 80s | 99.1s | 215.9s |
| 8192 | 2 | a8cc203 | `dpl_5rUuGx1Fmc13pssWhVAGVFQEkJn1` | 101s | 130.0s | 276.3s |
| 6144 | 1 | 87c6468 | `dpl_7ZojDSoQUWdvkPAWpQjv9Y6QYy3d` | 97s | 122.9s | 262.6s |
| 6144 | 2 | 87c6468 | `dpl_EhPiSdtPmb6yvyNtKmeBwztZGA5b` | 92s | 115.3s | 250.8s |
| 4096 | 1 | e16f9db | `dpl_CPXmfADZxw7ikeD6EsMpffvDLBQ2` | 117s | 155.3s | 322.0s |
| 4096 | 2 | e16f9db | `dpl_GC8RxCmzn7z58HLMLhfaVX8g971k` | 99s | 126.8s | 269.6s |

## Averages (Cache HIT)

| Heap | Avg Compile | Avg Total Ready |
|---:|---:|---:|
| 8192 | 90.5s | 246.1s |
| 6144 | 94.5s | 256.7s |
| 4096 | 108.0s | 295.8s |

## Decisions

| Candidate | Decision | Reason |
|---|---|---|
| Heap 8192 | **KEEP** | Baseline; lowest avg compile/total among measured heaps |
| Heap 6144 | **Rejected** | No improvement (slower avg compile/total) |
| Heap 4096 | **Rejected** | Clear regression |
| `typescript.ignoreBuildErrors` | **BLOCKED** | No required CI gate that blocks Production before deploy (CI runs in parallel; Ready precedes CI completion) |
| `prepare` VERCEL skip | **KEEP** | Negligible install time; not a performance lever |
| stickers `prebuild` | **KEEP** | ~0.2s; asset contract retained |

## Closeout actions

- Experiment branch HEAD restored: `scripts.build` heap **4096 → 8192**
- Measurement commits retained on branch (`87c6468` 6144, `e16f9db` 4096)
- No Production deploy, no main merge, no further optimization approved

## Note

Branch push alone did not auto-create Preview deployments during this experiment; Preview deployments were created via Vercel API from the experiment branch ref.
