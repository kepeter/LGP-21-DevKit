import {
    type DocumentSymbol,
    type Hover,
    type Location,
    type TextEdit,
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    InitializeParams,
    InitializeResult,
    MarkupKind,
    ProposedFeatures,
    SymbolKind,
    TextDocumentSyncKind,
    TextDocuments,
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {
    instructionDoc,
    directiveDoc,
    escapeDoc,
    switchDoc
} from './descriptions';
import {
    AssemblyError,
    Token,
    Span,
    stripComment,
    tokenize,
    instructionSet,
    valueInstructions,
    labelIdentify,
    labelDefinition,
    collectLabelDefs,
    validateTokens,
} from '../shared/assembler';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection = createConnection(ProposedFeatures.all);

// In case there are multiple documents open, we need to keep track of the state of each document separately
const docStates = new Map<string, DocState>();

// Create a simple text document manager. The text document manager supports full document sync only
const documents = new TextDocuments(TextDocument);

// Holds pending validation timeouts for documents, keyed by their URI
const pendingValidation = new Map<string, ReturnType<typeof setTimeout>>();

// Holds the definitions and references of labels within the document
interface DocState {
    labelDefs: Map<string, Span>;
    labelRefs: Map<string, Span[]>;
}

// Represents a parsed line of assembly code, including its label (if any), keyword, operands, and comment
interface ParsedLine {
    label?: string;
    isStandaloneLabel: boolean;
    keyword?: string;
    operands: string[];
    comment?: string;
    isBlank: boolean;
    isCommentOnly: boolean;
}

// Returns a diagnostic error as a LSP Diagnostic object
function asDiagnostic(e: AssemblyError): Diagnostic {
    return {
        severity: e.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
        range: {
            start: { line: e.line, character: e.start },
            end: { line: e.line, character: e.end },
        },
        message: e.message,
        source: 'lgp21',
    };
}

// Extracts the code and comment from a line, correctly handling '#' characters within string literals
function extractComment(line: string): { code: string; comment: string | undefined } {
    let inString = false;

    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inString = !inString;
        if (!inString && line[i] === '#') return { code: line.slice(0, i), comment: line.slice(i + 1).trim() };
    }

    return { code: line, comment: undefined };
}

// Formats a document by aligning labels, keywords, operands, and comments into neat columns
// Labels are aligned to the left, keywords start at the next tab stop after the longest label
// Operands follow the keyword separated by a single space
// Comments are aligned to the next tab stop after the longest content (label + keyword + operands) on each line
// Blank lines are preserved, and lines that contain only comments are not altered except for trimming leading whitespace
function formatDocument(doc: TextDocument): TextEdit[] {
    const text = doc.getText();
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const parsed = lines.map(parseFormatterLine);
    let maxLabelLen = 0;

    for (const p of parsed)
        if (p.label && !p.isStandaloneLabel) maxLabelLen = Math.max(maxLabelLen, p.label.length);

    const instrCol = nextTabStop(maxLabelLen + 1);
    const contents: string[] = [];

    for (const p of parsed) {
        if (p.isBlank || p.isCommentOnly) { contents.push(''); continue; }
        if (p.isStandaloneLabel) { contents.push(`${p.label}:`); continue; }

        const keyword = p.keyword!;
        const offset = (keyword.startsWith('-') || keyword.startsWith('.')) ? instrCol - 1 : instrCol;
        let out: string;

        if (p.label) {
            const ls = `${p.label}:`;
            out = ls.length < offset ? ls.padEnd(offset) : ls + ' ';
        } else {
            out = ' '.repeat(offset);
        }

        out += keyword;

        if (p.operands.length > 0) out += ' ' + p.operands.join(', ');

        contents.push(out);
    }

    let maxContentLen = 0;

    for (let i = 0; i < parsed.length; i++)
        if (parsed[i].comment !== undefined && !parsed[i].isCommentOnly)
            maxContentLen = Math.max(maxContentLen, contents[i].length);

    const commentCol = nextTabStop(maxContentLen);
    const rendered: string[] = [];
    let prevBlank = false;

    for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];

        if (p.isBlank) { if (!prevBlank) rendered.push(''); prevBlank = true; continue; }

        prevBlank = false;

        if (p.isCommentOnly) { rendered.push(`# ${p.comment}`); continue; }

        let out = contents[i];

        if (p.comment) out = out.padEnd(commentCol) + `# ${p.comment}`;

        rendered.push(out);
    }

    while (rendered.length > 0 && rendered[rendered.length - 1] === '') rendered.pop();

    const lastLine = lines.length - 1;

    return [{
        range: {
            start: { line: 0, character: 0 },
            end: { line: lastLine, character: lines[lastLine].length },
        },
        newText: rendered.join(eol),
    }];
}

// Provides hover information for value operands for those instructions that support them (e.g. Z, -Z, I, -I, P, -P)
function hoverValueOperand(instr: string, operand: string): string | null {
    const track = parseInt(operand.slice(0, 2), 10);

    if (instr === 'Z') {
        if (track <= 1) return '**Halt**';
        if (track <= 3) return '**No-op**';

        const switches = [4, 8, 16, 32].filter(sw => (track & sw) !== 0);
        const list = switches.length > 0 ? `switch${switches.length > 1 ? 'es' : ''} ${switches.join(', ')}` : 'no switches selected';

        return `**Sense Branch Switches** — ${list}`;
    }

    if (instr === '-Z') {
        const switches = [4, 8, 16, 32].filter(sw => (track & sw) !== 0);

        if (switches.length === 0) return '**Sense Overflow** — no branch switches checked';

        return `**Sense Overflow** — also checks switch${switches.length > 1 ? 'es' : ''} ${switches.join(', ')}`;
    }

    if (instr === 'I' || instr === '-I') {
        if (track === 62) return '**Shift only** — no input';
        if (track === 0) return '**Input device:** Model 141 Tape Reader';
        if (track === 2) return '**Input device:** Model 121 Typewriter';

        return `**Input device:** track ${track} (unrecognised)`;
    }

    if (instr === 'P' || instr === '-P') {
        if (track === 2) return '**Output device:** Model 121 Typewriter';
        if (track === 6) return '**Output device:** Model 151 Tape Punch';

        return `**Output device:** track ${track} (unrecognised)`;
    }

    return null;
}

// Returns the label at the given position, or null if there is no label
function labelAtPosition(doc: TextDocument, line: number, character: number): string | null {
    const lines = doc.getText().split(/\r?\n/);

    if (line >= lines.length) return null;

    const stripped = stripComment(lines[line]);

    for (const t of tokenize(stripped)) {
        if (character >= t.col && character < t.col + t.token.length) {
            const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;

            if (labelIdentify.test(bare)) return bare;

            return null;
        }
    }

    return null;
}

// Utility function to calculate the next tab stop given a content length, assuming tab stops every 8 characters starting from column 0
function nextTabStop(contentEnd: number): number {
    return Math.ceil((contentEnd + 2) / 8) * 8;
}

// Parses a line of assembly code into its components: label, keyword, operands, and comment. Also identifies blank lines and comment-only lines
function parseFormatterLine(raw: string): ParsedLine {
    const { code, comment } = extractComment(raw);
    const trimmedCode = code.trim();

    if (!trimmedCode && comment === undefined)
        return { isBlank: true, isStandaloneLabel: false, operands: [], isCommentOnly: false };

    if (!trimmedCode)
        return { isBlank: false, isCommentOnly: true, isStandaloneLabel: false, operands: [], comment };

    const tokens = tokenize(trimmedCode);
    let idx = 0;
    let label: string | undefined;

    if (idx < tokens.length && labelDefinition.test(tokens[idx].token)) {
        label = tokens[idx].token.slice(0, -1);
        idx++;
    }

    if (idx >= tokens.length)
        return { label, isStandaloneLabel: true, isBlank: false, isCommentOnly: false, operands: [], comment };

    const keyword = tokens[idx++].token;
    const groups: string[][] = [[]];

    for (const t of tokens.slice(idx)) {
        if (t.token === ',') groups.push([]);
        else groups[groups.length - 1].push(t.token);
    }

    const operands = groups.filter(g => g.length > 0).map(g => g.join(' '));

    return { label, isStandaloneLabel: false, isBlank: false, isCommentOnly: false, keyword, operands, comment };
}

// Converts a Span to an LSP Location object
function spanToLocation(uri: string, span: Span): Location {
    return {
        uri,
        range: {
            start: { line: span.line, character: span.col },
            end: { line: span.line, character: span.col + span.len },
        },
    };
}

// Returns the token at the given position, or null if there is no token
function tokenAtPosition(doc: TextDocument, line: number, character: number): Token | null {
    const lines = doc.getText().split(/\r?\n/);

    if (line >= lines.length) return null;

    const stripped = stripComment(lines[line]);

    for (const t of tokenize(stripped))
        if (character >= t.col && character < t.col + t.token.length) return t;

    return null;
}

// Main validation function. Validates the document and sends diagnostics to the client
function validate(doc: TextDocument): void {
    const errors: AssemblyError[] = [];
    const lines = doc.getText().split(/\r?\n/);
    const labelRefs = new Map<string, Span[]>();

    // First pass: collect label definitions and check for duplicates
    const labelDefs = collectLabelDefs(lines, errors);

    // Second pass: validate instructions, directives, and string literals
    validateTokens(lines, labelDefs, errors);

    // Third pass: collect label references
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);

        for (const t of tokenize(stripped)) {
            if (labelIdentify.test(t.token) && labelDefs.has(t.token)) {
                const list = labelRefs.get(t.token) ?? [];

                list.push({ line: i, col: t.col, len: t.token.length });
                labelRefs.set(t.token, list);
            }
        }
    }

    docStates.set(doc.uri, { labelDefs, labelRefs });
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: errors.map(asDiagnostic) });
}

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
    // return the capabilities of the language server
    capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        renameProvider: { prepareProvider: true },
        documentSymbolProvider: true,
    },
}));

// Provides hover information for instructions, directives, switches, labels, and string escapes
connection.onHover(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return null;

    const { line, character } = params.position;
    const t = tokenAtPosition(doc, line, character);

    if (!t) return null;

    const hover = (md: string): Hover => ({ contents: { kind: MarkupKind.Markdown, value: md } });

    // Provide instruction and directive hovers
    if (t.token in instructionDoc) return hover(`**${t.token}** — ${instructionDoc[t.token]}`);
    if (t.token in directiveDoc) return hover(`**${t.token}** — ${directiveDoc[t.token]}`);

    // Provide hover for SWITCH values
    if (t.token in switchDoc) {
        const lines = doc.getText().split(/\r?\n/);
        const stripped = stripComment(lines[line] ?? '');
        const leader = tokenize(stripped).find(tok => !labelDefinition.test(tok.token));

        if (leader?.token === '.SWITCH') return hover(`**${t.token}** — ${switchDoc[t.token]}`);
    }

    // Provide hover for value operands of instructions that support them, and decode track/sector for 4-digit operands
    if (/^\d{4}$/.test(t.token)) {
        const lines = doc.getText().split(/\r?\n/);
        const stripped = stripComment(lines[line] ?? '');
        const leader = tokenize(stripped).find(tok => !labelDefinition.test(tok.token));

        if (leader && (instructionSet.has(leader.token) || leader.token === '.ORG')) {
            if (valueInstructions.has(leader.token)) {
                const tip = hoverValueOperand(leader.token, t.token);

                return tip ? hover(tip) : null;
            }

            const track = parseInt(t.token.slice(0, 2), 10);
            const sector = parseInt(t.token.slice(2, 4), 10);

            if (track <= 63 && sector <= 63)
                return hover(`Track **${track}**, Sector **${sector}**`);
        }
    }

    // Provide hover for string escapes in any string literal
    if (/^'[^']*'$/.test(t.token)) {
        const content = t.token.slice(1, -1);
        const baseCol = t.col + 1;
        const re = /\{([^}]*)\}/g;

        let m: RegExpExecArray | null;

        while ((m = re.exec(content)) !== null) {
            const start = baseCol + m.index;
            const end = start + m[0].length;

            if (character >= start && character < end) {
                const key = m[1];

                if (key in escapeDoc) return hover(`**{${key}}** — ${escapeDoc[key]}`);

                return hover(`**{${key}}** — unknown escape`);
            }
        }

        return null;
    }

    const state = docStates.get(params.textDocument.uri);

    // Provide hover for labels at their definition and reference sites, showing the number of references and, for references, the definition line
    if (state) {
        const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;

        if (labelIdentify.test(bare)) {
            const def = state.labelDefs.get(bare);
            const refCount = state.labelRefs.get(bare)?.length ?? 0;

            if (def) {
                const isDef = t.token.endsWith(':');
                const line1 = def.line + 1;

                return hover(isDef
                    ? `**${bare}** — label definition, ${refCount} reference${refCount !== 1 ? 's' : ''}`
                    : `**${bare}** — defined at line ${line1}, ${refCount} reference${refCount !== 1 ? 's' : ''}`
                );
            }
        }
    }

    return null;
});

// Provide "go to definition" and "find references" functionality for labels
connection.onDefinition(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return null;

    const state = docStates.get(params.textDocument.uri);

    if (!state) return null;

    const name = labelAtPosition(doc, params.position.line, params.position.character);

    if (!name) return null;

    const def = state.labelDefs.get(name);

    if (!def) return null;

    return spanToLocation(params.textDocument.uri, def);
});

// Provide "find references" functionality for labels, optionally including the definition
connection.onReferences(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return null;

    const state = docStates.get(params.textDocument.uri);

    if (!state) return null;

    const name = labelAtPosition(doc, params.position.line, params.position.character);

    if (!name) return null;

    const refs = (state.labelRefs.get(name) ?? []).map(s => spanToLocation(params.textDocument.uri, s));

    if (params.context.includeDeclaration) {
        const def = state.labelDefs.get(name);

        if (def) refs.unshift(spanToLocation(params.textDocument.uri, def));
    }

    return refs;
});

// Provide "prepare rename" functionality for labels, returning the range of the label to be renamed
connection.onPrepareRename(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return null;

    const state = docStates.get(params.textDocument.uri);

    if (!state) return null;

    const name = labelAtPosition(doc, params.position.line, params.position.character);

    if (!name || !state.labelDefs.has(name)) return null;

    const t = tokenAtPosition(doc, params.position.line, params.position.character)!;
    const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;

    return {
        start: { line: params.position.line, character: t.col },
        end: { line: params.position.line, character: t.col + bare.length },
    };
});

// Provide "rename" functionality for labels, returning the edits to be made
connection.onRenameRequest(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return null;

    const state = docStates.get(params.textDocument.uri);

    if (!state) return null;

    const name = labelAtPosition(doc, params.position.line, params.position.character);

    if (!name) return null;
    if (!labelIdentify.test(params.newName)) return null;

    const edits: TextEdit[] = [];
    const spanToEdit = (s: Span): TextEdit => ({
        range: { start: { line: s.line, character: s.col }, end: { line: s.line, character: s.col + s.len } },
        newText: params.newName,
    });
    const def = state.labelDefs.get(name);

    if (def) edits.push(spanToEdit(def));

    for (const ref of state.labelRefs.get(name) ?? []) edits.push(spanToEdit(ref));

    return { changes: { [params.textDocument.uri]: edits } };
});

// Provide document symbols for labels, returning a list of DocumentSymbol objects for each label definition
connection.onDocumentSymbol(params => {
    const state = docStates.get(params.textDocument.uri);

    if (!state) return [];

    return Array.from(state.labelDefs.entries()).map(([name, span]): DocumentSymbol => ({
        name,
        // Using SymbolKind.Constant for labels, as there isn't a more appropriate kind in the LSP specification
        kind: SymbolKind.Constant,
        range: {
            start: { line: span.line, character: span.col },
            end: { line: span.line, character: span.col + span.len + 1 },
        },
        selectionRange: {
            start: { line: span.line, character: span.col },
            end: { line: span.line, character: span.col + span.len },
        },
    }));
});

// Provide document formatting to the entire document using the formatDocument function
connection.onDocumentFormatting(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return [];

    return formatDocument(doc);
});

// Range formatting is treated the same as full document formatting for simplicity
connection.onDocumentRangeFormatting(params => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) return [];

    return formatDocument(doc);
});

// On open, validate the document immediately
documents.onDidOpen(event => validate(event.document));

// On change, wait 300ms after the last change before validating
documents.onDidChangeContent(change => {
    const uri = change.document.uri;

    clearTimeout(pendingValidation.get(uri));

    pendingValidation.set(uri, setTimeout(() => {
        pendingValidation.delete(uri);
        validate(change.document);
    }, 300));
});

connection.listen();
documents.listen(connection);
