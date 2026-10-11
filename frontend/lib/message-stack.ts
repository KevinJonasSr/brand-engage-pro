/**
 * Timing for the homepage message-stack hero (Art Direction item 4). Each
 * text lands one after another, then its Delivered tick fades in. Values
 * follow the Front Porch Supper motion rules: 560ms ease-out-quart, no
 * overshoot, and a stagger that never drops below 120ms.
 */

export const MESSAGE_LAND_MS = 560;
export const MESSAGE_START_MS = 300;
export const MESSAGE_GAP_MS = 700;
export const TICK_AFTER_LAND_MS = 160;
export const MIN_STAGGER_MS = 120;

export type MessageTiming = { messageDelayMs: number; tickDelayMs: number };

export function messageTimeline(count: number, gapMs: number = MESSAGE_GAP_MS): MessageTiming[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const gap = Number.isFinite(gapMs) ? Math.max(gapMs, MIN_STAGGER_MS) : MESSAGE_GAP_MS;
  return Array.from({ length: Math.floor(count) }, (_, i) => {
    const messageDelayMs = MESSAGE_START_MS + i * gap;
    return {
      messageDelayMs,
      tickDelayMs: messageDelayMs + MESSAGE_LAND_MS + TICK_AFTER_LAND_MS,
    };
  });
}
