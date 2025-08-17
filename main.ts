import 'dotenv/config';
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";
import { testCases } from "./testCases";
import pLimit from "p-limit";

// Type definitions
type ModelCombination = {
    model: string;
    provider: string | null;
    pricing: {
        input: number;  // USD per 1M input tokens
        output: number; // USD per 1M output tokens
    };
};

// 1) Configuration

const modelProviderCombinations: ModelCombination[] = [
    { model: "openrouter/z-ai/glm-4.5-air", provider: "GMICloud", pricing: { input: 0.20, output: 1.10 } },
    { model: "openrouter/openai/gpt-5-nano", provider: null, pricing: { input: 0.05, output: 0.40 } },
    { model: "openrouter/openai/gpt-5-mini", provider: null, pricing: { input: 0.25, output: 0.025 } },
    { model: "openrouter/openai/gpt-oss-20b", provider: "groq", pricing: { input: 0.1, output: 0.5 } },
    { model: "openrouter/openai/gpt-oss-120b", provider: "groq", pricing: { input: 0.15, output: 0.75 } },
    { model: "openrouter/google/gemini-2.5-flash-lite", provider: "google-vertex", pricing: { input: 0.10, output: 0.40 } },
    {
        model: "openrouter/google/gemini-2.5-flash",
        provider: "google-vertex/global",
        pricing: { input: 0.30, output: 2.50 }
    },
    { model: "openrouter/x-ai/grok-3-mini", provider: "xai", pricing: { input: 0.30, output: 0.50 } },
    { model: "openrouter/deepseek/deepseek-r1-0528", provider: "targon/fp8", pricing: { input: 0.70, output: 2.50 } },
    { model: "openrouter/qwen/qwen3-235b-a22b", provider: "deepinfra/fp8", pricing: { input: 0.30, output: 3.00 } },
    { model: "openrouter/qwen/qwq-32b", provider: "deepinfra", pricing: { input: 0.075, output: 0.15 } },
    // { model: "qwen3:8b", provider: null, pricing: { input: 0.075, output: 0.15 } },
];

const parallelLimit = 1;

const oai = new OpenAI({
    baseURL: process.env.BASE_URI,
    apiKey: process.env.OPENROUTER_KEY,
    defaultHeaders: { "HTTP-Referer": "catalysto.ru", "X-Title": "Benchmark structured out" },
});
const client = Instructor({ client: oai, mode: "JSON" });

// 2) Data schema (Zod)
const UserProfileSchema = z.object({
    name: z.string().nullable().optional().describe("Full user name."),
    age: z.number().int().positive().nullable().optional().describe("User age. Can be null if not specified."),
    email: z.string().email().nullable().optional().describe("Email address. Can be null if not specified."),
    role: z.enum(["admin", "user", "guest"]).nullable().optional().describe("User role in the system."),
    hobbies: z.array(z.string()).nullable().optional().describe("List of hobbies/interests."),
    address: z.object({
        city: z.string().nullable().optional().describe("City."),
        street: z.string().nullable().optional().describe("Street and house number."),
        zipCode: z.string().nullable().optional().describe("Postal code. Can be null if not specified.")
    }).nullable().optional().describe("Full address. Can be null if not specified.")
}).describe("Complete user profile with all necessary information.");

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Infrastructure: timeout with retries
class TimeoutError extends Error {
    constructor(message = 'Operation timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}

async function withTimeoutAndRetries<T>(
    asyncFn: () => Promise<T>,
    options: { timeout: number; retries: number }
): Promise<T> {
    let attempts = 0;
    while (attempts <= options.retries) {
        attempts++;
        try {
            const result = await Promise.race([
                asyncFn(),
                new Promise<T>((_, reject) =>
                    setTimeout(() => reject(new TimeoutError(`Operation timed out after ${options.timeout}ms`)), options.timeout)
                ),
            ]);
            return result;
        } catch (error) {
            if (error instanceof TimeoutError && attempts <= options.retries) {
                console.warn(`[TIMEOUT] Attempt ${attempts - 1} failed. Retrying...`);
                continue;
            }
            throw error; // Rethrow if not a timeout or retries exhausted
        }
    }
    // Unreachable, but satisfies TypeScript
    throw new Error('Exceeded max retries.');
}

// 3) Run a test suite for a single model/provider
async function runTestSuiteForCombination(combination: ModelCombination) {
    const { model, provider, pricing } = combination;

    console.log("\n" + "=".repeat(50));
    console.log(`🚀 RUNNING TEST SUITE`);
    console.log(`   Model: ${model}`);
    console.log(`   Provider: ${provider ?? 'Default'}`);
    console.log("=".repeat(50));

    const suiteStartTime = Date.now();
    const limit = pLimit(parallelLimit);

    const testPromises = testCases.map((test) => {
        return limit(async () => {
            const testStartTime = Date.now();
            const params: any = {
                messages: [{
                    role: "user",
                    content: `Extract user information from the following text and return it as JSON that matches the provided schema.\n\nText: "${test.content}"`
                }],
                model: model,
                temperature: 0,
                response_format: { type: "json_object", strict: true },
                response_model: { schema: UserProfileSchema, name: "UserProfile" },
                max_retries: 3,
            };
            if (provider) {
                params.provider = { order: [provider], allow_fallbacks: false };
            }

            try {
                const response = await withTimeoutAndRetries(() => client.chat.completions.create(params), {
                    timeout: 30000, retries: 2,
                });

                // Diagnostic dump example:
                // if (model.includes('gemini-2.5-flash')) {
                //     console.log(`[DIAGNOSTICS FOR ${model}] Raw API response:`);
                //     console.log(JSON.stringify(response, null, 2));
                // }

                const userProfile = response as UserProfile;
                const usage = (response as any)._meta?.usage;

                const duration = Date.now() - testStartTime;
                const isContentCorrect = !test.validator || test.validator(userProfile);

                if (isContentCorrect) {
                    console.log(`[${model}] ✅ Success (${(duration / 1000).toFixed(2)}s): ${test.description}`);
                    return { status: 'success', description: test.description, duration, usage };
                } else {
                    console.warn(`[${model}] ⚠️ Data error (${(duration / 1000).toFixed(2)}s): ${test.description}`);
                    console.log('   Received:', userProfile);
                    return { status: 'validation_error', description: test.description, duration, usage };
                }

            } catch (error) {
                const duration = Date.now() - testStartTime;
                console.error(`[${model}] ❌ Failed (${(duration / 1000).toFixed(2)}s): ${test.description}. Reason: ${error instanceof Error ? error.name : 'Unknown error'}`);
                return { status: 'failure', description: test.description, duration, usage: null };
            }
        });
    });

    const results = await Promise.all(testPromises);
    const suiteDuration = (Date.now() - suiteStartTime) / 1000;

    // Summaries
    const successCount = results.filter(r => r.status === 'success').length;
    const validationErrorCount = results.filter(r => r.status === 'validation_error').length;
    const failureCount = results.filter(r => r.status === 'failure').length;

    const successfulTests = results.filter(r => r.status === 'success');
    const totalRequestTime = successfulTests.reduce((acc, r) => acc + r.duration, 0);
    const averageTime = successCount > 0 ? (totalRequestTime / successCount) / 1000 : 0;

    const trueSuccessRate = testCases.length > 0 ? (successCount / testCases.length) * 100 : 0;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    results.forEach(r => {
        if (r.usage) {
            totalInputTokens += r.usage.prompt_tokens ?? 0;
            totalOutputTokens += r.usage.completion_tokens ?? 0;
        }
    });

    let totalCost = 0;
    if (pricing) {
        const inputCost = (totalInputTokens / 1_000_000) * pricing.input;
        const outputCost = (totalOutputTokens / 1_000_000) * pricing.output;
        totalCost = inputCost + outputCost;
    }

    console.log("\n" + "-".repeat(50));
    console.log(`📊 Summary for ${model} @ ${provider ?? 'Default'} 📊`);
    console.log(`   Total suite time: ${suiteDuration.toFixed(2)} sec.`);
    console.log(`   Avg time per successful request: ${averageTime.toFixed(2)} sec.`);
    console.log(`   Totals: ✅ ${successCount} (success) | ⚠️ ${validationErrorCount} (data error) | ❌ ${failureCount} (failure)`);
    console.log(`   📈 True success rate: ${trueSuccessRate.toFixed(1)}%`);
    console.log(`   Tokens (in/out): ${totalInputTokens}/${totalOutputTokens}`);
    console.log(`   💰 Approx. cost: $${totalCost.toFixed(6)}`);
    console.log("-".repeat(50));

    return {
        model,
        provider: provider ?? 'Default',
        trueSuccessRate: `${trueSuccessRate.toFixed(1)}%`,
        successful: successCount,
        validationErrors: validationErrorCount,
        failures: failureCount,
        avgTimeSec: averageTime.toFixed(2),
        totalTimeSec: suiteDuration.toFixed(2),
        costUSD: totalCost.toFixed(6),
    };
}

// 4) Orchestrator
async function runAllTests() {
    console.log("🔥 Starting benchmark across all model/provider combinations...");
    const allSuiteResults: any[] = [];

    for (const combination of modelProviderCombinations) {
        const result = await runTestSuiteForCombination(combination);
        allSuiteResults.push(result);
    }

    console.log("\n✅ All test suites finished. Benchmark complete.");
    console.log("\n" + "🏆".repeat(25));
    console.log("🏆            FINAL BENCHMARK REPORT            🏆");
    console.log("🏆".repeat(25));

    const formattedResults = allSuiteResults.map(r => ({
        "Model": r.model,
        "Provider": r.provider,
        "Success (%)": r.trueSuccessRate,
        "Avg Time (sec)": r.avgTimeSec,
        "Results (✅/⚠️/❌)": `${r.successful}/${r.validationErrors}/${r.failures}`,
        "Cost ($)": r.costUSD,
    }));

    console.table(formattedResults);
}

// Run
runAllTests();