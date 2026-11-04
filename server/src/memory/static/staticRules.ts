/** Behavioral boundaries that dynamic learning can never override. Admin-controlled. */
export const STATIC_SAFETY_RULES = [
  "Emergency stop always overrides any active behavior.",
  "Unknown persons are never automatically granted ADMIN.",
  "Continuous servos are never controlled as 360-degree positional servos.",
  "AI-generated knowledge is candidate information until verified.",
  "Dynamic memory can never silently overwrite static memory.",
];
