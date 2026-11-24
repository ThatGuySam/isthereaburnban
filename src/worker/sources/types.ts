import type { CountyStatus, Coverage, FireWeatherReport, SourceHealth } from "../../shared/types";
import type { Validators } from "./lib/http";

export type Cadence =
  | { kind: "hourly" }
  | { kind: "daily"; zone: string; hours: readonly [number, ...number[]] };

type Metadata = {
  id: string;
  state: string;
  scope: NonNullable<CountyStatus["scope"]>;
  stack: string;
  officialUrl: string;
  sourceUrl: string;
  sourceName: string;
  keepRowLinks?: boolean;
  product?: SourceHealth["product"];
  /** Recurring statutory/calendar rule (e.g. daily burning hours). Its scheduled on/off flips never alert and never count as a status change. */
  recurring?: boolean;
};

export type SourceResult =
  | { rows: CountyStatus[]; validators?: Validators }
  | { fireWeather: FireWeatherReport[]; validators?: Validators }
  | { notModified: true; validators: Validators };

export type ActiveSource = Metadata & {
  mode: Exclude<SourceHealth["mode"], "manual">;
  coverage: Exclude<Coverage, "directory">;
  cadence: Cadence;
  /** Default 48 hours. Use a shorter window and row validity for daily permit decisions. */
  staleMs?: number;
  fetch(context: { now: Date; validators?: Validators }): Promise<SourceResult>;
};

export type ManualSource = Metadata & {
  mode: "manual";
  cadence: null;
  error: string;
};

export type Source = ActiveSource | ManualSource;
export const isActive = (source: Source): source is ActiveSource => source.mode !== "manual";
