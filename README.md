# LLM Structured Output Benchmark (OpenRouter)

This repository contains a script to benchmark and compare Large Language Models (LLMs) on their ability to extract and return structured data (JSON) from unstructured text.

The project uses **@instructor-ai/instructor** together with **Zod** to ensure reliable, typed output, and **OpenRouter.ai** to access a wide range of models from multiple providers.

- Files to know:
  - Entry point: [main.ts](main.ts)
  - Test cases: [testCases.ts](testCases.ts)
  - Environment example: [example.env](example.env)

## 🚀 Key Features

- Model Comparison: Quickly test and compare many models (OpenAI, Google, Anthropic, Mistral, Groq, etc.) through a single API (OpenRouter).
- Robust Parsing: Valid JSON output enforced by Instructor + Zod. If a model returns invalid data, Instructor attempts to fix it automatically.
- Comprehensive Test Suite: Includes diverse cases: simple, incomplete data, typos, indirect statements, and multilingual content.
- Performance and Cost Analysis: Measures execution time, token usage (if available), and calculates approximate cost from predefined pricing.
- Flexible Configuration: Add models/providers/test cases easily and tweak request parameters.
- Resilient and Fault-Tolerant: Built-in timeout and retry mechanism to handle slow or unstable API responses.

## ⚙️ How It Works

1. Configuration: The model list, providers, and pricing are defined in [main.ts](main.ts).
2. Data Schema: A Zod schema in [main.ts](main.ts) describes the expected JSON structure.
3. Test Suite: The array of test cases lives in [testCases.ts](testCases.ts). Each case includes:
   - description: What the case is about
   - content: The input unstructured text
   - validator: A function that checks semantic correctness
4. Execution: For each configured model, the script runs the entire test suite.
5. LLM Invocation: Each test sends the text in the user message and passes the Zod schema to the response. Instructor injects a system prompt so the model follows the schema.
6. Validation & Metrics:
   - The model response is validated against the Zod schema.
   - The custom validator checks semantic correctness.
   - Stats are collected: execution time, tokens, and the result (success, validation error, or failure).
7. Reporting: After all models complete, a summary table is printed to the console for easy comparison.

## 🛠️ Tech Stack

- TypeScript
- Node.js
- OpenAI SDK (used as the OpenRouter client surface)
- @instructor-ai/instructor
- Zod
- OpenRouter.ai
- p-limit
- dotenv

## 📦 Setup

1) Clone the repository
```bash
git clone https://github.com/x0rium/llm-structured-output-benchmark.git
cd llm-structured-output-benchmark
```

2) Install dependencies (PNPM recommended, lockfile is present)
```bash
pnpm install
# or
npm install
# or
yarn install
```

3) Configure environment variables

Create a `.env` file in the project root. See [example.env](example.env) for reference:
```env
OPENROUTER_KEY=sk-or-...
BASE_URI=https://openrouter.ai/api/v1
```

- Get your OpenRouter key at: https://openrouter.ai
- BASE_URI defaults to the official OpenRouter API.

## ▶️ Running

Using package scripts:
```bash
pnpm start
# or
npm run start
# or
yarn start
```

Directly with tsx:
```bash
npx tsx main.ts
```

You will see per-model progress lines and, at the end, a final summary table.

## 🔧 Configuration

- Add or edit models/providers/prices:
  - Open [main.ts](main.ts) and extend the `modelProviderCombinations` list with your entries.
- Modify the target JSON schema:
  - Update the Zod schema in [main.ts](main.ts) to fit your data shape.
- Add new test cases:
  - Open [testCases.ts](testCases.ts) and append a new object to the `testCases` array with `description`, `content`, and an optional `validator`.

## 🧪 Example Output

```

🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆
🏆            FINAL BENCHMARK REPORT    🏆
🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆
┌─────────┬───────────────────────────────────────────┬────────────────────────┬─────────────┬────────────────┬───────────────────┬────────────┐
│ (index) │                   Model                   │        Provider        │ Success (%) │ Avg Time (sec) │ Results (✅/⚠️/❌) │  Cost ($)  │
├─────────┼───────────────────────────────────────────┼────────────────────────┼─────────────┼────────────────┼───────────────────┼────────────┤
│    0    │       'openrouter/z-ai/glm-4.5-air'       │       'GMICloud'       │   '75.0%'   │     '2.97'     │     '15/5/0'      │ '0.003447' │
│    1    │      'openrouter/openai/gpt-5-nano'       │       'Default'        │  '100.0%'   │     '9.25'     │     '20/0/0'      │ '0.008692' │
│    2    │      'openrouter/openai/gpt-5-mini'       │       'Default'        │   '95.0%'   │     '6.56'     │     '19/1/0'      │ '0.002268' │
│    3    │      'openrouter/openai/gpt-oss-20b'      │         'groq'         │   '95.0%'   │     '1.41'     │     '19/1/0'      │ '0.003606' │
│    4    │     'openrouter/openai/gpt-oss-120b'      │         'groq'         │   '85.0%'   │     '1.81'     │     '17/3/0'      │ '0.006469' │
│    5    │ 'openrouter/google/gemini-2.5-flash-lite' │    'google-vertex'     │   '75.0%'   │     '3.71'     │     '15/5/0'      │ '0.001439' │
│    6    │   'openrouter/google/gemini-2.5-flash'    │ 'google-vertex/global' │   '95.0%'   │     '3.06'     │     '19/1/0'      │ '0.006410' │
│    7    │       'openrouter/x-ai/grok-3-mini'       │         'xai'          │   '65.0%'   │     '8.26'     │     '13/7/0'      │ '0.009828' │
│    8    │  'openrouter/deepseek/deepseek-r1-0528'   │      'targon/fp8'      │   '90.0%'   │     '3.28'     │     '18/2/0'      │ '0.008347' │
│    9    │     'openrouter/qwen/qwen3-235b-a22b'     │    'deepinfra/fp8'     │   '90.0%'   │     '2.99'     │     '18/2/0'      │ '0.006320' │
│   10    │         'openrouter/qwen/qwq-32b'         │      'deepinfra'       │   '90.0%'   │     '2.86'     │     '18/2/0'      │ '0.000828' │
└─────────┴───────────────────────────────────────────┴────────────────────────┴─────────────┴────────────────┴───────────────────┴────────────┘
```

Note: exact numbers will vary depending on your environment and the selected models/providers.

## 📚 Notes

- The test cases in [testCases.ts](testCases.ts) currently include Russian-language inputs. The extraction prompt in [main.ts](main.ts) is in English, which is fine—the models can still parse non-English content and produce schema-conformant JSON.
- Token usage and pricing are approximations. If the API reports token usage, it is used, otherwise the costs may be zero.

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## 🇷🇺 Russian README

A Russian version is available: [README_RU.md](README_RU.md).