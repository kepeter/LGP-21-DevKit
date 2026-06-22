import * as path from 'path';
import * as fs from 'fs';
import {
    ExtensionContext,
    workspace,
    window,
    tasks,
    commands,
    env,
    Task,
    ShellExecution,
    TaskScope,
    TaskGroup,
    TaskDefinition,
    Uri
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

export function activate(context: ExtensionContext): void {
    // Register a task provider for LGP-21 build tasks
    tasks.registerTaskProvider('lgp21-build', {
        provideTasks() {
            const editor = window.activeTextEditor;

            // Only provide tasks if the active editor is an LGP-21 file
            if (!editor || editor.document.languageId !== 'lgp21') return [];

            const filePath = editor.document.uri.fsPath;
            const compilerPath = context.asAbsolutePath(path.join('out', 'compiler.js'));

            // Define the task definition and execution for compiling the LGP-21 file
            const buildTaskDefinition: TaskDefinition = { type: 'lgp21-build' };
            const buildExecution = new ShellExecution(`node "${compilerPath}" "${filePath}"`);

            // Create a new task for compiling the LGP-21 file
            const buildTask = new Task(
                buildTaskDefinition,
                TaskScope.Workspace,
                'Compile LGP-21 File',
                'LGP-21 DevKit',
                buildExecution
            );

            // The task is set to run in the workspace scope and is grouped under the build tasks
            // The task is also marked as the default build task for convenience
            buildTask.group = TaskGroup.Build;
            (buildTask.group as any).isDefault = true;

            return [buildTask];
        },
        resolveTask(task: Task): Task | undefined {
            return undefined;
        }
    });

    // Add command to open the embedded LGP-21 programming manual PDF
    const openManualCommand = commands.registerCommand('lgp21.openManual', () => {
        const pdfUri = Uri.file(context.asAbsolutePath('documentation/LGP-21_Programming_Manual_1963-OCR.pdf'));
        env.openExternal(pdfUri);
    });

    // Add command to open example LGP-21 files from the examples directory
    const openExampleCommand = commands.registerCommand('lgp21.openExample', async () => {
        const examplesDir = context.asAbsolutePath('examples');
        const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.lgp21'));

        if (files.length === 0) {
            window.showInformationMessage('No example files found.');
            return;
        }

        const pick = await window.showQuickPick(files, { placeHolder: 'Select an example to open' });
        if (!pick) return;
        const chosen = pick;

        const content = fs.readFileSync(path.join(examplesDir, chosen), 'utf8');
        const doc = await workspace.openTextDocument({ language: 'lgp21', content });
        window.showTextDocument(doc);
    });

    context.subscriptions.push(openManualCommand, openExampleCommand);

    // Define the path to the server module (the language server implementation)
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );

    // Define the server options for running and debugging the language server
    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    // Define the client options for the language client, including the document selector and file synchronization
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'lgp21' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.lgp21'),
        },
    };

    // Create and start the language client, which will manage the communication with the language server
    client = new LanguageClient(
        'lgp21',
        'LGP-21 Language Server',
        serverOptions,
        clientOptions
    );

    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;

    return client.stop();
}

let client: LanguageClient;
