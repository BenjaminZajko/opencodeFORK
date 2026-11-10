# Free-only model policy

OliveCode exposes ongoing free-plan options and locally hosted models. Unknown providers, paid OpenRouter variants, trial-only providers, and Ollama cloud models are excluded. The restriction applies to the terminal picker, the legacy provider service, the newer model catalog, defaults, and background model calls. Config aliases cannot turn a paid model into a free one.

Supported accounts:

- OpenRouter: only explicit `:free` variants whose catalog input and output prices are both zero. Automatic paid routing is not offered.
- Groq Free: GPT-OSS 120B, GPT-OSS 20B, and Qwen 3.8 27B, intersected with the available provider catalog.
- Mistral Free mode: Codestral and Mistral Small, intersected with the available catalog. Mistral's free tier returned a limit of 2 requests per minute on 2026-11-10, which is too slow for an agent loop, so Mistral is now the last fallback and is not used for Assist helpers. Mistral's consumer terms (effective 2026-10-12) also describe API access as limited to business customers; review before recommending it.
- Z.ai: GLM-4.7-Flash and GLM-4.5-Flash, which Z.ai prices as free. FlashX and GLM-5.x Flash are paid or limited-time and are excluded.
- Ollama: local models; cloud variants are excluded.

How OliveCode stretches free quotas:

- Groq and local Ollama models get a compact system prompt and short tool descriptions (about 10K characters instead of 34K), so a request fits Groq's free 8,000 tokens-per-minute cap and Ollama's default 4K context.
- When OpenRouter reports its daily free limit, every OpenRouter free model is marked unavailable until the reset time, and work continues on another connected provider.
- A request that is too large for one provider moves to another free model instead of failing. Short rate limits switch to another provider immediately; when none is free, OliveCode waits for the soonest one (up to a minute).
- Assist helpers prefer Groq and Z.ai, keeping OpenRouter's daily quota and Mistral's per-minute quota for the model doing the work.
- Web search is available to cloud models through keyless hosted search (Exa or Parallel). Search queries are sent to that service; local Ollama models do not get web search unless it is enabled explicitly.

Use free-tier provider accounts. OliveCode cannot change a provider account's billing plan or guarantee access after its limits are exhausted. Provider quotas and availability can change. A cooldown time is a retry estimate from the provider response, not a promise that quota resets at that instant.

The first coding recommendation is currently Nemotron 3 Ultra (free) through OpenRouter, served by NVIDIA with a 1M-token context. NVIDIA reports 70.7% on SWE-bench Verified and 56.4% on Terminal-Bench 2.1 for this model. Flint and North Mini Code follow. Laguna S 2.1 was removed after its free OpenRouter endpoint disappeared (checked 2026-11-09). Benchmark scores are vendor-reported, use different harnesses, and do not prove one model is best at every task. On 2026-11-09 the same small bug-fix task (fix two Python functions, write and run pytest tests) passed with Nemotron 3 Ultra, Flint, North Mini Code, GPT-OSS 120B and Codestral through OliveCode.

The picker then shows another model from that provider and one recommended model from each other connected provider. The complete free library and retry schedule live one menu level below it. This list follows model-specific coding evidence and explicit data-use tradeoffs; it is not a claim that raw usage popularity equals quality.

Evidence checked 2026-11-09 against the live OpenRouter catalog and provider pricing pages:

- [Groq Free Plan Limits](https://console.groq.com/docs/rate-limits)
- [Mistral Free-mode quickstart](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)
- [Mistral usage limits](https://docs.mistral.ai/admin/billing-usage/usage-limits)
- [OpenRouter public catalog](https://openrouter.ai/api/v1/models)
- [Nemotron 3 Ultra model card and benchmarks](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16)
- [Z.ai pricing (free Flash models)](https://docs.z.ai/guides/overview/pricing)
- [OpenRouter free-model limits](https://openrouter.ai/docs/api/reference/limits)
- [North Mini Code free endpoint and OpenCode compatibility](https://openrouter.ai/cohere/north-mini-code:free)

NVIDIA trial access has been removed. Google AI Studio and ModelScope remain excluded per the project's earlier product decisions. No paid provider connection or upgrade action is offered.

Verification uses local mock servers with fake credentials. It covers the compiled executable and all four native model adapters. It does not verify any real account's current quota or authentication.


## Local catalog and fit — reviewed 2026-09-28

The local advisor uses official Ollama tags, including Qwen 3.5 (2B/4B/9B, Q4 and Q8), Qwen 3.8 27B (Q4/Q8/MLX), Devstral Small 2 24B (Q4/Q8), Qwen3-Coder 30B, Qwen3-Coder-Next (Q4/Q8), and GPT-OSS 20B/120B. This is a curated coding shortlist, not an exhaustive library or a universal benchmark ranking. Catalog updates currently require an app update; the review date appears in the picker.

Installed status comes from the running local Ollama API. Cloud shortcuts are not treated as local downloads. Selection inspects actual model capabilities and saves the provider to global OliveCode settings, so it works across project folders. The configured context is conservatively read from model parameters or OLLAMA_CONTEXT_LENGTH (otherwise 4096); maximum advertised context is not assumed active. For long coding conversations, configure a larger Ollama context and reselect the model, allowing for additional memory use.

Memory estimates combine downloaded weight size plus a 2 GiB short-context runtime allowance. Apple Silicon reserves the greater of 4 GiB or 25% of total memory for the system. This estimates capacity, not available memory at that instant or measured speed. On an Apple M5 with 24 GiB RAM, the 18 GiB budget recommends Qwen 3.5 9B Q4 as a comfortable balance. More demanding variants remain visible with warnings; variants beyond the memory budget cannot be downloaded from the picker. Higher precision is not automatically better for a particular computer.

Delete models lists exact installed tags, including cloud shortcuts. Selecting one immediately calls Ollama's delete API. Files are shared with other Ollama apps; shared blobs may remain while another tag needs them. macOS defaults to ~/.ollama/models; OLLAMA_MODELS can override the server's storage location. OliveCode does not store model weights inside a project folder.

Sources: [Qwen 3.5 variants](https://ollama.com/library/qwen3.5/tags), [Qwen 3.8 variants](https://ollama.com/library/qwen3.8/tags), [Devstral Small 2](https://ollama.com/library/devstral-small-2/tags), [Qwen3-Coder-Next](https://ollama.com/library/qwen3-coder-next/tags), [GPT-OSS](https://ollama.com/library/gpt-oss/tags), [storage and context FAQ](https://docs.ollama.com/faq), [delete API](https://docs.ollama.com/api/delete).
