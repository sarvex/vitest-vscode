import { spawn } from "child_process";
import { existsSync, readFile } from "fs-extra";
import { tmpdir } from "os";
import * as path from "path";

import { chunksToLinesAsync } from "@rauschma/stringio";

export function getVitestPath(projectRoot: string): string | undefined {
  const node_modules = path.resolve(projectRoot, "node_modules");
  if (!existsSync(node_modules)) {
    return;
  }

  if (existsSync(path.resolve(node_modules, "vitest", "vitest.mjs"))) {
    return path.resolve(node_modules, "vitest", "vitest.mjs");
  }

  const suffixes = [".js", "", ".cmd"];
  for (const suffix of suffixes) {
    if (existsSync(path.resolve(node_modules, ".bin", "vitest" + suffix))) {
      return path.resolve(node_modules, ".bin", "vitest" + suffix);
    }
  }

  return;
}

export function getDebuggerConfig() {}

let i = 0;
export function getTempPath(): string {
  return path.join(tmpdir(), `vitest-report-${i++}.json`);
}

interface TestResult {
  displayName?: string;
  failureMessage?: string | null;
  skipped: boolean;
  status?: string;
  testFilePath?: string;
  perfStats: {
    end?: number;
    runtime?: number;
    start?: number;
  };
}

interface AggregatedResult {
  numFailedTests: number;
  numFailedTestSuites: number;
  numPassedTests: number;
  numPassedTestSuites: number;
  numPendingTests: number;
  numTodoTests: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numTotalTestSuites: number;
  startTime: number;
  success: boolean;
  testResults: Array<TestResult>;
}

export class TestRunner {
  constructor(
    private workspacePath: string,
    private vitestPath: string | undefined
  ) {}

  async scheduleRun(
    testFile: string[] | undefined,
    testNamePattern: string | undefined,
    log: (msg: string) => void = () => {}
  ): Promise<AggregatedResult> {
    const path = getTempPath();
    const args = [
      ...(testFile ? testFile : []),
      "--reporter=json",
      "--reporter=verbose",
      "--outputFile",
      path,
      "--run",
    ] as string[];
    if (testNamePattern) {
      args.push("-t", testNamePattern);
    }

    const workspacePath = this.workspacePath;
    let child;
    let error: any;
    let outputs: string[] = [];
    const command = ["npx", "vitest", ...args];
    try {
      // it will throw when test failed or the testing is failed to run
      if (this.vitestPath) {
        child = spawn(this.vitestPath, args, {
          cwd: workspacePath,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } else {
        child = spawn("npx", ["vitest"].concat(args), {
          cwd: workspacePath,
          stdio: ["ignore", "pipe", "pipe"],
        });
      }

      for await (const line of chunksToLinesAsync(child.stdout)) {
        log(line + "\r\n");
        outputs.push(line);
      }
    } catch (e) {
      error = e;
    }

    if (!existsSync(path)) {
      handleError();
    }

    const file = await readFile(path, "utf-8");
    const out = JSON.parse(file) as AggregatedResult;
    if (out.testResults.length === 0) {
      handleError();
    }

    return out;

    function handleError() {
      const prefix =
        `When running:\n` +
        `    npx vitest ${args.join(" ")}\n` +
        `cwd: ${workspacePath}`;
      if (error) {
        console.error("scheduleRun error", error.toString());
        console.error(error.stack);
        const e = error;
        error = new Error(prefix + "\n" + error.toString());
        error.stack = e.stack;
      } else {
        error = new Error(prefix + "\nLog:\n" + outputs.join("\n"));
      }

      console.error(outputs.join("\n"));
      throw error;
    }
  }
}
