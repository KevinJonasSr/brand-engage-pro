/**
 * Public surface of the onboarding-chat module (BEP).
 */

export {
  nextAssistantMessage,
  ONBOARDING_MODEL,
  type ChatMessage,
  type NextTurnResult,
} from "./conversation";

export { extractFields, type ExtractedFields } from "./extract";
