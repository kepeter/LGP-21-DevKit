// A set of all valid instruction mnemonics in the LGP-21 assembly language
export const instructionSet = new Set(['A', 'D', 'M', 'N', 'S', 'E', 'T', 'U', 'Z', 'B', 'C', 'H', 'I', 'R', 'Y', 'P', '-T', '-Z', '-I', '-P']);

// Regular expressions for identifying and validating labels in assembly code
const labelPattern = '[A-Za-z_][A-Za-z0-9_]*';

export const labelDefinition = new RegExp(`^${labelPattern}:$`);
export const labelIdentify = new RegExp(`^${labelPattern}$`);
export const labelScan = new RegExp(`(?<![A-Za-z0-9_:])(${labelPattern}):`, 'g');
export const labelWithOffset = new RegExp(`^(${labelPattern})\\[(-?[0-9]+)\\]$`);


// Characters that require LC (lowercase/figures) mode on the LGP-21 typewriter
export const lcChars = new Set([
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '-', '+', ';', '/', '.', ',',
    'l', 'f', 'g', 'j', 'k', 'q', 'w', 'z', 'b', 'y', 'r', 'i', 'd', 'n', 'm', 'p', 'e', 'u', 't', 'h', 'c', 'a', 's', 'v', 'o', 'x',
]);

// Characters that require UC (uppercase/letters) mode on the LGP-21 typewriter
export const ucChars = new Set([
    ')', '*', '"', 'Δ', '%', '$', 'π', 'Σ', '(', '_', '=', ':', '?', ']', '[',
    'L', 'F', 'G', 'J', 'K', 'Q', 'W', 'Z', 'B', 'Y', 'R', 'I', 'D', 'N', 'M', 'P', 'E', 'U', 'T', 'H', 'C', 'A', 'S', 'V', 'O', 'X',
]);

// Instruction mnemonics that take a value parameter
export const valueInstructions = new Set(['Z', '-Z', 'I', '-I', 'P', '-P']);

// The structure of error/warning in assembly code
export interface AssemblyError {
    line: number;
    start: number;
    end: number;
    message: string;
    severity?: 'error' | 'warning' | 'information';
}

// Analysis result for a numeric literal — exactness, q value, and stored value
export interface NumericLiteralInfo {
    q: number;
    reason: 'exact' | 'infinite' | 'truncated' | 'overflow';
    storedFractionValue: number;
    bitsNeeded: number;
    bitsAvailable: number;
    storedValue: number | null;
}

// The structure for a span (start position and length) of any defined element
export interface Span { line: number; col: number; len: number; }

// A memory address in ttSS format
export interface Address { track: number; sector: number; }

// The structure for a single token
export interface Token { token: string; col: number; }

// Analyzes a numeric literal token to determine whole and fractional parts, q value, and the stored representation in 32-bit signed integer format
// It checks for overflow, infinite fractions, and truncation based on the available bits for the fractional part
// The function returns an object containing the analysis results, which can be used for validation and error reporting.
// The computation is done on whole numbers only to prevent floating-point inaccuracies
export function analyzeNumericLiteral(token: string, defaultQ?: number): NumericLiteralInfo {
    const [numStr, qStr] = token.split('@');
    const explicitQ = qStr !== undefined ? Number(qStr) : null;
    const parts = numStr.split('.');
    const effectiveQ = explicitQ ?? defaultQ ?? null;

    const wholeStr = parts[0];
    const whole = Number(wholeStr);
    const fractionStr = parts[1] || '';
    const fraction = Number(fractionStr);

    const negative = numStr.trim().startsWith('-');

    let wholeDec = Math.abs(whole);
    let wholeBin = '';

    // Convert the whole part of the number to binary representation in string format
    while (wholeDec) {
        let reminder = wholeDec % 2;

        wholeDec = Math.floor(wholeDec / 2);

        wholeBin = reminder + wholeBin;
    }

    // Check for overflow: if the effective q value is less than the length of the whole part in binary,
    // it indicates that the whole part cannot fit within the available bits
    if (effectiveQ !== null && effectiveQ < wholeBin.length) {
        return {
            q: effectiveQ,
            reason: 'overflow',
            storedFractionValue: 0,
            bitsNeeded: wholeBin.length,
            bitsAvailable: effectiveQ,
            storedValue: null
        };
    }

    const q = effectiveQ ?? wholeBin.length;
    const availableBits = Math.max(0, 30 - q);

    // If there is no fractional part, return the analysis result with the whole part stored and no fraction
    if (!fractionStr) {
        return {
            q,
            reason: 'exact',
            storedFractionValue: 0,
            bitsNeeded: 0,
            bitsAvailable: availableBits,
            storedValue: padTo32Bit(wholeBin, negative)
        };
    }

    const checkpoint = Math.pow(10, fractionStr.length);
    const checkSet = new Set<number>([fraction]);

    let fractionDec = fraction;
    let fractionBin = '';
    let finite = true;
    let maxIter = 64;

    // Convert the fractional part of the number to binary representation in string format
    // The loop continues until the fractional part becomes zero, or a repeating pattern is detected, or the maximum number of iterations is reached
    while (fractionDec && maxIter-- > 0) {
        fractionDec = fractionDec * 2;

        if (checkSet.has(fractionDec)) {
            finite = false; break;
        }

        checkSet.add(fractionDec);

        if (fractionDec >= checkpoint) {
            fractionBin += '1'; fractionDec -= checkpoint;
        }
        else {
            fractionBin += '0';
        }
    }

    if (fractionDec && finite) {
        finite = false;

    }

    const storedBin = fractionBin.slice(0, availableBits);
    const storedFrac = storedBin.length > 0 ? parseInt(storedBin, 2) / Math.pow(2, storedBin.length) : 0;
    const reason: 'exact' | 'infinite' | 'truncated' = !finite ? 'infinite' : fractionBin.length > availableBits ? 'truncated' : 'exact';

    // Return the analysis result with the whole part, stored fraction, and reason for any issues encountered during conversion
    return {
        q,
        reason,
        storedFractionValue: storedFrac,
        bitsNeeded: fractionBin.length,
        bitsAvailable: availableBits,
        storedValue: padTo32Bit(wholeBin + storedBin, negative)
    };
}

// Extract the base label name from a plain label or label[n] token
export function baseLabelOf(token: string): string | null {
    if (labelIdentify.test(token)) return token;
    const m = labelWithOffset.exec(token);
    return m ? m[1] : null;
}

// Collects all label definitions in the provided lines and returns a map of label names to their spans, while also recording any duplicate label errors
export function collectLabelDefs(lines: string[], errors: AssemblyError[]): Map<string, Span> {
    const labelDefs = new Map<string, Span>();
    const re = new RegExp(labelScan.source, labelScan.flags);

    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);

        re.lastIndex = 0;

        let m: RegExpExecArray | null;

        while ((m = re.exec(stripped)) !== null) {
            const name = m[1];

            if (labelDefs.has(name)) {
                const first = labelDefs.get(name)!;

                errors.push({
                    line: i, start: m.index, end: m.index + m[0].length,
                    message: `Duplicate label '${name}' (first defined at line ${first.line + 1})`
                });
            } else {
                labelDefs.set(name, { line: i, col: m.index, len: name.length });
            }
        }
    }

    return labelDefs;
}

// Returns all tokens in a line that are not label definitions
export function nonLabelTokens(stripped: string): Token[] {
    return splitByComma(stripped)
        .flat()
        .filter(t => !labelDefinition.test(t.token));
}

// Splits a line of assembly code into groups of tokens separated by commas
export function splitByComma(line: string): Token[][] {
    const groups: Token[][] = [[]];

    for (const t of tokenize(line)) {
        if (t.token === ',') groups.push([]);
        else groups[groups.length - 1].push(t);
    }

    return groups.filter(g => g.length > 0);
}

// Strips comments from a line of assembly code
export function stripComment(line: string): string {
    let inString = false;

    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inString = !inString;

        if (!inString && line[i] === '#') return line.slice(0, i);
    }

    return line;
}

// Tokenizes a line of assembly code into an array of tokens, each with its starting column index
export function tokenize(line: string): Token[] {
    const result: Token[] = [];
    const re = /'[^']*'|,|-[A-Za-z]+|[^\s,]+/g;

    let m: RegExpExecArray | null;

    while ((m = re.exec(line)) !== null) result.push({ token: m[0], col: m.index });

    return result;
}

// Validates all lines of assembly code, checking for unknown tokens, instruction and directive errors, and string literal issues
export function validateTokens(lines: string[], labelDefs: Map<string, Span>, errors: AssemblyError[]): void {
    let currentDefaultQ: number | undefined = undefined;

    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);

        if (!stripped.trim()) continue;

        const tokens = nonLabelTokens(stripped);

        if (tokens.length === 0) continue;

        const first = tokens[0];

        if (first.token === '.Q') {
            const arg = tokens[1];

            if (tokens.length < 2) {
                errors.push({ line: i, start: first.col, end: first.col + first.token.length, message: `.Q requires a value (0-30)` });
            } else if (tokens.length > 2) {
                errors.push({ line: i, start: tokens[2].col, end: tokens[2].col + tokens[2].token.length, message: `.Q takes exactly one argument` });
            } else {
                const q = parseInt(arg.token, 10);

                if (isNaN(q) || q < 0 || q > 30) {
                    errors.push({ line: i, start: arg.col, end: arg.col + arg.token.length, message: `.Q value must be an integer from 0 to 30` });
                } else {
                    currentDefaultQ = q;
                }
            }
        } else if (instructionSet.has(first.token)) {
            validateInstructionGroup(i, tokens, labelDefs, errors);
        } else if (directiveSet.has(first.token)) {
            validateDirectiveGroup(i, tokens, labelDefs, errors, currentDefaultQ);
        } else {
            errors.push({
                line: i, start: first.col, end: first.col + first.token.length,
                message: `Unknown token '${first.token}'`
            });
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);

        for (const t of tokenize(stripped))
            if (/^'[^']*'$/.test(t.token)) validateStringLiterals(t, i, errors);
    }
}

// A set of all valid directives added by this extension
const directiveSet = new Set(['.ORG', '.DATA', '.SWITCH', '.Q']);

// Legal values for escape codes in string literals
const escapeSet = new Set(['tf', 'uc', 'lc', 'cs', 'cr', 'bs', 'tb']);

// Maximum and minimum values for numeric literals
const maxInt = 2147483646
const minInt = -2147483646

// Valid switch names for the .SWITCH directive
const switchNames = new Set(['BS4', 'BS8', 'BS16', 'BS32', 'TC']);

// All the  valid character literals
const validLgp21Chars = new Set([
    ')', 'L', 'l', '1', '*', '2', '"', '3', 'Δ', '4', '%', '5', '$', '6', 'π', '7', 'Σ', '8', '(', '9',
    'F', 'f', 'G', 'g', 'J', 'j', 'K', 'k', 'Q', 'q', 'W', 'w',
    'Z', 'z', 'B', 'b', 'Y', 'y', 'R', 'r', 'I', 'i', 'D', 'd', 'N', 'n', 'M', 'm',
    'P', 'p', 'E', 'e', 'U', 'u', 'T', 't', 'H', 'h', 'C', 'c', 'A', 'a', 'S', 's',
    ' ', '_', '-', '=', '+', ':', ';', '?', '/', ']', '.', '[', ',', 'V', 'v', '0', 'O', 'o', 'X', 'x',
]);

// Pads a binary string to fit into a 32-bit signed integer representation, considering the sign and a separator bit
function padTo32Bit(binaryStr: string, isNegative: boolean): number {
    const signBit = isNegative ? '1' : '0';
    const separatorBit = '0';
    const paddedPayload = binaryStr.padStart(30, '0');

    return parseInt(signBit + paddedPayload + separatorBit, 2);
}

// Validates a directive and its operands
function validateDirectiveGroup(line: number, tokens: Token[], labelDefs: Map<string, Span>, errors: AssemblyError[], defaultQ?: number): void {
    const directive = tokens[0];
    const operands = tokens.slice(1);

    if (directive.token === '.ORG') {
        if (operands.length === 0) {
            errors.push({
                line, start: directive.col, end: directive.col + directive.token.length,
                message: `.ORG requires a load address`
            });

            return;
        }

        for (const t of operands.slice(1)) {
            errors.push({ line, start: t.col, end: t.col + t.token.length, message: `.ORG takes exactly one address` });
        }

        const addr = operands[0];
        const orgErr = validateTtSS(addr.token);

        if (orgErr) errors.push({ line, start: addr.col, end: addr.col + addr.token.length, message: orgErr });

        return;
    }

    if (directive.token === '.SWITCH') {
        if (operands.length === 0) {
            errors.push({
                line, start: directive.col, end: directive.col + directive.token.length,
                message: `.SWITCH requires at least one switch name (BS4, BS8, BS16, BS32, TC)`
            });

            return;
        }

        for (const t of operands) {
            if (!switchNames.has(t.token))
                errors.push({
                    line, start: t.col, end: t.col + t.token.length,
                    message: `Unknown switch '${t.token}' — valid names: BS4, BS8, BS16, BS32, TC`
                });
        }

        return;
    }

    // Literals declared in .DATA directive
    for (const t of operands) {
        if (/^'[^']*'$/.test(t.token)) {
            validateStringLiterals(t, line, errors);

            continue;
        }

        if (/^-?[0-9]+(\.[0-9]+)?(@[0-9]+)?$/.test(t.token)) {
            validateNumericLiterals(t, line, errors, defaultQ);

            continue;
        }

        const addrErr = validateParameter(t.token, labelDefs);

        if (addrErr) errors.push({ line, start: t.col, end: t.col + t.token.length, message: addrErr });
    }
}

// Validates an instruction and its operands
function validateInstructionGroup(line: number, tokens: Token[], labelDefs: Map<string, Span>, errors: AssemblyError[]): void {
    const instr = tokens[0];
    const operands = tokens.slice(1);

    if (operands.length === 0) {
        errors.push({
            line, start: instr.col, end: instr.col + instr.token.length,
            message: `Instruction '${instr.token}' requires a parameter`
        });

        return;
    }

    for (const t of operands.slice(1)) {
        errors.push({
            line, start: t.col, end: t.col + t.token.length,
            message: `Unexpected operand — instruction '${instr.token}' takes exactly one parameter`
        });
    }

    const addr = operands[0];
    const addrErr = validateParameter(addr.token, labelDefs);

    if (addrErr) errors.push({ line, start: addr.col, end: addr.col + addr.token.length, message: addrErr });
}

// Validates numeric literals, checking for proper format and range
function validateNumericLiterals(t: Token, line: number, errors: AssemblyError[], defaultQ?: number): void {
    const num = t.token.split('@')[0];
    const span = { line, start: t.col, end: t.col + t.token.length };

    if (Number(num) <= minInt || Number(num) > maxInt) {
        errors.push({
            ...span,
            message: `Value ${num} out of range — valid range is [${minInt}, ${maxInt}]`
        });
        return;
    }

    const info = analyzeNumericLiteral(t.token, defaultQ);

    // Not all issues with numeric literals are fatal errors; some are warnings that indicate potential problems with precision or representation
    if (info.reason === 'overflow') {
        errors.push({
            ...span,
            message: `Overflow — whole part needs ${info.bitsNeeded} bits but q=${info.bitsAvailable} only allows ${info.bitsAvailable}`
        });
    } else if (info.reason === 'infinite') {
        errors.push({
            ...span,
            severity: 'warning',
            message: `${t.token} cannot be converted to binary as is — the fraction part creates an infinite run. The actual fraction value will be ${info.storedFractionValue}`
        });
    } else if (info.reason === 'truncated') {
        errors.push({
            ...span,
            severity: 'warning',
            message: `${t.token} cannot be converted to binary as is — the fraction part needs ${info.bitsNeeded} bits, but only ${info.bitsAvailable} of 30 bits remain. The actual fraction value will be ${info.storedFractionValue}`
        });
    }
}

// The parameter is either label, label[n], or address (ttSS)
function validateParameter(token: string, labelDefs: Map<string, Span>): string | null {
    if (labelIdentify.test(token))
        return labelDefs.has(token) ? null : `Undefined label '${token}'`;

    const om = labelWithOffset.exec(token);

    if (om)
        return labelDefs.has(om[1]) ? null : `Undefined label '${om[1]}'`;

    return validateTtSS(token);
}

// Validates escape sequences in string literals and checks for invalid characters
function validateStringLiterals(t: Token, line: number, errors: AssemblyError[]): void {
    const content = t.token.slice(1, -1);
    const baseCol = t.col + 1;
    const hasExplicitCaseShift = /\{uc\}|\{lc\}/.test(content);

    let currentCase: 'uc' | 'lc' = 'lc';
    let i = 0;

    while (i < content.length) {
        if (content[i] === '{') {
            const close = content.indexOf('}', i);

            if (close >= 0) {
                const key = content.slice(i + 1, close);

                if (!escapeSet.has(key))
                    errors.push({
                        line, start: baseCol + i, end: baseCol + close + 1,
                        message: `Unknown escape '{${key}}' — valid: {tf} {uc} {lc} {cs} {cr} {bs} {tb}`
                    });
                else if (key === 'uc') currentCase = 'uc';
                else if (key === 'lc') currentCase = 'lc';

                i = close + 1;
            } else {
                i = content.length;
            }
        } else {
            const ch = content[i];

            if (!validLgp21Chars.has(ch)) {
                errors.push({
                    line, start: baseCol + i, end: baseCol + i + 1,
                    message: `Character '${ch}' is not available on the LGP-21 typewriter`
                });
            } else if (hasExplicitCaseShift) {
                if (ucChars.has(ch) && currentCase !== 'uc')
                    errors.push({
                        line, start: baseCol + i, end: baseCol + i + 1,
                        message: `'${ch}' requires uppercase mode — add {uc} before it.`,
                        severity: 'warning'
                    });
                else if (lcChars.has(ch) && currentCase !== 'lc')
                    errors.push({
                        line, start: baseCol + i, end: baseCol + i + 1,
                        message: `'${ch}' requires lowercase mode — add {lc} before it.`,
                        severity: 'warning'
                    });
            }

            i++;
        }
    }
}

// Count characters in a string literal (each {escape} counts as one character)
function charCountInString(token: string): number {
    const content = token.slice(1, -1);
    let count = 0;
    let i = 0;

    while (i < content.length) {
        if (content[i] === '{') {
            const close = content.indexOf('}', i);
            i = close >= 0 ? close + 1 : content.length;
        } else {
            i++;
        }

        count++;
    }

    return count;
}

// Number of 32-bit words a .DATA token occupies
function dataWordCount(token: string): number {
    if (/^'[^']*'$/.test(token)) return Math.max(1, Math.ceil(charCountInString(token) / 5));

    return 1;
}

// Compute the address of every label in the source, in layout order.
// Returns a map of label name → Address. Mirrors the compiler's layout pass.
export function computeLabelAddresses(lines: string[]): Map<string, Address> {
    const addresses = new Map<string, Address>();
    let cur: Address = { track: 0, sector: 0 };

    const nextAddr = (a: Address): Address => {
        const s = a.sector + 1;
        return s < 64 ? { track: a.track, sector: s } : { track: a.track + 1, sector: 0 };
    };

    const parseTtSS = (s: string): Address =>
        ({ track: parseInt(s.slice(0, 2), 10), sector: parseInt(s.slice(2, 4), 10) });

    for (const rawLine of lines) {
        const stripped = stripComment(rawLine);

        if (!stripped.trim()) continue;

        const tokens = nonLabelTokens(stripped);

        if (tokens.length === 0) {
            const re = new RegExp(labelScan.source, labelScan.flags);
            let m: RegExpExecArray | null;

            while ((m = re.exec(stripped)) !== null)
                addresses.set(m[1], { ...cur });

            continue;
        }

        const keyword = tokens[0].token;

        if (keyword === '.DATA') {
            let seenKeyword = false;

            for (const t of splitByComma(stripped).flat()) {
                if (t.token === '.DATA') { seenKeyword = true; continue; }

                if (labelDefinition.test(t.token)) {
                    addresses.set(t.token.slice(0, -1), { ...cur });
                } else if (seenKeyword) {
                    for (let w = 0; w < dataWordCount(t.token); w++) cur = nextAddr(cur);
                }
            }
        } else {
            const re = new RegExp(labelScan.source, labelScan.flags);
            let m: RegExpExecArray | null;

            while ((m = re.exec(stripped)) !== null)
                addresses.set(m[1], { ...cur });

            if (keyword === '.ORG') {
                cur = parseTtSS(tokens[1].token);
            } else if (instructionSet.has(keyword)) {
                cur = nextAddr(cur);
            }
        }
    }

    return addresses;
}

// Validate that all label[n] offset references resolve to a valid address.
// Must be called after computeLabelAddresses so the map is complete.
export function validateLabelOffsets(lines: string[], labelAddresses: Map<string, Address>, errors: AssemblyError[]): void {
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripComment(lines[i]);

        for (const t of tokenize(stripped)) {
            const om = labelWithOffset.exec(t.token);

            if (!om) continue;

            const base = labelAddresses.get(om[1]);

            if (!base) continue; // undefined label already reported elsewhere

            const linear = base.track * 64 + base.sector + parseInt(om[2], 10);

            if (linear < 0 || linear > 4095) {
                errors.push({
                    line: i, start: t.col, end: t.col + t.token.length,
                    message: `'${t.token}' resolves to address ${linear} which is outside the valid range [0, 4095]`
                });
            }
        }
    }
}

// Validates a ttSS address (track and sector)
function validateTtSS(token: string): string | null {
    if (!/^\d{4}$/.test(token))
        return `Invalid address '${token}' — expected a 4-digit ttSS (track 0-63, sector 0-63)`;

    const track = parseInt(token.slice(0, 2), 10);
    const sector = parseInt(token.slice(2, 4), 10);

    if (track > 63) return `Track ${track} out of range (0-63)`;
    if (sector > 63) return `Sector ${sector} out of range (0-63)`;

    return null;
}
