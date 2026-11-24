export type DeliveryOutcome =
  | { result: "accepted"; providerId?: string }
  | { result: "gone"; error: string }
  | { result: "error"; error: string; retry?: boolean };
