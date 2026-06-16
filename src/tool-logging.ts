import { logError, logToolCall } from "./debug-logger.js";

export function withToolLogging<TArgs extends unknown[], TResult>(
  toolName: string,
  execute: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      const result = await execute(...args);
      logToolCall(toolName, args, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message, null, {
        tool: toolName,
        arguments: args,
        exception_class: error instanceof Error ? error.name : "Error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };
}
