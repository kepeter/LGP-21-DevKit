"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const descriptions_1 = require("./descriptions");
const escapeSet = new Set(['uc', 'lc', 'cs', 'cr', 'bs', 'tab']);
const instructionSet = new Set(['A', 'D', 'M', 'N', 'S', 'E', 'T', 'U', 'Z', 'B', 'C', 'H', 'I', 'R', 'Y', 'P', '-T', '-Z', '-I', '-P']);
const directiveSet = new Set(['.ORG', '.DATA']);
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
const docStates = new Map();
const pendingValidation = new Map();
connection.onInitialize((_params) => ({
    capabilities: {
        textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        renameProvider: { prepareProvider: true },
        documentSymbolProvider: true,
    },
}));
documents.onDidOpen(event => validate(event.document));
documents.onDidChangeContent(change => {
    const uri = change.document.uri;
    clearTimeout(pendingValidation.get(uri));
    pendingValidation.set(uri, setTimeout(() => {
        pendingValidation.delete(uri);
        validate(change.document);
    }, 300));
});
function validate(doc) {
    const diagnostics = [];
    const lines = doc.getText().split(/\r?\n/);
    const labelDefs = new Map();
    const labelRefs = new Map();
    const labelRegEx = /(?<![A-Za-z0-9_:])([A-Za-z_][A-Za-z0-9_]*):/g;
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);
        labelRegEx.lastIndex = 0;
        let m;
        while ((m = labelRegEx.exec(stripped)) !== null) {
            const name = m[1];
            if (labelDefs.has(name)) {
                const first = labelDefs.get(name);
                diagnostics.push(error(i, m.index, m.index + m[0].length, `Duplicate label '${name}' (first defined at line ${first.line + 1})`));
            }
            else {
                labelDefs.set(name, { line: i, col: m.index, len: name.length });
            }
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);
        if (!stripped.trim())
            continue;
        const tokens = splitByComma(stripped)
            .flat()
            .filter(t => !/^[A-Za-z_][A-Za-z0-9_]*:$/.test(t.token));
        if (tokens.length === 0)
            continue;
        const first = tokens[0];
        if (instructionSet.has(first.token)) {
            validateInstructionGroup(i, tokens, labelDefs, diagnostics);
        }
        else if (directiveSet.has(first.token)) {
            validateDirectiveGroup(i, tokens, labelDefs, diagnostics);
        }
        else {
            diagnostics.push(error(i, first.col, first.col + first.token.length, `Unknown token '${first.token}'`));
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);
        for (const t of tokenize(stripped)) {
            if (/^'[^']*'$/.test(t.token)) {
                validateStringEscapes(t, i, diagnostics);
            }
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);
        for (const t of tokenize(stripped)) {
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.token) && labelDefs.has(t.token)) {
                const list = labelRefs.get(t.token) ?? [];
                list.push({ line: i, col: t.col, len: t.token.length });
                labelRefs.set(t.token, list);
            }
        }
    }
    docStates.set(doc.uri, { labelDefs, labelRefs });
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}
function validateInstructionGroup(line, tokens, labelDefs, diagnostics) {
    const instr = tokens[0];
    const operands = tokens.slice(1);
    if (operands.length === 0) {
        diagnostics.push(error(line, instr.col, instr.col + instr.token.length, `Instruction '${instr.token}' requires an address`));
        return;
    }
    if (operands.length > 1) {
        for (const t of operands.slice(1)) {
            diagnostics.push(error(line, t.col, t.col + t.token.length, `Unexpected operand — instruction '${instr.token}' takes exactly one address`));
        }
    }
    const addr = operands[0];
    const addrErr = validateAddress(addr.token, labelDefs);
    if (addrErr) {
        diagnostics.push(error(line, addr.col, addr.col + addr.token.length, addrErr));
    }
}
function validateDirectiveGroup(line, tokens, labelDefs, diagnostics) {
    const directive = tokens[0];
    const operands = tokens.slice(1);
    if (directive.token === '.ORG') {
        if (operands.length === 0) {
            diagnostics.push(error(line, directive.col, directive.col + directive.token.length, `.ORG requires a load address`));
            return;
        }
        if (operands.length > 1) {
            for (const t of operands.slice(1)) {
                diagnostics.push(error(line, t.col, t.col + t.token.length, `.ORG takes exactly one address`));
            }
        }
        const addr = operands[0];
        const orgErr = validateTtSS(addr.token);
        if (orgErr) {
            diagnostics.push(error(line, addr.col, addr.col + addr.token.length, orgErr));
        }
        return;
    }
    for (const t of operands) {
        if (/^'[^']*'$/.test(t.token))
            continue;
        if (/^[0-9]+(\.[0-9]+)?$/.test(t.token))
            continue;
        const addrErr = validateAddress(t.token, labelDefs);
        if (addrErr) {
            diagnostics.push(error(line, t.col, t.col + t.token.length, addrErr));
        }
    }
}
function validateStringEscapes(t, line, diagnostics) {
    const content = t.token.slice(1, -1);
    const baseCol = t.col + 1;
    const re = /\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        if (!escapeSet.has(m[1])) {
            diagnostics.push(error(line, baseCol + m.index, baseCol + m.index + m[0].length, `Unknown escape '${m[0]}' — valid: {uc} {lc} {cs} {cr} {bs} {tab}`));
        }
    }
}
function validateTtSS(token) {
    if (!/^\d{4}$/.test(token)) {
        return `Invalid address '${token}' — expected a 4-digit ttSS (track 0-63, sector 0-63)`;
    }
    const track = parseInt(token.slice(0, 2), 10);
    const sector = parseInt(token.slice(2, 4), 10);
    if (track > 63)
        return `Track ${track} out of range (0-63)`;
    if (sector > 63)
        return `Sector ${sector} out of range (0-63)`;
    return null;
}
function validateAddress(token, labelDefs) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
        return labelDefs.has(token) ? null : `Undefined label '${token}'`;
    }
    return validateTtSS(token);
}
function stripComment(line) {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'")
            inString = !inString;
        if (!inString && line[i] === '#')
            return line.slice(0, i);
    }
    return line;
}
function tokenize(line) {
    const result = [];
    const re = /'[^']*'|,|-[A-Za-z]+|[^\s,]+/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        result.push({ token: m[0], col: m.index });
    }
    return result;
}
function splitByComma(line) {
    const groups = [[]];
    for (const t of tokenize(line)) {
        if (t.token === ',') {
            groups.push([]);
        }
        else {
            groups[groups.length - 1].push(t);
        }
    }
    return groups.filter(g => g.length > 0);
}
function error(line, start, end, message) {
    return {
        severity: node_1.DiagnosticSeverity.Error,
        range: {
            start: { line, character: start },
            end: { line, character: end },
        },
        message,
        source: 'lgp21',
    };
}
function labelAtPosition(doc, line, character) {
    const lines = doc.getText().split(/\r?\n/);
    if (line >= lines.length)
        return null;
    const stripped = stripComment(lines[line]);
    for (const t of tokenize(stripped)) {
        if (character >= t.col && character < t.col + t.token.length) {
            const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare))
                return bare;
            return null;
        }
    }
    return null;
}
function spanToLocation(uri, span) {
    return {
        uri,
        range: {
            start: { line: span.line, character: span.col },
            end: { line: span.line, character: span.col + span.len },
        },
    };
}
function tokenAtPosition(doc, line, character) {
    const lines = doc.getText().split(/\r?\n/);
    if (line >= lines.length)
        return null;
    const stripped = stripComment(lines[line]);
    for (const t of tokenize(stripped)) {
        if (character >= t.col && character < t.col + t.token.length)
            return t;
    }
    return null;
}
connection.onHover(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const { line, character } = params.position;
    const t = tokenAtPosition(doc, line, character);
    if (!t)
        return null;
    const hover = (md) => ({
        contents: { kind: node_1.MarkupKind.Markdown, value: md },
    });
    if (t.token in descriptions_1.instructionDoc) {
        return hover(`**${t.token}** — ${descriptions_1.instructionDoc[t.token]}`);
    }
    if (t.token in descriptions_1.directiveDoc) {
        return hover(`**${t.token}** — ${descriptions_1.directiveDoc[t.token]}`);
    }
    if (/^\d{4}$/.test(t.token)) {
        const lines = doc.getText().split(/\r?\n/);
        const stripped = stripComment(lines[line] ?? '');
        const leader = tokenize(stripped).find(tok => !/^[A-Za-z_][A-Za-z0-9_]*:$/.test(tok.token));
        if (leader && (instructionSet.has(leader.token) || leader.token === '.ORG')) {
            const track = parseInt(t.token.slice(0, 2), 10);
            const sector = parseInt(t.token.slice(2, 4), 10);
            if (track <= 63 && sector <= 63) {
                return hover(`Track **${track}**, Sector **${sector}**`);
            }
        }
    }
    if (/^'[^']*'$/.test(t.token)) {
        const content = t.token.slice(1, -1);
        const baseCol = t.col + 1;
        const re = /\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(content)) !== null) {
            const start = baseCol + m.index;
            const end = start + m[0].length;
            if (character >= start && character < end) {
                const key = m[1];
                if (key in descriptions_1.escapeDoc)
                    return hover(`**{${key}}** — ${descriptions_1.escapeDoc[key]}`);
                return hover(`**{${key}}** — unknown escape`);
            }
        }
        return null;
    }
    const state = docStates.get(params.textDocument.uri);
    if (state) {
        const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) {
            const def = state.labelDefs.get(bare);
            const refCount = state.labelRefs.get(bare)?.length ?? 0;
            if (def) {
                const isDef = t.token.endsWith(':');
                const line1 = def.line + 1;
                return hover(isDef
                    ? `**${bare}** — label definition, ${refCount} reference${refCount !== 1 ? 's' : ''}`
                    : `**${bare}** — defined at line ${line1}, ${refCount} reference${refCount !== 1 ? 's' : ''}`);
            }
        }
    }
    return null;
});
connection.onDefinition(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const state = docStates.get(params.textDocument.uri);
    if (!state)
        return null;
    const name = labelAtPosition(doc, params.position.line, params.position.character);
    if (!name)
        return null;
    const def = state.labelDefs.get(name);
    if (!def)
        return null;
    return spanToLocation(params.textDocument.uri, def);
});
connection.onReferences(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const state = docStates.get(params.textDocument.uri);
    if (!state)
        return null;
    const name = labelAtPosition(doc, params.position.line, params.position.character);
    if (!name)
        return null;
    const refs = (state.labelRefs.get(name) ?? []).map(s => spanToLocation(params.textDocument.uri, s));
    if (params.context.includeDeclaration) {
        const def = state.labelDefs.get(name);
        if (def)
            refs.unshift(spanToLocation(params.textDocument.uri, def));
    }
    return refs;
});
connection.onPrepareRename(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const state = docStates.get(params.textDocument.uri);
    if (!state)
        return null;
    const name = labelAtPosition(doc, params.position.line, params.position.character);
    if (!name || !state.labelDefs.has(name))
        return null;
    const t = tokenAtPosition(doc, params.position.line, params.position.character);
    const bare = t.token.endsWith(':') ? t.token.slice(0, -1) : t.token;
    return {
        start: { line: params.position.line, character: t.col },
        end: { line: params.position.line, character: t.col + bare.length },
    };
});
connection.onRenameRequest(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const state = docStates.get(params.textDocument.uri);
    if (!state)
        return null;
    const name = labelAtPosition(doc, params.position.line, params.position.character);
    if (!name)
        return null;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(params.newName))
        return null;
    const edits = [];
    const spanToEdit = (s) => ({
        range: { start: { line: s.line, character: s.col }, end: { line: s.line, character: s.col + s.len } },
        newText: params.newName,
    });
    const def = state.labelDefs.get(name);
    if (def)
        edits.push(spanToEdit(def));
    for (const ref of state.labelRefs.get(name) ?? [])
        edits.push(spanToEdit(ref));
    return { changes: { [params.textDocument.uri]: edits } };
});
connection.onDocumentSymbol(params => {
    const state = docStates.get(params.textDocument.uri);
    if (!state)
        return [];
    return Array.from(state.labelDefs.entries()).map(([name, span]) => ({
        name,
        kind: node_1.SymbolKind.Function,
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
function nextTabStop(contentEnd) {
    return Math.ceil((contentEnd + 2) / 8) * 8;
}
function extractComment(line) {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'")
            inString = !inString;
        if (!inString && line[i] === '#') {
            return { code: line.slice(0, i), comment: line.slice(i + 1).trim() };
        }
    }
    return { code: line, comment: undefined };
}
function parseFormatterLine(raw) {
    const { code, comment } = extractComment(raw);
    const trimmedCode = code.trim();
    if (!trimmedCode && comment === undefined)
        return { isBlank: true, isStandaloneLabel: false, operands: [], isCommentOnly: false };
    if (!trimmedCode)
        return { isBlank: false, isCommentOnly: true, isStandaloneLabel: false, operands: [], comment };
    const tokens = tokenize(trimmedCode);
    let idx = 0;
    let label;
    if (idx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*:$/.test(tokens[idx].token)) {
        label = tokens[idx].token.slice(0, -1);
        idx++;
    }
    if (idx >= tokens.length)
        return { label, isStandaloneLabel: true, isBlank: false, isCommentOnly: false, operands: [], comment };
    const keyword = tokens[idx++].token;
    const groups = [[]];
    for (const t of tokens.slice(idx)) {
        if (t.token === ',')
            groups.push([]);
        else
            groups[groups.length - 1].push(t.token);
    }
    const operands = groups.filter(g => g.length > 0).map(g => g.join(' '));
    return { label, isStandaloneLabel: false, isBlank: false, isCommentOnly: false, keyword, operands, comment };
}
function formatDocument(doc) {
    const text = doc.getText();
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const parsed = lines.map(parseFormatterLine);
    let maxLabelLen = 0;
    for (const p of parsed) {
        if (p.label && !p.isStandaloneLabel)
            maxLabelLen = Math.max(maxLabelLen, p.label.length);
    }
    const instrCol = nextTabStop(maxLabelLen + 1); // +1 for colon; gives 8 when no labels
    const contents = [];
    for (const p of parsed) {
        if (p.isBlank || p.isCommentOnly) {
            contents.push('');
            continue;
        }
        if (p.isStandaloneLabel) {
            contents.push(`${p.label}:`);
            continue;
        }
        const keyword = p.keyword;
        const offset = (keyword.startsWith('-') || keyword.startsWith('.')) ? instrCol - 1 : instrCol;
        let out;
        if (p.label) {
            const ls = `${p.label}:`;
            out = ls.length < offset ? ls.padEnd(offset) : ls + ' ';
        }
        else {
            out = ' '.repeat(offset);
        }
        out += keyword;
        if (p.operands.length > 0)
            out += ' ' + p.operands.join(', ');
        contents.push(out);
    }
    let maxContentLen = 0;
    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].comment !== undefined && !parsed[i].isCommentOnly)
            maxContentLen = Math.max(maxContentLen, contents[i].length);
    }
    const commentCol = nextTabStop(maxContentLen);
    const rendered = [];
    let prevBlank = false;
    for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        if (p.isBlank) {
            if (!prevBlank)
                rendered.push('');
            prevBlank = true;
            continue;
        }
        prevBlank = false;
        if (p.isCommentOnly) {
            rendered.push(`# ${p.comment}`);
            continue;
        }
        let out = contents[i];
        if (p.comment)
            out = out.padEnd(commentCol) + `# ${p.comment}`;
        rendered.push(out);
    }
    while (rendered.length > 0 && rendered[rendered.length - 1] === '')
        rendered.pop();
    const lastLine = lines.length - 1;
    return [{
            range: {
                start: { line: 0, character: 0 },
                end: { line: lastLine, character: lines[lastLine].length },
            },
            newText: rendered.join(eol),
        }];
}
connection.onDocumentFormatting(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return [];
    return formatDocument(doc);
});
connection.onDocumentRangeFormatting(params => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return [];
    return formatDocument(doc);
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map