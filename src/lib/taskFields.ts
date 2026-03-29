import { Prisma } from "@prisma/client";

const TASK_MODEL = Prisma.dmmf.datamodel.models.find((model) => model.name === "Task");
const TASK_FIELD_NAMES = new Set(TASK_MODEL?.fields.map((field) => field.name) ?? []);

const PLANNING_FIELDS = ["estimatedMinutes", "executionStartAt"] as const;
let missingFieldsWarned = false;

function warnMissingPlanningFields() {
  if (missingFieldsWarned) return;

  const missing = PLANNING_FIELDS.filter((field) => !TASK_FIELD_NAMES.has(field));
  if (missing.length === 0) return;

  missingFieldsWarned = true;
  console.warn(
    `[prisma] Task planning fields unavailable in generated client (${missing.join(", ")}). ` +
      "Run `npm run db:generate` and restart the dev server."
  );
}

export function hasTaskField(fieldName: string): boolean {
  const available = TASK_FIELD_NAMES.has(fieldName);
  if (!available) {
    warnMissingPlanningFields();
  }
  return available;
}
