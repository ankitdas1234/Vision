/**
 * Bounds that keep REPEAT/SET from turning Vision Script into something
 * that can't be fully reasoned about before running on a physical robot.
 * Every stage that needs one of these imports it from here rather than
 * re-declaring its own copy, so tightening a limit is a one-line change
 * that actually takes effect everywhere it matters.
 */

/** A single REPEAT's count, whether literal or resolved from a variable. */
export const MAX_REPEAT_COUNT = 100;

/** How deeply REPEAT blocks may nest — enforced by the parser as soon as
 * it opens a new block, so a runaway-nesting script fails fast instead of
 * being fully parsed first. */
export const MAX_NESTING_DEPTH = 5;

/** Hard cap on the number of instructions a compiled script may expand to
 * after every loop is unrolled — enforced by the IR generator, which is
 * the stage that actually knows the real expanded count. A script that
 * would exceed this is rejected with a compile error rather than
 * producing an enormous IR program silently. */
export const MAX_TOTAL_INSTRUCTIONS = 500;
