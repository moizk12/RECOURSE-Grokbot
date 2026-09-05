export interface ValidationError {
  readonly ruleId: string;
  readonly field: string;
  readonly message: string;
}

export function err(ruleId: string, field: string, message: string): ValidationError {
  return { ruleId, field, message };
}
