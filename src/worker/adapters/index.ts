import type { Adapter } from "./common";
import { fl } from "./fl";
import { ia } from "./ia";
import { in_ } from "./in";
import { la } from "./la";
import { ms } from "./ms";
import { ok } from "./ok";
import { tx } from "./tx";

export const ADAPTERS: Adapter[] = [ok, tx, fl, in_, la, ms, ia];
export type { Adapter };
