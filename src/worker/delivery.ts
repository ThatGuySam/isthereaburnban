export type DeliveryOutcome =
  | { result: "accepted"; providerId?: string }
  | { result: "error" | "gone"; error: string };
