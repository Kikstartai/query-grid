export type ProblemParams = Record<string, string | number>;

export interface Problem {
  code: string;
  params: ProblemParams;
}

export function formatProblem(code: string, params: ProblemParams): string {
  return [
    code,
    ...Object.entries(params).map(([name, value]) => `${name}=${value}`),
  ].join(" ");
}

export class SourceError extends Error implements Problem {
  readonly code: string;
  readonly params: ProblemParams;

  constructor(code: string, params: ProblemParams = {}) {
    super(formatProblem(code, params));
    this.code = code;
    this.params = params;
  }
}

export function toProblem(error: unknown): Problem {
  if (error instanceof SourceError) {
    return { code: error.code, params: error.params };
  }
  return { code: "request_failed", params: {} };
}
