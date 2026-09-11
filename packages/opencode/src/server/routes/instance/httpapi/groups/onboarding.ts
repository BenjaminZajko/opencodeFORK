import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/onboarding"

const OnboardingErrorName = Schema.Union([Schema.Literal("BadRequest"), Schema.Literal("OnboardingOllamaMissing")])
export class OnboardingApiError extends Schema.ErrorClass<OnboardingApiError>("OnboardingError")({
  name: OnboardingErrorName,
  data: Schema.Struct({
    message: Schema.optional(Schema.String),
  }),
}) {}

// Wire shapes mirror the onboarding domain types
// (src/onboarding/reasoning.ts, src/onboarding/ollama.ts) without
// importing them: domain stays free of HttpApi types.
const RankedPick = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["local", "cloud"]),
  score: Schema.Number,
  fit: Schema.String,
  reasons: Schema.Array(Schema.String),
  needGb: Schema.optional(Schema.Number),
})

export const OnboardingApi = HttpApi.make("onboarding")
  .add(
    HttpApiGroup.make("onboarding")
      .add(
        HttpApiEndpoint.get("recommendation", `${root}/recommendation`, {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Struct({
              profile: Schema.Struct({
                os: Schema.optional(Schema.String),
                cpu: Schema.optional(Schema.String),
                ramGb: Schema.optional(Schema.Number),
                gpu: Schema.optional(Schema.String),
                poolGb: Schema.Number,
              }),
              primaryLocal: Schema.UndefinedOr(RankedPick),
              primaryCloud: Schema.UndefinedOr(RankedPick),
              primary: Schema.NullOr(Schema.Literals(["local", "cloud"])),
              alternates: Schema.Array(RankedPick),
              explanation: Schema.String,
            }),
            "Hardware-aware model recommendation",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "onboarding.recommendation",
            summary: "Get onboarding recommendation",
            description: "Detect host hardware and recommend a local Ollama model and a free cloud fallback.",
          }),
        ),
        HttpApiEndpoint.get("ollama", `${root}/ollama`, {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Struct({
              installed: Schema.Boolean,
              models: Schema.Array(Schema.String),
            }),
            "Ollama presence and pulled models",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "onboarding.ollama",
            summary: "Check Ollama status",
            description: "Check whether Ollama is installed and which models are pulled.",
          }),
        ),
        HttpApiEndpoint.post("pull", `${root}/pull`, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ model: Schema.String }),
          success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
          error: OnboardingApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "onboarding.pull",
            summary: "Pull an Ollama model",
            description: "Stream `ollama pull` progress as server-sent events.",
          }),
        ),
        HttpApiEndpoint.post("default", `${root}/default`, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({
            connected: Schema.Array(Schema.String),
            preferredTier: Schema.optional(Schema.String),
          }),
          success: described(
            Schema.UndefinedOr(
              Schema.Struct({ providerID: Schema.String, modelID: Schema.String }),
            ),
            "Ranked default model for connected providers",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "onboarding.default",
            summary: "Resolve ranked default model",
            description: "Pick the best fallback-catalog model for the connected providers, no browsing required.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "onboarding",
          description: "Experimental HttpApi first-run onboarding routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
