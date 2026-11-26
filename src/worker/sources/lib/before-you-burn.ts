import { htmlStatusBlocks } from "./html";

/** Read a named Before You Burn zone from its public, server-rendered status card. */
export async function beforeYouBurnArea(input: Response | string, {
  id, name, agency,
}: { id: number; name: string; agency: string }) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid Before You Burn area ID");
  const [area, publisher, status, todayLabel, today, seasonLabel, season, ...extra] = await htmlStatusBlocks(
    input, `article.pfsareas-card#area-${id}`, "h3, small, .pfsareas-tag, dt, dd",
  );
  if (area !== name || publisher !== agency || todayLabel !== "Today" || seasonLabel !== "Burn season" || !season ||
      !status || !today || extra.length) {
    throw new Error(`Incomplete or changed Before You Burn area: ${name}`);
  }
  return { status, today, season };
}
