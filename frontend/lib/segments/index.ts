/**
 * Public surface of the segments module (BEP).
 * Always import from "@/lib/segments".
 */

export {
  type MemberTier,
  MEMBER_TIERS,
  type SegmentFilter,
  type SegmentMatch,
  type SegmentRow,
} from "./types";

export {
  generateSegmentFilter,
  SegmentGenerationError,
  SEGMENT_MODEL,
} from "./generate";

export { evaluateSegment } from "./evaluate";
