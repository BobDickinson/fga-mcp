export class ConfigurationResult {
  constructor(
    private readonly successful: boolean,
    private readonly errors: string[],
    private readonly appliedKeys: string[],
    private readonly appliedValues: Record<string, string>,
  ) {}

  getAppliedKeys(): string[] {
    return this.appliedKeys;
  }

  getAppliedValues(): Record<string, string> {
    return this.appliedValues;
  }

  getErrorMessage(): string {
    return this.errors.join("; ");
  }

  getErrors(): string[] {
    return this.errors;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  isSuccessful(): boolean {
    return this.successful;
  }
}
