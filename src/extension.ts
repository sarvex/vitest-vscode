// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { extensionId } from "./config";
import { discoverAllFilesInWorkspace, discoverTestFromDoc } from "./discover";
import { getVitePath as getVitestPath, TestRunner } from "./pure/runner";
import { runTest, TestCase, TestData, testData, TestFile } from "./test_data";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  const ctrl = vscode.tests.createTestController(
    `${extensionId}`,
    "Vitest Test Provider"
  );
  ctrl.refreshHandler = async () => {
    await discoverAllFilesInWorkspace(ctrl);
  };

  ctrl.resolveHandler = async (item) => {
    if (!item) {
      await discoverAllFilesInWorkspace(ctrl);
    } else {
      const data = testData.get(item);
      if (data instanceof TestFile) {
        await data.updateFromDisk(ctrl, item);
      }
    }
  };

  ctrl.createRunProfile(
    "Run Tests",
    vscode.TestRunProfileKind.Run,
    runHandler.bind(null, ctrl),
    true
  );

  for (const document of vscode.workspace.textDocuments) {
    discoverTestFromDoc(ctrl, document);
  }

  context.subscriptions.push(
    ctrl,
    vscode.commands.registerCommand("vitest-explorer.configureTest", () => {
      vscode.window.showInformationMessage("Not implemented");
    }),
    vscode.workspace.onDidOpenTextDocument(
      discoverTestFromDoc.bind(null, ctrl)
    ),
    vscode.workspace.onDidChangeTextDocument((e) =>
      discoverTestFromDoc(ctrl, e.document)
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function runHandler(
  ctrl: vscode.TestController,
  request: vscode.TestRunRequest,
  cancellation: vscode.CancellationToken
) {
  if (vscode.workspace.workspaceFolders === undefined) {
    return;
  }

  const runner = new TestRunner(
    vscode.workspace.workspaceFolders[0].uri.path,
    getVitestPath(vscode.workspace.workspaceFolders[0].uri.path)
  );

  const tests = request.include ?? gatherTestItems(ctrl.items);
  const run = ctrl.createTestRun(request);
  await Promise.all(tests.map((test) => runTest(ctrl, runner, run, test)));
}

function gatherTestItems(collection: vscode.TestItemCollection) {
  const items: vscode.TestItem[] = [];
  collection.forEach((item) => items.push(item));
  return items;
}
