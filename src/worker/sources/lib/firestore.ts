import { z } from "zod";

const document = z.object({
  name: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
  updateTime: z.iso.datetime(),
});
const queryResults = z.array(z.strictObject({
  document: document.optional(),
  readTime: z.iso.datetime(),
  done: z.boolean().optional(),
})).min(1);

export function firestoreDocument<Fields>(payload: unknown, path: string, fields: z.ZodType<Fields>) {
  const row = document.parse(payload);
  if (row.name !== path) throw new Error("Unexpected Firestore document path");
  return { name: row.name, fields: fields.parse(row.fields), updateTime: row.updateTime };
}

/** Read a projected public collection query on a half-open timestamp range. */
export function firestoreTimestampQuery(options: {
  collection: string; field: string; fields: readonly string[]; from: string; until: string; limit: number;
}) {
  const field = { fieldPath: options.field };
  return {
    structuredQuery: {
      select: { fields: options.fields.map((fieldPath) => ({ fieldPath })) },
      from: [{ collectionId: options.collection }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: options.from } } },
            { fieldFilter: { field, op: "LESS_THAN", value: { timestampValue: options.until } } },
          ],
        },
      },
      limit: options.limit,
    },
  };
}

export function firestoreQuery<Fields>(payload: unknown, collection: string, fields: z.ZodType<Fields>, limit: number) {
  const items = queryResults.parse(payload);
  if (items.length >= limit) throw new Error("Firestore query reached its result limit");
  if (items.length === 1 && !items[0].document) return [];

  const names = new Set<string>();
  return items.map(({ document: row, readTime }) => {
    const id = row?.name.slice(collection.length + 1);
    if (!row || !row.name.startsWith(collection + "/") || !id || id.includes("/") ||
        names.has(row.name) || Date.parse(row.updateTime) > Date.parse(readTime)) {
      throw new Error("Unexpected or duplicate Firestore document in collection");
    }
    names.add(row.name);
    return { name: row.name, fields: fields.parse(row.fields), updateTime: row.updateTime };
  });
}
