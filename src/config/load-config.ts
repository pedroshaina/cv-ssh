import { configSchema, type Config } from './config.schema.js';

/** Thrown when the environment holds invalid settings; one `NAME: problem` line each. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Reads and validates every setting once, at startup, so bad values stop the process early. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(problems.join('\n'));
  }
  return result.data;
}
