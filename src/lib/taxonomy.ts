import { cache } from "react";
import { prisma } from "@/lib/db";

export const getConditions = cache(() =>
  prisma.condition.findMany({ orderBy: { sortOrder: "asc" } }),
);

export const getSizes = cache(() =>
  prisma.size.findMany({ orderBy: { sortOrder: "asc" } }),
);

/** Categories with their parent, ordered for a grouped select. */
export const getCategories = cache(() =>
  prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    include: { parent: { select: { name: true } } },
  }),
);
